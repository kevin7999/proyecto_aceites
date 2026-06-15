from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from unittest.mock import patch

from inventario.models import Producto, Venta, DetalleVenta
from inventario.views import enviar_cierre_n8n

class InventarioAPITests(APITestCase):

    def setUp(self):
        # Crear usuario y token
        self.user = User.objects.create_superuser(
            username="testuser", password="testpassword", email=""
        )
        self.token = Token.objects.create(user=self.user)
        
        # Por defecto, autenticar al cliente de pruebas
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + self.token.key)

        # Crear productos de prueba
        self.producto_aceite = Producto.objects.create(
            codigo_barras="11111",
            nombre_completo="Aceite Inca 20W50 Mineral 1L",
            precio_venta=150.00,
            stock_actual=10
        )
        self.producto_filtro = Producto.objects.create(
            codigo_barras="22222",
            nombre_completo="Filtro de Aceite Millard ML-3614",
            precio_venta=85.00,
            stock_actual=5
        )

    def test_login_exitoso(self):
        """Probar que un login con credenciales correctas retorna el token."""
        # Desautenticar el cliente para simular petición limpia
        self.client.credentials()
        url = reverse('login')
        payload = {"username": "testuser", "password": "testpassword"}
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['token'], self.token.key)
        self.assertEqual(response.data['username'], 'testuser')

    def test_login_fallido(self):
        """Probar que un login con credenciales incorrectas retorna 400."""
        self.client.credentials()
        url = reverse('login')
        payload = {"username": "testuser", "password": "wrongpassword"}
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_obtener_producto_por_codigo(self):
        """Probar que se obtiene el producto correcto al consultar su código de barras."""
        url = reverse('producto-por-codigo', kwargs={'codigo_barras': '11111'})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['nombre_completo'], self.producto_aceite.nombre_completo)

    def test_obtener_producto_sin_token_da_401(self):
        """Probar que las peticiones sin token son rechazadas con 401."""
        self.client.credentials()  # Limpiar token
        url = reverse('producto-por-codigo', kwargs={'codigo_barras': '11111'})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_registrar_venta_exitoso_y_descuento_stock(self):
        """Probar registro de venta exitosa y que el stock se descuente adecuadamente."""
        url = reverse('registrar-venta')
        payload = {
            "detalles": [
                {"producto_id": self.producto_aceite.id, "cantidad": 3},
                {"producto_id": self.producto_filtro.id, "cantidad": 2}
            ]
        }
        
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # Verificar descuento de stock
        self.producto_aceite.refresh_from_db()
        self.producto_filtro.refresh_from_db()
        self.assertEqual(self.producto_aceite.stock_actual, 7)
        self.assertEqual(self.producto_filtro.stock_actual, 3)

    def test_registrar_venta_stock_insuficiente_falla(self):
        """Probar que si un producto no tiene suficiente stock la venta falla completamente."""
        url = reverse('registrar-venta')
        payload = {
            "detalles": [
                {"producto_id": self.producto_aceite.id, "cantidad": 2},
                {"producto_id": self.producto_filtro.id, "cantidad": 10}
            ]
        }
        
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_crud_productos_viewset(self):
        """Probar listado, creación y edición a través del router CRUD."""
        # Listado
        url_list = reverse('productos-list')
        response = self.client.get(url_list)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

        # Crear nuevo producto
        payload_create = {
            "codigo_barras": "33333",
            "nombre_completo": "Aceite de Transmisión Castrol 80W90 1L",
            "precio_venta": "220.00",
            "stock_actual": 12
        }
        response = self.client.post(url_list, payload_create, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Producto.objects.count(), 3)

        # Editar producto creado
        nuevo_id = response.data['id']
        url_detail = reverse('productos-detail', kwargs={'pk': nuevo_id})
        payload_update = {
            "codigo_barras": "33333",
            "nombre_completo": "Aceite de Transmisión Castrol 80W90 1L (Editado)",
            "precio_venta": "230.00",
            "stock_actual": 10
        }
        response = self.client.put(url_detail, payload_update, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verificar en base de datos
        prod = Producto.objects.get(id=nuevo_id)
        self.assertEqual(prod.stock_actual, 10)
        self.assertEqual(float(prod.precio_venta), 230.00)

    @patch('requests.post')
    def test_enviar_cierre_n8n(self, mock_post):
        """Probar que el cierre agrupa correctamente los datos del día y hace la petición POST."""
        mock_post.return_value.status_code = 200
        
        venta = Venta.objects.create(total=385.00)
        DetalleVenta.objects.create(
            venta=venta, producto=self.producto_aceite, cantidad=2, precio_unitario=150.00
        )
        DetalleVenta.objects.create(
            venta=venta, producto=self.producto_filtro, cantidad=1, precio_unitario=85.00
        )

        from datetime import date
        hoy = date.today()
        ventas_hoy = Venta.objects.filter(id=venta.id)

        exito, mensaje = enviar_cierre_n8n(ventas_hoy, hoy)
        self.assertTrue(exito)
        self.assertEqual(mensaje, "Cierre enviado exitosamente a n8n.")

    def test_descargar_backup(self):
        """Probar que el endpoint de backup retorna el archivo SQLite."""
        url = reverse('download-backup')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.has_header('Content-Disposition'))
        self.assertIn('attachment; filename="backup_ruta8_', response['Content-Disposition'])

    def test_importar_productos_csv(self):
        """Probar que el importador procesa correctamente un archivo CSV."""
        import io
        csv_data = (
            "codigo_barras;nombre_completo;precio_costo;precio_venta;stock_actual;categoria\n"
            "55555;Aceite Prueba Importacion;50.00;75.00;10;Aceites\n"
            "11111;Aceite Inca 20W50 Mineral 1L;95.00;160.00;25;Aceites\n"
        )
        csv_file = io.BytesIO(csv_data.encode('utf-8'))
        csv_file.name = 'test_productos.csv'

        url = reverse('importar-csv')
        response = self.client.post(url, {'file': csv_file}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['creados'], 1)  # 55555 es nuevo
        self.assertEqual(response.data['actualizados'], 1)  # 11111 ya existía

        # Verificar cambios en base de datos
        prod_nuevo = Producto.objects.get(codigo_barras="55555")
        self.assertEqual(prod_nuevo.nombre_completo, "Aceite Prueba Importacion")
        self.assertEqual(float(prod_nuevo.precio_venta), 75.00)

        prod_existente = Producto.objects.get(codigo_barras="11111")
        self.assertEqual(float(prod_existente.precio_costo), 95.00)
        self.assertEqual(float(prod_existente.precio_venta), 160.00)
        self.assertEqual(prod_existente.stock_actual, 25)

    def test_importar_productos_excel_dinamico(self):
        """Probar que el importador procesa correctamente un archivo Excel con encabezados dinámicos."""
        import openpyxl
        import io
        wb = openpyxl.Workbook()
        ws = wb.active
        
        ws.append(["Código de Barras", "Producto / Nombre", "Marca", "Precio Neto (Venta)", "Precio Costo", "Cantidad (Stock)", "Categoría"])
        ws.append(["88888", "Aceite Semisintético 10W40", "Castrol", "12.50", "8.00", "20", "Lubricantes"])
        ws.append(["N/A", "Aceite Inca 20W50 Mineral 1L", "", "155.00", "110.00", "15", "Lubricantes"])
        
        excel_file = io.BytesIO()
        wb.save(excel_file)
        excel_file.seek(0)
        excel_file.name = 'test_productos_dinamico.xlsx'
        
        url = reverse('importar-csv')
        response = self.client.post(url, {'file': excel_file}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['creados'], 1)
        self.assertEqual(response.data['actualizados'], 1)
        
        prod_nuevo = Producto.objects.get(codigo_barras="88888")
        self.assertEqual(prod_nuevo.nombre_completo, "Aceite Semisintético 10W40 (Castrol)")
        self.assertEqual(float(prod_nuevo.precio_venta), 12.50)
        self.assertEqual(float(prod_nuevo.precio_costo), 8.00)
        self.assertEqual(prod_nuevo.stock_actual, 20)
        self.assertEqual(prod_nuevo.categoria, "Lubricantes")
        
        prod_existente = Producto.objects.get(nombre_completo="Aceite Inca 20W50 Mineral 1L")
        self.assertEqual(float(prod_existente.precio_venta), 155.00)
        self.assertEqual(float(prod_existente.precio_costo), 110.00)
        self.assertEqual(prod_existente.stock_actual, 15)

    def test_importar_productos_excel_heredado(self):
        """Probar que el importador procesa correctamente el formato heredado (Ruta 8) sin encabezados dinámicos."""
        import openpyxl
        import io
        wb = openpyxl.Workbook()
        ws = wb.active
        
        ws.append(["ESTANTE PRUEBA", None, None, None, None, None, None, None])
        ws.append(["PRODUCTOS", "CANTIDAD", "P.UNIT", None, None, None, "SUBTOTAL", "TOTAL DÓLAR"])
        ws.append(["Aceite Inca 20W50 Mineral 1L", "50", "90.00", None, None, None, "120.00", "130.00"])
        
        excel_file = io.BytesIO()
        wb.save(excel_file)
        excel_file.seek(0)
        excel_file.name = 'test_productos_heredado.xlsx'
        
        url = reverse('importar-csv')
        response = self.client.post(url, {'file': excel_file}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['actualizados'], 1)
        
        prod_existente = Producto.objects.get(nombre_completo="Aceite Inca 20W50 Mineral 1L")
        self.assertEqual(float(prod_existente.precio_venta), 130.00)
        self.assertEqual(float(prod_existente.precio_costo), 90.00)
        self.assertEqual(prod_existente.stock_actual, 50)
        self.assertEqual(prod_existente.categoria, "Estante Prueba")
