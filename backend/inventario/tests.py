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
