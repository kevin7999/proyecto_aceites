from django.contrib import admin
from .models import Producto, Venta, DetalleVenta

class DetalleVentaInline(admin.TabularInline):
    model = DetalleVenta
    extra = 0
    readonly_fields = ('producto', 'cantidad', 'precio_unitario')
    can_delete = False

@admin.register(Producto)
class ProductoAdmin(admin.ModelAdmin):
    list_display = ('codigo_barras', 'nombre_completo', 'precio_venta', 'stock_actual')
    search_fields = ('codigo_barras', 'nombre_completo')
    list_filter = ('stock_actual',)
    ordering = ('nombre_completo',)

@admin.register(Venta)
class VentaAdmin(admin.ModelAdmin):
    list_display = ('id', 'fecha', 'total')
    list_filter = ('fecha',)
    readonly_fields = ('fecha', 'total')
    inlines = [DetalleVentaInline]
    ordering = ('-fecha',)
