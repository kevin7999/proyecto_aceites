import requests
import logging
from django.utils import timezone
from datetime import datetime, time
from django.conf import settings
from django.db.models import Sum, F
from rest_framework import status, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.generics import RetrieveAPIView, CreateAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.authtoken.models import Token

from .models import Producto, Venta, DetalleVenta
from .serializers import ProductoSerializer, VentaSerializer

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


class RegistrarVentaView(CreateAPIView):
    """
    Endpoint POST '/api/inventario/venta/'
    Registra una venta con sus detalles y descuenta el stock de manera atómica.
    """
    permission_classes = [IsAuthenticated]
    queryset = Venta.objects.all()
    serializer_class = VentaSerializer


def enviar_cierre_n8n(ventas_hoy, fecha_cierre):
    """
    Agrupa los datos de ventas del día actual y los envía a n8n.
    Retorna (success_bool, message_str)
    """
    # Suma total acumulada
    total_acumulado = ventas_hoy.aggregate(total=Sum('total'))['total'] or 0
    total_acumulado = float(total_acumulado)

    # Detalle de todos los productos vendidos
    detalles_hoy = DetalleVenta.objects.filter(venta__in=ventas_hoy)
    
    # Cantidad total de envases/unidades vendidas
    total_unidades = detalles_hoy.aggregate(cant=Sum('cantidad'))['cant'] or 0
    
    # Agrupación por producto
    productos_vendidos_agg = (
        detalles_hoy
        .values('producto__codigo_barras', 'producto__nombre_completo')
        .annotate(
            cantidad_total=Sum('cantidad'),
            monto_total=Sum(F('cantidad') * F('precio_unitario'))
        )
    )

    desglose = []
    for item in productos_vendidos_agg:
        desglose.append({
            "codigo_barras": item['producto__codigo_barras'],
            "nombre_completo": item['producto__nombre_completo'],
            "cantidad_vendida": item['cantidad_total'],
            "monto_generado": float(item['monto_total'])
        })

    # Desglose de pagos por método
    desglose_pagos = {
        'efectivo': float(ventas_hoy.filter(metodo_pago='efectivo').aggregate(total=Sum('total'))['total'] or 0),
        'pago_movil': float(ventas_hoy.filter(metodo_pago='pago_movil').aggregate(total=Sum('total'))['total'] or 0),
        'punto_venta': float(ventas_hoy.filter(metodo_pago='punto_venta').aggregate(total=Sum('total'))['total'] or 0)
    }

    payload = {
        "fecha": fecha_cierre.strftime("%Y-%m-%d"),
        "monto_acumulado": total_acumulado,
        "productos_vendidos_count": total_unidades,
        "desglose_productos": desglose,
        "desglose_pagos": desglose_pagos
    }

    url = settings.N8N_WEBHOOK_URL
    try:
        # Enviar petición con timeout corto (5s) para no bloquear el hilo si está offline
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
        # Obtener rango del día local
        ahora = timezone.localtime(timezone.now())
        hoy = ahora.date()
        
        inicio_dia = timezone.make_aware(datetime.combine(hoy, time.min))
        fin_dia = timezone.make_aware(datetime.combine(hoy, time.max))

        # Obtener ventas de hoy
        ventas_hoy = Venta.objects.filter(fecha__range=(inicio_dia, fin_dia))
        
        if not ventas_hoy.exists():
            return Response(
                {"mensaje": "No se registraron ventas en el día de hoy. No hay datos para enviar."},
                status=status.HTTP_200_OK
            )

        # Enviar datos a n8n
        exito, mensaje = enviar_cierre_n8n(ventas_hoy, hoy)
        
        # Calcular totales para devolver en la respuesta HTTP
        total_acumulado = float(ventas_hoy.aggregate(total=Sum('total'))['total'] or 0)
        total_unidades = DetalleVenta.objects.filter(venta__in=ventas_hoy).aggregate(cant=Sum('cantidad'))['cant'] or 0

        # Desglose de pagos por método
        desglose_pagos = {
            'efectivo': float(ventas_hoy.filter(metodo_pago='efectivo').aggregate(total=Sum('total'))['total'] or 0),
            'pago_movil': float(ventas_hoy.filter(metodo_pago='pago_movil').aggregate(total=Sum('total'))['total'] or 0),
            'punto_venta': float(ventas_hoy.filter(metodo_pago='punto_venta').aggregate(total=Sum('total'))['total'] or 0)
        }

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


