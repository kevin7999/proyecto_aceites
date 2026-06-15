import os
import django
from decimal import Decimal
from datetime import datetime, timedelta
from django.utils import timezone

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from inventario.models import Producto, Venta, DetalleVenta, CierreCaja

def seed_sales_and_closures():
    print("Iniciando carga de ventas y cierres de prueba...")
    
    # 1. Asegurar precios de costo en productos
    productos = Producto.objects.all()
    if not productos.exists():
        print("Error: No hay productos en la base de datos. Corra seed.py primero.")
        return
        
    costos = {
        "7501234567890": 90.00,  # Venta: 150
        "7501234567891": 120.00, # Venta: 180
        "7501234567892": 50.00,  # Venta: 85
        "7501234567893": 150.00, # Venta: 220
        "7501234567894": 60.00   # Venta: 95
    }
    
    for p in productos:
        p.precio_costo = Decimal(str(costos.get(p.codigo_barras, p.precio_venta * Decimal('0.6'))))
        p.save()
        print(f"Producto '{p.nombre_completo}' actualizado con costo ${p.precio_costo}")

    # Borrar ventas y cierres anteriores para empezar limpios en las pruebas
    DetalleVenta.objects.all().delete()
    Venta.objects.all().delete()
    CierreCaja.objects.all().delete()
    print("Ventas y cierres limpios.")

    # 2. Crear ventas de prueba
    tasa = Decimal('36.50')
    clientes = [
        {"nombre": "Kevin Gomez", "cedula": "V-20123456", "telefono": "04121234567"},
        {"nombre": "Maria Perez", "cedula": "V-15987654", "telefono": "04169876543"},
        {"nombre": "Consumidor Final", "cedula": "", "telefono": ""},
        {"nombre": "Juan Rodriguez", "cedula": "V-9876543", "telefono": "04147654321"}
    ]
    
    # Ventas de hace 2 días (Cerradas)
    fecha_antigua = timezone.now() - timedelta(days=2)
    # Venta 1
    v1 = Venta.objects.create(
        total=Decimal('385.00') * Decimal('1.19'), # Subtotal + IVA + IGTF
        tasa_cambio=tasa,
        metodo_pago='efectivo',
        cliente_nombre=clientes[0]["nombre"],
        cliente_cedula_rif=clientes[0]["cedula"],
        cliente_telefono=clientes[0]["telefono"],
        iva=Decimal('385.00') * Decimal('0.16'),
        igtf=Decimal('385.00') * Decimal('1.16') * Decimal('0.03'),
        monto_efectivo_usd=Decimal('385.00') * Decimal('1.19'),
        monto_electronico_bs=Decimal('0.00')
    )
    Venta.objects.filter(id=v1.id).update(fecha=fecha_antigua)
    
    p1 = productos[0]
    p2 = productos[2]
    DetalleVenta.objects.create(venta=v1, producto=p1, cantidad=2, precio_unitario=p1.precio_venta, precio_costo_unitario=p1.precio_costo)
    DetalleVenta.objects.create(venta=v1, producto=p2, cantidad=1, precio_unitario=p2.precio_venta, precio_costo_unitario=p2.precio_costo)

    # Cierre de hace 2 días
    CierreCaja.objects.create(
        fecha=fecha_antigua.date(),
        monto_acumulado=v1.total,
        productos_vendidos_count=3,
        tasa_cambio=tasa,
        efectivo_usd=v1.total,
        pago_movil_usd=Decimal('0.00'),
        punto_venta_usd=Decimal('0.00'),
        sincronizado_n8n=True,
        mensaje_n8n="Sincronizado exitosamente."
    )
    print("Creado cierre de hace 2 días.")

    # Ventas de hoy
    fecha_hoy = timezone.now()
    # Venta hoy 1
    v_hoy1 = Venta.objects.create(
        total=Decimal('235.00') * Decimal('1.16'), # Pago Móvil no lleva IGTF
        tasa_cambio=tasa,
        metodo_pago='pago_movil',
        cliente_nombre=clientes[1]["nombre"],
        cliente_cedula_rif=clientes[1]["cedula"],
        cliente_telefono=clientes[1]["telefono"],
        iva=Decimal('235.00') * Decimal('0.16'),
        igtf=Decimal('0.00'),
        monto_efectivo_usd=Decimal('0.00'),
        monto_electronico_bs=(Decimal('235.00') * Decimal('1.16')) * tasa
    )
    Venta.objects.filter(id=v_hoy1.id).update(fecha=fecha_hoy - timedelta(hours=3))
    
    p3 = productos[1]
    p4 = productos[4]
    DetalleVenta.objects.create(venta=v_hoy1, producto=p3, cantidad=1, precio_unitario=p3.precio_venta, precio_costo_unitario=p3.precio_costo)
    DetalleVenta.objects.create(venta=v_hoy1, producto=p4, cantidad=1, precio_unitario=p4.precio_venta, precio_costo_unitario=p4.precio_costo)

    # Venta hoy 2 (Consumidor final efectivo)
    v_hoy2 = Venta.objects.create(
        total=Decimal('150.00') * Decimal('1.19'),
        tasa_cambio=tasa,
        metodo_pago='efectivo',
        cliente_nombre=clientes[2]["nombre"],
        cliente_cedula_rif=clientes[2]["cedula"],
        cliente_telefono=clientes[2]["telefono"],
        iva=Decimal('150.00') * Decimal('0.16'),
        igtf=Decimal('150.00') * Decimal('1.16') * Decimal('0.03'),
        monto_efectivo_usd=Decimal('150.00') * Decimal('1.19'),
        monto_electronico_bs=Decimal('0.00')
    )
    Venta.objects.filter(id=v_hoy2.id).update(fecha=fecha_hoy - timedelta(hours=1))
    
    DetalleVenta.objects.create(venta=v_hoy2, producto=p1, cantidad=1, precio_unitario=p1.precio_venta, precio_costo_unitario=p1.precio_costo)

    # Cierre de hoy (simulado localmente)
    total_hoy = v_hoy1.total + v_hoy2.total
    CierreCaja.objects.create(
        fecha=fecha_hoy.date(),
        monto_acumulado=total_hoy,
        productos_vendidos_count=3,
        tasa_cambio=tasa,
        efectivo_usd=v_hoy2.total,
        pago_movil_usd=v_hoy1.total,
        punto_venta_usd=Decimal('0.00'),
        sincronizado_n8n=False,
        mensaje_n8n="No se pudo conectar al servidor webhook n8n (modo offline)."
    )
    print("Creado cierre de hoy.")
    print("Carga de prueba finalizada.")

if __name__ == '__main__':
    seed_sales_and_closures()
