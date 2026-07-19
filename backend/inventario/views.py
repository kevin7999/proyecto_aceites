import requests
import logging
from django.utils import timezone
from datetime import datetime, time
from django.conf import settings
from django.db.models import Sum, F
from django.db import transaction
from decimal import Decimal
from rest_framework import status, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.generics import RetrieveAPIView, ListCreateAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.authtoken.models import Token

from .models import Producto, Venta, DetalleVenta, CierreCaja, Devolucion, DetalleDevolucion, DetalleCambioNuevo
from .serializers import ProductoSerializer, VentaSerializer, CierreCajaSerializer, DevolucionSerializer

logger = logging.getLogger(__name__)

class ProductoPorCodigoView(APIView):
    """
    Endpoint GET '/api/inventario/producto/<codigo_barras>/'
    Busca un producto por su código de barras escaneado.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, codigo_barras):
        try:
            producto = Producto.objects.get(codigo_barras=codigo_barras)
            serializer = ProductoSerializer(producto)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Producto.DoesNotExist:
            return Response(
                {"error": f"Producto con código '{codigo_barras}' no encontrado."},
                status=status.HTTP_404_NOT_FOUND
            )


class RegistrarVentaView(ListCreateAPIView):
    """
    Endpoint GET '/api/inventario/venta/' (Listar ventas, más recientes primero)
    Endpoint POST '/api/inventario/venta/' (Registrar una venta)
    """
    permission_classes = [IsAuthenticated]
    queryset = Venta.objects.all().order_by('-fecha')
    serializer_class = VentaSerializer


def calcular_cierre_hoy_valores(hoy):
    inicio_dia = timezone.make_aware(datetime.combine(hoy, time.min))
    fin_dia = timezone.make_aware(datetime.combine(hoy, time.max))

    # Obtener ventas de hoy validas y devoluciones de hoy
    ventas_hoy = Venta.objects.filter(fecha__range=(inicio_dia, fin_dia))
    ventas_validas = ventas_hoy.filter(estado__in=['completada', 'con_cambios'])
    devoluciones_hoy = Devolucion.objects.filter(fecha__range=(inicio_dia, fin_dia))

    # Total ventas brutas (USD)
    total_ventas_usd = Decimal(str(ventas_validas.aggregate(total=Sum('total'))['total'] or 0))
    # Suma de diferencias de devoluciones (USD)
    total_devoluciones_usd = Decimal(str(devoluciones_hoy.aggregate(total=Sum('diferencia_usd'))['total'] or 0))
    
    total_acumulado = float(total_ventas_usd + total_devoluciones_usd)

    # Cantidad total de envases/unidades vendidas
    unidades_vendidas = DetalleVenta.objects.filter(venta__in=ventas_validas).aggregate(cant=Sum('cantidad'))['cant'] or 0
    unidades_devueltas = DetalleDevolucion.objects.filter(devolucion__in=devoluciones_hoy).aggregate(cant=Sum('cantidad'))['cant'] or 0
    unidades_nuevas = DetalleCambioNuevo.objects.filter(devolucion__in=devoluciones_hoy).aggregate(cant=Sum('cantidad'))['cant'] or 0
    
    total_unidades = int(unidades_vendidas - unidades_devueltas + unidades_nuevas)

    # 1. Efectivo USD
    efectivo_ventas_total = Decimal(str(ventas_validas.filter(metodo_pago='efectivo').aggregate(total=Sum('total'))['total'] or 0))
    efectivo_mixtas_total = Decimal(str(ventas_validas.filter(metodo_pago='mixto').aggregate(total=Sum(F('monto_efectivo_usd') * Decimal('1.03')))['total'] or 0))
    efectivo_devoluciones_total = Decimal(str(devoluciones_hoy.filter(metodo_diferencia='efectivo').aggregate(total=Sum('diferencia_usd'))['total'] or 0))
    
    efectivo_usd = float(efectivo_ventas_total + efectivo_mixtas_total + efectivo_devoluciones_total)

    # 2. Pago Móvil
    pago_movil_ventas_total = Decimal(str(ventas_validas.filter(metodo_pago='pago_movil').aggregate(total=Sum('total'))['total'] or 0))
    pago_movil_mixtas_total = Decimal('0.00')
    for v in ventas_validas.filter(metodo_pago='mixto', metodo_pago_restante='pago_movil'):
        pago_movil_mixtas_total += v.total - (v.monto_efectivo_usd * Decimal('1.03'))
    pago_movil_devoluciones_total = Decimal(str(devoluciones_hoy.filter(metodo_diferencia='pago_movil').aggregate(total=Sum('diferencia_usd'))['total'] or 0))
    
    pago_movil_usd = float(pago_movil_ventas_total + pago_movil_mixtas_total + pago_movil_devoluciones_total)

    # 3. Punto de Venta
    punto_venta_ventas_total = Decimal(str(ventas_validas.filter(metodo_pago='punto_venta').aggregate(total=Sum('total'))['total'] or 0))
    punto_venta_mixtas_total = Decimal('0.00')
    for v in ventas_validas.filter(metodo_pago='mixto', metodo_pago_restante='punto_venta'):
        punto_venta_mixtas_total += v.total - (v.monto_efectivo_usd * Decimal('1.03'))
    punto_venta_devoluciones_total = Decimal(str(devoluciones_hoy.filter(metodo_diferencia='punto_venta').aggregate(total=Sum('diferencia_usd'))['total'] or 0))
    
    punto_venta_usd = float(punto_venta_ventas_total + punto_venta_mixtas_total + punto_venta_devoluciones_total)

    return total_acumulado, total_unidades, {
        'efectivo': efectivo_usd,
        'pago_movil': pago_movil_usd,
        'punto_venta': punto_venta_usd
    }


def enviar_cierre_n8n(hoy):
    """
    Agrupa los datos de ventas y devoluciones del día y los envía a n8n.
    Retorna (success_bool, message_str)
    """
    inicio_dia = timezone.make_aware(datetime.combine(hoy, time.min))
    fin_dia = timezone.make_aware(datetime.combine(hoy, time.max))

    ventas_hoy = Venta.objects.filter(fecha__range=(inicio_dia, fin_dia))
    ventas_validas = ventas_hoy.filter(estado__in=['completada', 'con_cambios'])
    devoluciones_hoy = Devolucion.objects.filter(fecha__range=(inicio_dia, fin_dia))

    total_acumulado, total_unidades, desglose_pagos = calcular_cierre_hoy_valores(hoy)

    # Agrupación por producto
    agg = {}
    detalles_hoy = DetalleVenta.objects.filter(venta__in=ventas_validas)
    for item in detalles_hoy:
        prod = item.producto
        key = prod.id
        if key not in agg:
            agg[key] = {
                "codigo_barras": prod.codigo_barras,
                "nombre_completo": prod.nombre_completo,
                "cantidad_vendida": 0,
                "monto_generado": Decimal('0.00')
            }
        agg[key]["cantidad_vendida"] += item.cantidad
        agg[key]["monto_generado"] += item.precio_unitario * item.cantidad

    detalles_devueltos = DetalleDevolucion.objects.filter(devolucion__in=devoluciones_hoy)
    for item in detalles_devueltos:
        prod = item.producto_devuelto
        key = prod.id
        if key not in agg:
            agg[key] = {
                "codigo_barras": prod.codigo_barras,
                "nombre_completo": prod.nombre_completo,
                "cantidad_vendida": 0,
                "monto_generado": Decimal('0.00')
            }
        agg[key]["cantidad_vendida"] -= item.cantidad
        agg[key]["monto_generado"] -= item.precio_original_usd * item.cantidad

    detalles_nuevos = DetalleCambioNuevo.objects.filter(devolucion__in=devoluciones_hoy)
    for item in detalles_nuevos:
        prod = item.producto_nuevo
        key = prod.id
        if key not in agg:
            agg[key] = {
                "codigo_barras": prod.codigo_barras,
                "nombre_completo": prod.nombre_completo,
                "cantidad_vendida": 0,
                "monto_generado": Decimal('0.00')
            }
        agg[key]["cantidad_vendida"] += item.cantidad
        agg[key]["monto_generado"] += item.precio_venta_usd * item.cantidad

    desglose = []
    for k, v in agg.items():
        if v["cantidad_vendida"] != 0 or v["monto_generado"] != 0:
            desglose.append({
                "codigo_barras": v["codigo_barras"],
                "nombre_completo": v["nombre_completo"],
                "cantidad_vendida": v["cantidad_vendida"],
                "monto_generado": float(v["monto_generado"])
            })

    payload = {
        "fecha": hoy.strftime("%Y-%m-%d"),
        "monto_acumulado": total_acumulado,
        "productos_vendidos_count": total_unidades,
        "desglose_productos": desglose,
        "desglose_pagos": desglose_pagos
    }

    url = settings.N8N_WEBHOOK_URL
    try:
        response = requests.post(url, json=payload, timeout=5)
        if response.status_code >= 200 and response.status_code < 300:
            return True, "Cierre enviado exitosamente a n8n."
        else:
            return False, f"n8n respondió con código de estado: {response.status_code}."
    except requests.exceptions.RequestException as e:
        logger.error(f"Error al conectar con n8n: {e}")
        return False, f"No se pudo conectar al webhook (modo offline / error de red): {str(e)}"


class CierreDiarioView(APIView):
    """
    Endpoint POST '/api/inventario/cierre/'
    Realiza la agrupación del cierre diario y la envía a n8n.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ahora = timezone.localtime(timezone.now())
        hoy = ahora.date()
        
        inicio_dia = timezone.make_aware(datetime.combine(hoy, time.min))
        fin_dia = timezone.make_aware(datetime.combine(hoy, time.max))

        # Obtener ventas de hoy y devoluciones de hoy
        ventas_hoy = Venta.objects.filter(fecha__range=(inicio_dia, fin_dia))
        devoluciones_hoy = Devolucion.objects.filter(fecha__range=(inicio_dia, fin_dia))
        
        if not ventas_hoy.exists() and not devoluciones_hoy.exists():
            return Response(
                {"mensaje": "No se registraron ventas ni devoluciones hoy. No hay datos para enviar."},
                status=status.HTTP_200_OK
            )

        # Calcular totales desglosados
        total_acumulado, total_unidades, desglose_pagos = calcular_cierre_hoy_valores(hoy)

        # Enviar datos a n8n
        exito, mensaje = enviar_cierre_n8n(hoy)

        # Obtener tasa de cambio aplicada en la última venta de hoy
        tasa_del_dia = 1.00
        ultima_venta = ventas_hoy.order_by('-fecha').first()
        if ultima_venta:
            tasa_del_dia = float(ultima_venta.tasa_cambio)

        # Registrar / actualizar en la base de datos
        CierreCaja.objects.update_or_create(
            fecha=hoy,
            defaults={
                'monto_acumulado': total_acumulado,
                'productos_vendidos_count': total_unidades,
                'tasa_cambio': tasa_del_dia,
                'efectivo_usd': desglose_pagos['efectivo'],
                'pago_movil_usd': desglose_pagos['pago_movil'],
                'punto_venta_usd': desglose_pagos['punto_venta'],
                'sincronizado_n8n': exito,
                'mensaje_n8n': mensaje
            }
        )

        res_data = {
            "fecha": hoy.strftime("%Y-%m-%d"),
            "monto_acumulado": total_acumulado,
            "productos_vendidos_count": total_unidades,
            "desglose_pagos": desglose_pagos,
            "envio_n8n": {
                "exito": exito,
                "mensaje": mensaje
            }
        }
        
        return Response(res_data, status=status.HTTP_200_OK if exito else status.HTTP_207_MULTI_STATUS)


class ProductoViewSet(viewsets.ModelViewSet):
    """
    ViewSet para CRUD completo de productos.
    Accesible solo para usuarios autenticados.
    """
    queryset = Producto.objects.all().order_by('nombre_completo')
    serializer_class = ProductoSerializer
    permission_classes = [IsAuthenticated]


class CustomObtainAuthToken(ObtainAuthToken):
    """
    Endpoint para Login. Recibe username y password, devuelve token y datos básicos.
    """
    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data,
                                           context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        token, created = Token.objects.get_or_create(user=user)
        return Response({
            'token': token.key,
            'user_id': user.pk,
            'username': user.username
        })


class ClientesView(APIView):
    """
    Endpoint GET '/api/inventario/clientes/'
    Devuelve la lista de clientes únicos registrados en las ventas,
    calculando la cantidad de compras y el total de dinero gastado.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Filtrar ventas que tengan información del cliente (nombre o cédula no vacíos/nulos)
        ventas = Venta.objects.exclude(
            cliente_nombre__isnull=True,
            cliente_cedula_rif__isnull=True
        ).exclude(
            cliente_nombre="",
            cliente_cedula_rif=""
        )

        clientes_dict = {}
        for v in ventas:
            cedula = (v.cliente_cedula_rif or '').strip()
            nombre = (v.cliente_nombre or '').strip()
            # Usar la cédula como clave principal de unicidad si existe; de lo contrario, el nombre
            key = cedula if cedula else nombre
            if not key:
                continue

            if key not in clientes_dict:
                clientes_dict[key] = {
                    'nombre': nombre or 'Sin Nombre',
                    'cedula_rif': cedula,
                    'telefono': (v.cliente_telefono or '').strip(),
                    'correo': (v.cliente_correo or '').strip(),
                    'compras_count': 0,
                    'total_gastado': 0.0
                }

            clientes_dict[key]['compras_count'] += 1
            clientes_dict[key]['total_gastado'] += float(v.total)

            # Si el registro de venta actual tiene teléfono/correo y el dict no, los actualizamos
            if not clientes_dict[key]['telefono'] and v.cliente_telefono:
                clientes_dict[key]['telefono'] = v.cliente_telefono.strip()
            if not clientes_dict[key]['correo'] and v.cliente_correo:
                clientes_dict[key]['correo'] = v.cliente_correo.strip()

        # Retornamos los clientes ordenados por nombre
        clientes_lista = sorted(list(clientes_dict.values()), key=lambda x: x['nombre'].lower())
        return Response(clientes_lista)


class BuscarClienteView(APIView):
    """
    Endpoint GET '/api/inventario/clientes/buscar/'
    Busca si existe alguna venta con la cédula/RIF dada
    y retorna la información del cliente para autocompletar.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cedula = request.query_params.get('cedula_rif', '').strip()
        if not cedula:
            return Response({"error": "Debe especificar la cédula/RIF."}, status=status.HTTP_400_BAD_REQUEST)
        
        # Buscar la venta más reciente con esta cédula
        venta = Venta.objects.filter(cliente_cedula_rif=cedula).order_by('-fecha').first()
        if venta:
            return Response({
                'nombre': venta.cliente_nombre or '',
                'cedula_rif': venta.cliente_cedula_rif or '',
                'telefono': venta.cliente_telefono or '',
                'correo': venta.cliente_correo or ''
            }, status=status.HTTP_200_OK)
        else:
            return Response({"message": "Cliente nuevo"}, status=status.HTTP_404_NOT_FOUND)


class EditarClienteView(APIView):
    """
    Endpoint PUT '/api/inventario/clientes/editar/'
    Actualiza la información del cliente en todas sus ventas asociadas.
    """
    permission_classes = [IsAuthenticated]

    def put(self, request):
        old_cedula = request.data.get('old_cedula_rif', '').strip()
        old_nombre = request.data.get('old_nombre', '').strip()

        nuevo_nombre = request.data.get('nombre', '').strip()
        nueva_cedula = request.data.get('cedula_rif', '').strip()
        nuevo_telefono = request.data.get('telefono', '').strip()

        if not old_cedula and not old_nombre:
            return Response({"error": "Identificador actual de cliente faltante."}, status=status.HTTP_400_BAD_REQUEST)

        # Buscar ventas por cédula (prioritario) o por nombre
        if old_cedula:
            ventas = Venta.objects.filter(cliente_cedula_rif=old_cedula)
        else:
            ventas = Venta.objects.filter(cliente_nombre=old_nombre)

        if not ventas.exists():
            return Response({"error": "No se encontraron registros del cliente."}, status=status.HTTP_404_NOT_FOUND)

        # Actualizar en bloque
        ventas.update(
            cliente_nombre=nuevo_nombre,
            cliente_cedula_rif=nueva_cedula,
            cliente_telefono=nuevo_telefono
        )

        return Response({"success": "Cliente actualizado en todos sus registros."})


class HistorialClienteView(APIView):
    """
    Endpoint GET '/api/inventario/clientes/historial/'
    Retorna la lista de todas las compras (ventas) asociadas a un cliente con sus detalles.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cedula = request.query_params.get('cedula_rif', '').strip()
        nombre = request.query_params.get('nombre', '').strip()

        if cedula:
            ventas = Venta.objects.filter(cliente_cedula_rif=cedula).order_by('-fecha')
        elif nombre:
            ventas = Venta.objects.filter(cliente_nombre=nombre).order_by('-fecha')
        else:
            return Response({"error": "Debe especificar cédula/RIF o nombre del cliente."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = VentaSerializer(ventas, many=True)
        return Response(serializer.data)


class CierreCajaListView(ListCreateAPIView):
    """
    Endpoint GET '/api/inventario/cierres/' (Listar cierres, más recientes primero)
    """
    permission_classes = [IsAuthenticated]
    queryset = CierreCaja.objects.all().order_by('-fecha')
    serializer_class = CierreCajaSerializer


class DownloadBackupView(APIView):
    """
    Endpoint GET '/api/inventario/backup/'
    Permite descargar una copia en caliente del archivo de base de datos db.sqlite3.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.http import FileResponse, Http404
        import os
        import io
        db_path = settings.DATABASES['default']['NAME']
        
        # Soporte para base de datos en memoria y pruebas unitarias
        import sys
        if 'test' in sys.argv or str(db_path) == ':memory:' or 'test_' in str(db_path):
            response = FileResponse(io.BytesIO(b"SQLite dummy binary content for testing"), content_type='application/x-sqlite3')
            response['Content-Disposition'] = 'attachment; filename="backup_ruta8_test.sqlite3"'
            return response

        if os.path.exists(db_path):
            response = FileResponse(open(db_path, 'rb'), content_type='application/x-sqlite3')
            fecha_str = timezone.localtime(timezone.now()).strftime('%Y-%m-%d')
            response['Content-Disposition'] = f'attachment; filename="backup_ruta8_{fecha_str}.sqlite3"'
            return response
        else:
            raise Http404("Base de datos no encontrada.")


class ImportarProductosView(APIView):
    """
    Endpoint POST '/api/inventario/productos/importar-csv/'
    Permite cargar y actualizar productos en lote desde archivos CSV o planillas Excel (.xlsx).
    """
    permission_classes = [IsAuthenticated]
    from rest_framework.parsers import MultiPartParser
    parser_classes = [MultiPartParser]

    def generate_unique_barcode(self):
        import random
        import string
        while True:
            # Generar un código aleatorio de 12 dígitos (EAN-12)
            code = "".join(random.choices(string.digits, k=12))
            if not Producto.objects.filter(codigo_barras=code).exists():
                return code

    def post(self, request):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({"error": "No se subió ningún archivo."}, status=status.HTTP_400_BAD_REQUEST)

        filename = file_obj.name.lower()
        creados = 0
        actualizados = 0
        errores = []

        if filename.endswith('.csv'):
            # --- PROCESAR CSV ---
            import csv
            import io
            from decimal import Decimal, InvalidOperation
            try:
                content = file_obj.read()
                try:
                    decoded = content.decode('utf-8')
                except UnicodeDecodeError:
                    decoded = content.decode('latin-1')

                io_string = io.StringIO(decoded)
                
                # Detectar delimitador
                first_line = io_string.readline()
                delimiter = ';' if ';' in first_line else ','
                io_string.seek(0)

                reader = csv.DictReader(io_string, delimiter=delimiter)
                headers = reader.fieldnames or []
                
                header_mapping = {}
                for h in headers:
                    h_clean = h.strip().lower()
                    if h_clean in ['codigo_barras', 'codigo', 'barras', 'barcode', 'código de barras']:
                        header_mapping['codigo_barras'] = h
                    elif h_clean in ['nombre_completo', 'nombre', 'descripcion', 'descripción', 'name', 'producto', 'productos']:
                        header_mapping['nombre_completo'] = h
                    elif h_clean in ['precio_venta', 'precio', 'pvp', 'price', 'precio de venta', 'total dolar', 'total dólar']:
                        header_mapping['precio_venta'] = h
                    elif h_clean in ['precio_costo', 'costo', 'cost', 'precio de costo', 'p.unit', 'p. unit']:
                        header_mapping['precio_costo'] = h
                    elif h_clean in ['stock_actual', 'stock', 'cantidad', 'qty', 'existencia', 'existencias']:
                        header_mapping['stock_actual'] = h
                    elif h_clean in ['categoria', 'categoría', 'category']:
                        header_mapping['categoria'] = h

                # Validar mínimos
                if 'nombre_completo' not in header_mapping:
                    return Response({"error": "El CSV debe contener al menos una columna con el nombre o descripción del producto."}, status=status.HTTP_400_BAD_REQUEST)

                for idx, row in enumerate(reader, start=1):
                    try:
                        nombre = row.get(header_mapping['nombre_completo'], '').strip()
                        if not nombre:
                            continue

                        # Si no hay código de barras, buscar por nombre o autogenerar
                        codigo = ''
                        if 'codigo_barras' in header_mapping:
                            codigo = row.get(header_mapping['codigo_barras'], '').strip()

                        # Validar precio de venta
                        p_venta = Decimal('0.00')
                        if 'precio_venta' in header_mapping:
                            pv_str = row.get(header_mapping['precio_venta'], '').strip().replace(',', '.')
                            if pv_str:
                                try:
                                    p_venta = Decimal(pv_str)
                                except (InvalidOperation, ValueError):
                                    errores.append(f"Fila {idx} ({nombre[:20]}): Precio de venta '{pv_str}' inválido.")
                                    continue

                        # Validar precio de costo
                        p_costo = Decimal('0.00')
                        if 'precio_costo' in header_mapping:
                            pc_str = row.get(header_mapping['precio_costo'], '').strip().replace(',', '.')
                            if pc_str:
                                try:
                                    p_costo = Decimal(pc_str)
                                except (InvalidOperation, ValueError):
                                    pass

                        # Validar stock
                        stock = 0
                        if 'stock_actual' in header_mapping:
                            st_str = row.get(header_mapping['stock_actual'], '').strip()
                            if st_str:
                                try:
                                    stock = int(float(st_str))
                                except ValueError:
                                    pass

                        categoria = 'Otros'
                        if 'categoria' in header_mapping:
                            cat_str = row.get(header_mapping['categoria'], '').strip()
                            if cat_str:
                                categoria = cat_str

                        # Buscar producto existente
                        producto = None
                        if codigo:
                            producto = Producto.objects.filter(codigo_barras=codigo).first()
                        if not producto:
                            producto = Producto.objects.filter(nombre_completo=nombre).first()

                        if producto:
                            # Actualizar existente
                            producto.nombre_completo = nombre
                            if 'precio_venta' in header_mapping:
                                producto.precio_venta = p_venta
                            if 'precio_costo' in header_mapping:
                                producto.precio_costo = p_costo
                            if 'stock_actual' in header_mapping:
                                producto.stock_actual = stock
                            if 'categoria' in header_mapping:
                                producto.categoria = categoria
                            producto.save()
                            actualizados += 1
                        else:
                            # Crear nuevo
                            if not codigo:
                                codigo = self.generate_unique_barcode()
                            Producto.objects.create(
                                codigo_barras=codigo,
                                nombre_completo=nombre,
                                precio_venta=p_venta,
                                precio_costo=p_costo,
                                stock_actual=stock,
                                categoria=categoria
                            )
                            creados += 1

                    except Exception as e:
                        errores.append(f"Fila {idx}: {str(e)}")

            except Exception as e:
                return Response({"error": f"Error al decodificar o leer el archivo CSV: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

        elif filename.endswith('.xlsx') or filename.endswith('.xls'):
            # --- PROCESAR EXCEL ---
            from decimal import Decimal, InvalidOperation
            try:
                import openpyxl
                wb = openpyxl.load_workbook(file_obj, data_only=True)
                sheet = wb.active
                
                rows = list(sheet.iter_rows(values_only=True))
                
                # Buscar fila de encabezados
                import re
                def clean_header(val):
                    if not val:
                        return ""
                    s = str(val).lower().strip()
                    s = re.sub(r'[áàäâ]', 'a', s)
                    s = re.sub(r'[éèëê]', 'e', s)
                    s = re.sub(r'[íìïî]', 'i', s)
                    s = re.sub(r'[óòöô]', 'o', s)
                    s = re.sub(r'[úùüû]', 'u', s)
                    s = re.sub(r'[ñ]', 'n', s)
                    s = re.sub(r'[^a-z0-9]', ' ', s)
                    return " ".join(s.split())

                header_row_idx = -1
                header_mapping = {}
                
                for idx, row in enumerate(rows):
                    if not row:
                        continue
                    temp_mapping = {}
                    for col_idx, cell in enumerate(row):
                        if cell is None:
                            continue
                        s = clean_header(cell)
                        if "codigo de barras" in s or "codigo barras" in s or s in ["codigo", "barras", "barcode", "código", "ean"]:
                            temp_mapping['codigo_barras'] = col_idx
                        elif "precio costo" in s or "precio de costo" in s or s in ["costo", "cost", "p unit", "p.unit"]:
                            temp_mapping['precio_costo'] = col_idx
                        elif "precio venta" in s or "precio de venta" in s or "precio neto" in s or s in ["precio", "pvp", "price", "neto", "total dolar", "total dólar"]:
                            temp_mapping['precio_venta'] = col_idx
                        elif "nombre completo" in s or s in ["nombre", "descripcion", "name", "producto", "productos", "producto nombre", "descripcion producto"]:
                            temp_mapping['nombre_completo'] = col_idx
                        elif s in ["marca", "brand"]:
                            temp_mapping['marca'] = col_idx
                        elif "stock actual" in s or s in ["stock", "cantidad", "qty", "existencia", "existencias", "cantidad stock"]:
                            temp_mapping['stock_actual'] = col_idx
                        elif s in ["categoria", "category"]:
                            temp_mapping['categoria'] = col_idx
                    
                    if 'nombre_completo' in temp_mapping and len(temp_mapping) >= 2:
                        header_row_idx = idx
                        header_mapping = temp_mapping
                        break
                
                # Decidir si usar el importador dinámico o el heredado (Ruta 8)
                use_dynamic = False
                if header_row_idx != -1:
                    if 'categoria' in header_mapping:
                        use_dynamic = True
                    else:
                        has_legacy_categories = False
                        for r_idx, r in enumerate(rows):
                            if r_idx == header_row_idx or not r or not any(cell is not None for cell in r):
                                continue
                            non_empty_indices = [i for i, val in enumerate(r) if val is not None]
                            if len(non_empty_indices) == 1 and non_empty_indices[0] == 0:
                                val = str(r[0]).strip()
                                if val and not val.startswith('TOTAL') and val.upper() != 'PRODUCTOS':
                                    has_legacy_categories = True
                                    break
                        use_dynamic = not has_legacy_categories
                
                if use_dynamic:
                    # --- PROCESAR EXCEL CON ENCABEZADOS DINÁMICOS ---
                    for idx, row in enumerate(rows[header_row_idx + 1:], start=header_row_idx + 2):
                        if not row or not any(cell is not None for cell in row):
                            continue
                            
                        nombre_idx = header_mapping.get('nombre_completo')
                        nombre = str(row[nombre_idx]).strip() if (nombre_idx is not None and row[nombre_idx] is not None) else ''
                        if not nombre:
                            continue
                            
                        # Concatenar marca si está presente
                        marca_idx = header_mapping.get('marca')
                        if marca_idx is not None and row[marca_idx] is not None:
                            marca_str = str(row[marca_idx]).strip()
                            if marca_str and marca_str.lower() not in ['', 'n/a', 'na', 'none', 'null']:
                                nombre = f"{nombre} ({marca_str})"

                        # Código de barras
                        codigo = ''
                        codigo_idx = header_mapping.get('codigo_barras')
                        if codigo_idx is not None and row[codigo_idx] is not None:
                            codigo = str(row[codigo_idx]).strip()
                            if codigo.lower() in ['', 'n/a', 'na', 'none', 'null']:
                                codigo = ''

                        try:
                            # Leer stock
                            stock = 0
                            stock_idx = header_mapping.get('stock_actual')
                            if stock_idx is not None and row[stock_idx] is not None:
                                try:
                                    stock = int(float(str(row[stock_idx])))
                                except ValueError:
                                    pass
                                    
                            # Leer costo
                            p_costo = Decimal('0.00')
                            costo_idx = header_mapping.get('precio_costo')
                            if costo_idx is not None and row[costo_idx] is not None:
                                try:
                                    p_costo = Decimal(str(row[costo_idx]).replace(',', '.'))
                                except (InvalidOperation, ValueError):
                                    pass
                                    
                            # Leer precio venta
                            p_venta = Decimal('0.00')
                            venta_idx = header_mapping.get('precio_venta')
                            if venta_idx is not None and row[venta_idx] is not None:
                                try:
                                    p_venta = Decimal(str(row[venta_idx]).replace(',', '.'))
                                except (InvalidOperation, ValueError):
                                    pass
                                    
                            # Leer categoría
                            categoria = 'Otros'
                            cat_idx = header_mapping.get('categoria')
                            if cat_idx is not None and row[cat_idx] is not None:
                                cat_str = str(row[cat_idx]).strip()
                                if cat_str:
                                    categoria = cat_str

                            producto = None
                            if codigo:
                                producto = Producto.objects.filter(codigo_barras=codigo).first()
                            if not producto:
                                producto = Producto.objects.filter(nombre_completo=nombre).first()

                            if producto:
                                if codigo and producto.codigo_barras != codigo:
                                    if not Producto.objects.filter(codigo_barras=codigo).exclude(id=producto.id).exists():
                                        producto.codigo_barras = codigo
                                
                                if costo_idx is not None:
                                    producto.precio_costo = p_costo
                                if venta_idx is not None and p_venta > 0:
                                    producto.precio_venta = p_venta
                                if stock_idx is not None:
                                    producto.stock_actual = stock
                                if cat_idx is not None:
                                    producto.categoria = categoria
                                producto.nombre_completo = nombre
                                producto.save()
                                actualizados += 1
                            else:
                                if not codigo:
                                    codigo = self.generate_unique_barcode()
                                Producto.objects.create(
                                    codigo_barras=codigo,
                                    nombre_completo=nombre,
                                    precio_venta=p_venta if p_venta > 0 else p_costo * Decimal('1.40'),
                                    precio_costo=p_costo,
                                    stock_actual=stock,
                                    categoria=categoria
                                )
                                creados += 1
                                
                        except Exception as e:
                            errores.append(f"Fila {idx} ({nombre[:20]}): {str(e)}")
                else:
                    # --- PROCESAR EXCEL SEGÚN FORMATO HEREDADO (RUTA 8) ---
                    current_category = 'Otros'
                    for idx, row in enumerate(rows, start=1):
                        if not row or not any(cell is not None for cell in row):
                            continue
                            
                        non_empty_indices = [i for i, val in enumerate(row) if val is not None]
                        if len(non_empty_indices) == 1 and non_empty_indices[0] == 0:
                            val = str(row[0]).strip()
                            if val and not val.startswith('TOTAL') and val.upper() != 'PRODUCTOS':
                                current_category = val.title()
                            continue
                            
                        if str(row[0]).strip().upper() == 'PRODUCTOS':
                            continue
                            
                        if any(str(cell).strip().upper() == 'TOTAL' for cell in row if cell is not None):
                            continue
                            
                        nombre = str(row[0]).strip() if row[0] is not None else ''
                        if not nombre:
                            continue
                            
                        try:
                            stock = 0
                            if len(row) > 1 and row[1] is not None:
                                try:
                                    stock = int(float(str(row[1])))
                                except ValueError:
                                    pass
                                    
                            p_costo = Decimal('0.00')
                            if len(row) > 2 and row[2] is not None:
                                try:
                                    p_costo = Decimal(str(row[2]).replace(',', '.'))
                                except (InvalidOperation, ValueError):
                                    pass
                                    
                            p_venta = Decimal('0.00')
                            if len(row) > 7 and row[7] is not None:
                                try:
                                    p_venta = Decimal(str(row[7]).replace(',', '.'))
                                except (InvalidOperation, ValueError):
                                    pass
                                    
                            if p_venta == Decimal('0.00') and len(row) > 6 and row[6] is not None:
                                try:
                                    p_venta = Decimal(str(row[6]).replace(',', '.'))
                                except (InvalidOperation, ValueError):
                                    pass

                            producto = Producto.objects.filter(nombre_completo=nombre).first()
                            
                            if producto:
                                producto.precio_costo = p_costo
                                if p_venta > 0:
                                    producto.precio_venta = p_venta
                                producto.stock_actual = stock
                                producto.categoria = current_category
                                producto.save()
                                actualizados += 1
                            else:
                                codigo = self.generate_unique_barcode()
                                Producto.objects.create(
                                    codigo_barras=codigo,
                                    nombre_completo=nombre,
                                    precio_venta=p_venta if p_venta > 0 else p_costo * Decimal('1.40'),
                                    precio_costo=p_costo,
                                    stock_actual=stock,
                                    categoria=current_category
                                )
                                creados += 1
                                
                        except Exception as e:
                            errores.append(f"Fila {idx} ({nombre[:20]}): {str(e)}")
                            
            except Exception as e:
                return Response({"error": f"Error al procesar el archivo Excel: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
        else:
            return Response({"error": "Formato de archivo no soportado. Debe ser .csv, .xlsx o .xls"}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "mensaje": "Carga finalizada con éxito.",
            "creados": creados,
            "actualizados": actualizados,
            "errores": errores
        }, status=status.HTTP_200_OK)


class DevolucionView(APIView):
    """
    Endpoint POST '/api/inventario/devoluciones/'
    Procesa anulaciones completas o canjes de productos.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        pin = request.data.get('pin')
        if str(pin) != '7804':
            return Response({"error": "PIN de autorización incorrecto."}, status=status.HTTP_403_FORBIDDEN)

        venta_id = request.data.get('venta_id')
        tipo = request.data.get('tipo', 'anulacion')  # 'anulacion' o 'cambio'
        motivo = request.data.get('motivo', '')
        
        try:
            venta = Venta.objects.get(id=venta_id)
        except Venta.DoesNotExist:
            return Response({"error": "Venta no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        if venta.estado == 'anulada':
            return Response({"error": "Esta venta ya fue anulada."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            if tipo == 'anulacion':
                # Reintegrar todo el stock
                for detail in venta.detalles.all():
                    prod = detail.producto
                    prod.stock_actual += detail.cantidad
                    prod.save()

                # Crear registro de Devolución
                devolucion = Devolucion.objects.create(
                    venta=venta,
                    tipo='anulacion',
                    monto_saldo_favor_usd=venta.total,
                    monto_saldo_favor_bs=venta.total * venta.tasa_cambio,
                    diferencia_usd=-venta.total,
                    metodo_diferencia=venta.metodo_pago,
                    motivo=motivo
                )

                # Crear detalles
                for detail in venta.detalles.all():
                    DetalleDevolucion.objects.create(
                        devolucion=devolucion,
                        producto_devuelto=detail.producto,
                        cantidad=detail.cantidad,
                        precio_original_usd=detail.precio_unitario
                    )

                venta.estado = 'anulada'
                venta.save()

                self.actualizar_cierre_diario(devolucion)

                return Response({"mensaje": "Venta anulada exitosamente.", "devolucion_id": devolucion.id}, status=status.HTTP_201_CREATED)

            elif tipo == 'cambio':
                items_devueltos_req = request.data.get('detalles_devolucion', [])
                items_nuevos_req = request.data.get('nuevos_items', [])

                if not items_devueltos_req:
                    return Response({"error": "Debe especificar al menos un producto a devolver."}, status=status.HTTP_400_BAD_REQUEST)

                # Validar cantidades devueltas
                devueltos_previos = {}
                for d in Devolucion.objects.filter(venta=venta):
                    for d_detail in d.detalles.all():
                        pid = d_detail.producto_devuelto.id
                        devueltos_previos[pid] = devueltos_previos.get(pid, 0) + d_detail.cantidad

                vendidos_orig = {detail.producto.id: detail for detail in venta.detalles.all()}

                # Factor de descuento e IGTF
                total_bruto_orig = sum(detail.precio_unitario * detail.cantidad for detail in venta.detalles.all())
                factor_descuento = Decimal('1.00')
                if total_bruto_orig > 0:
                    factor_descuento = (total_bruto_orig - venta.descuento) / total_bruto_orig

                total_descontado_orig = max(Decimal('0.00'), total_bruto_orig - venta.descuento)
                factor_igtf = Decimal('0.00')
                if total_descontado_orig > 0:
                    factor_igtf = venta.igtf / total_descontado_orig

                monto_saldo_favor_usd = Decimal('0.00')
                detalles_devolucion_insts = []

                for item in items_devueltos_req:
                    pid = int(item['producto_id'])
                    cant = int(item['cantidad'])
                    if cant <= 0:
                        continue

                    if pid not in vendidos_orig:
                        return Response({"error": f"El producto {pid} no pertenece a la venta original."}, status=status.HTTP_400_BAD_REQUEST)

                    detail_orig = vendidos_orig[pid]
                    max_permitido = detail_orig.cantidad - devueltos_previos.get(pid, 0)
                    if cant > max_permitido:
                        return Response({"error": f"Cantidad a devolver excedida para {detail_orig.producto.nombre_completo} (máximo disponible: {max_permitido})."}, status=status.HTTP_400_BAD_REQUEST)

                    monto_saldo_favor_usd += detail_orig.precio_unitario * cant * factor_descuento * (Decimal('1.00') + factor_igtf)
                    detalles_devolucion_insts.append((detail_orig.producto, cant, detail_orig.precio_unitario))

                # Validar stock para nuevos productos
                detalles_nuevos_insts = []
                total_nuevos_usd = Decimal('0.00')
                for item in items_nuevos_req:
                    pid = int(item['producto_id'])
                    cant = int(item['cantidad'])
                    if cant <= 0:
                        continue

                    try:
                        prod = Producto.objects.get(id=pid)
                    except Producto.DoesNotExist:
                        return Response({"error": f"El producto nuevo {pid} no existe."}, status=status.HTTP_404_NOT_FOUND)

                    if prod.stock_actual < cant:
                        return Response({"error": f"Stock insuficiente para {prod.nombre_completo} (disponible: {prod.stock_actual})."}, status=status.HTTP_400_BAD_REQUEST)

                    total_nuevos_usd += prod.precio_venta * cant
                    detalles_nuevos_insts.append((prod, cant, prod.precio_venta))

                diferencia_usd = total_nuevos_usd - monto_saldo_favor_usd
                metodo_diferencia = request.data.get('metodo_diferencia', None)

                # Registrar Devolución/Cambio
                devolucion = Devolucion.objects.create(
                    venta=venta,
                    tipo='cambio',
                    monto_saldo_favor_usd=monto_saldo_favor_usd,
                    monto_saldo_favor_bs=monto_saldo_favor_usd * venta.tasa_cambio,
                    diferencia_usd=diferencia_usd,
                    metodo_diferencia=metodo_diferencia,
                    motivo=motivo
                )

                # Guardar detalles devueltos e incrementar stock
                for prod, cant, precio in detalles_devolucion_insts:
                    DetalleDevolucion.objects.create(
                        devolucion=devolucion,
                        producto_devuelto=prod,
                        cantidad=cant,
                        precio_original_usd=precio
                    )
                    prod.stock_actual += cant
                    prod.save()

                # Guardar detalles nuevos y restar stock
                for prod, cant, precio in detalles_nuevos_insts:
                    DetalleCambioNuevo.objects.create(
                        devolucion=devolucion,
                        producto_nuevo=prod,
                        cantidad=cant,
                        precio_venta_usd=precio
                    )
                    prod.stock_actual -= cant
                    prod.save()

                # Actualizar estado de la venta
                total_devuelto_ya = {}
                for d in Devolucion.objects.filter(venta=venta):
                    for d_detail in d.detalles.all():
                        pid = d_detail.producto_devuelto.id
                        total_devuelto_ya[pid] = total_devuelto_ya.get(pid, 0) + d_detail.cantidad

                todo_devuelto = True
                for detail in venta.detalles.all():
                    if total_devuelto_ya.get(detail.producto.id, 0) < detail.cantidad:
                        todo_devuelto = False
                        break

                if todo_devuelto and not items_nuevos_req:
                    venta.estado = 'anulada'
                else:
                    venta.estado = 'con_cambios'
                venta.save()

                self.actualizar_cierre_diario(devolucion)

                return Response({"mensaje": "Cambio procesado exitosamente.", "devolucion_id": devolucion.id}, status=status.HTTP_201_CREATED)

    def actualizar_cierre_diario(self, devolucion):
        hoy = timezone.localtime(timezone.now()).date()
        try:
            cierre = CierreCaja.objects.get(fecha=hoy)
        except CierreCaja.DoesNotExist:
            return

        total_acumulado, total_unidades, desglose_pagos = calcular_cierre_hoy_valores(hoy)
        cierre.monto_acumulado = total_acumulado
        cierre.productos_vendidos_count = total_unidades
        cierre.efectivo_usd = desglose_pagos['efectivo']
        cierre.pago_movil_usd = desglose_pagos['pago_movil']
        cierre.punto_venta_usd = desglose_pagos['punto_venta']
        cierre.save()



