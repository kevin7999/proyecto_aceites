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
    precio_costo = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0.00,
        verbose_name="Precio de Costo"
    )
    stock_actual = models.IntegerField(
        default=0,
        verbose_name="Stock Actual"
    )
    categoria = models.CharField(
        max_length=100,
        default="Otros",
        verbose_name="Categoría"
    )

    def __str__(self):
        return f"{self.nombre_completo} ({self.codigo_barras})"

    class Meta:
        verbose_name = "Producto"
        verbose_name_plural = "Productos"


class Venta(models.Model):
    METODOS_PAGO = [
        ('efectivo', 'Efectivo'),
        ('pago_movil', 'Pago Móvil'),
        ('punto_venta', 'Punto de Venta'),
        ('mixto', 'Mixto (USD + Bs)'),
    ]

    fecha = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Fecha de Venta"
    )
    total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name="Monto Total"
    )
    tasa_cambio = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=1.00,
        verbose_name="Tasa de Cambio"
    )
    metodo_pago = models.CharField(
        max_length=50,
        choices=METODOS_PAGO,
        default='efectivo',
        verbose_name="Método de Pago"
    )
    iva = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0.00,
        verbose_name="Monto IVA (16%)"
    )
    igtf = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0.00,
        verbose_name="Monto IGTF (3%)"
    )
    monto_efectivo_usd = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0.00,
        verbose_name="Monto pagado en Efectivo USD"
    )
    monto_electronico_bs = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0.00,
        verbose_name="Monto pagado en Bs electrónico"
    )
    metodo_pago_restante = models.CharField(
        max_length=50,
        choices=[
            ('pago_movil', 'Pago Móvil'),
            ('punto_venta', 'Punto de Venta'),
        ],
        blank=True,
        null=True,
        verbose_name="Método de Pago Restante (Bs)"
    )
    cliente_nombre = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        verbose_name="Nombre del Cliente"
    )
    cliente_cedula_rif = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        verbose_name="Cédula/RIF del Cliente"
    )
    cliente_telefono = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        verbose_name="Teléfono del Cliente"
    )
    cliente_correo = models.EmailField(
        blank=True,
        null=True,
        verbose_name="Correo del Cliente"
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
    precio_costo_unitario = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0.00,
        verbose_name="Precio de Costo Unitario"
    )

    def __str__(self):
        return f"{self.cantidad} x {self.producto.nombre_completo} en Venta #{self.venta.id}"

    class Meta:
        verbose_name = "Detalle de Venta"
        verbose_name_plural = "Detalles de Venta"


class CierreCaja(models.Model):
    fecha = models.DateField(
        unique=True,
        db_index=True,
        verbose_name="Fecha de Cierre"
    )
    monto_acumulado = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name="Monto Total Acumulado"
    )
    productos_vendidos_count = models.IntegerField(
        verbose_name="Cantidad Total de Unidades"
    )
    tasa_cambio = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=1.00,
        verbose_name="Tasa de Cambio"
    )
    efectivo_usd = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0.00,
        verbose_name="Efectivo USD"
    )
    pago_movil_usd = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0.00,
        verbose_name="Pago Móvil USD"
    )
    punto_venta_usd = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0.00,
        verbose_name="Punto de Venta USD"
    )
    sincronizado_n8n = models.BooleanField(
        default=False,
        verbose_name="Sincronizado con n8n"
    )
    mensaje_n8n = models.TextField(
        blank=True,
        null=True,
        verbose_name="Mensaje de n8n"
    )

    def __str__(self):
        return f"Cierre {self.fecha.strftime('%d/%m/%Y')} - Total: {self.monto_acumulado}"

    class Meta:
        verbose_name = "Cierre de Caja"
        verbose_name_plural = "Cierres de Caja"
