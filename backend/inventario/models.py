from django.db import models

class Producto(models.Model):
    codigo_barras = models.CharField(
        max_length=100,
        unique=True,
        db_index=True,
        verbose_name="Código de Barras"
    )
    nombre_completo = models.CharField(
        max_length=255,
        verbose_name="Nombre Completo"
    )
    precio_venta = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        verbose_name="Precio de Venta"
    )
    stock_actual = models.IntegerField(
        default=0,
        verbose_name="Stock Actual"
    )

    def __str__(self):
        return f"{self.nombre_completo} ({self.codigo_barras})"

    class Meta:
        verbose_name = "Producto"
        verbose_name_plural = "Productos"


class Venta(models.Model):
    fecha = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Fecha de Venta"
    )
    total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name="Monto Total"
    )

    def __str__(self):
        return f"Venta #{self.id} - {self.fecha.strftime('%d/%m/%Y %H:%M')} - Total: {self.total}"

    class Meta:
        verbose_name = "Venta"
        verbose_name_plural = "Ventas"


class DetalleVenta(models.Model):
    venta = models.ForeignKey(
        Venta,
        related_name="detalles",
        on_delete=models.CASCADE,
        verbose_name="Venta"
    )
    producto = models.ForeignKey(
        Producto,
        on_delete=models.PROTECT,
        verbose_name="Producto"
    )
    cantidad = models.IntegerField(
        verbose_name="Cantidad"
    )
    precio_unitario = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        verbose_name="Precio Unitario"
    )

    def __str__(self):
        return f"{self.cantidad} x {self.producto.nombre_completo} en Venta #{self.venta.id}"

    class Meta:
        verbose_name = "Detalle de Venta"
        verbose_name_plural = "Detalles de Venta"
