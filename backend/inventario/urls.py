from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProductoPorCodigoView, RegistrarVentaView, CierreDiarioView,
    ProductoViewSet, CustomObtainAuthToken, ClientesView,
    BuscarClienteView, EditarClienteView, HistorialClienteView
)

router = DefaultRouter()
router.register(r'productos', ProductoViewSet, basename='productos')

urlpatterns = [
    path('', include(router.urls)),
    path('login/', CustomObtainAuthToken.as_view(), name='login'),
    path('producto/<str:codigo_barras>/', ProductoPorCodigoView.as_view(), name='producto-por-codigo'),
    path('venta/', RegistrarVentaView.as_view(), name='registrar-venta'),
    path('cierre/', CierreDiarioView.as_view(), name='cierre-diario'),
    path('clientes/', ClientesView.as_view(), name='clientes-list'),
    path('clientes/buscar/', BuscarClienteView.as_view(), name='cliente-buscar'),
    path('clientes/editar/', EditarClienteView.as_view(), name='cliente-editar'),
    path('clientes/historial/', HistorialClienteView.as_view(), name='cliente-historial'),
]


