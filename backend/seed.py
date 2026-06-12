import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from inventario.models import Producto

def seed_db():
    productos = [
        {
            "codigo_barras": "7501234567890",
            "nombre_completo": "Aceite Inca 20W50 Mineral 1L",
            "precio_venta": 150.00,
            "stock_actual": 50
        },
        {
            "codigo_barras": "7501234567891",
            "nombre_completo": "Aceite Inca 15W40 Semisintético 1L",
            "precio_venta": 180.00,
            "stock_actual": 40
        },
        {
            "codigo_barras": "7501234567892",
            "nombre_completo": "Filtro de Aceite Millard ML-3614",
            "precio_venta": 85.00,
            "stock_actual": 30
        },
        {
            "codigo_barras": "7501234567893",
            "nombre_completo": "Aceite de Transmisión Castrol 80W90 1L",
            "precio_venta": 220.00,
            "stock_actual": 20
        },
        {
            "codigo_barras": "7501234567894",
            "nombre_completo": "Líquido de Frenos Wagner DOT4 500ml",
            "precio_venta": 95.00,
            "stock_actual": 15
        }
    ]

    print("Iniciando carga de productos semilla...")
    for prod_data in productos:
        producto, created = Producto.objects.update_or_create(
            codigo_barras=prod_data["codigo_barras"],
            defaults={
                "nombre_completo": prod_data["nombre_completo"],
                "precio_venta": prod_data["precio_venta"],
                "stock_actual": prod_data["stock_actual"]
            }
        )
        status = "Creado" if created else "Actualizado"
        print(f"- {producto.nombre_completo} [{producto.codigo_barras}]: {status}")
    # Crear usuario administrador
    from django.contrib.auth.models import User
    username = "ruta8"
    password = "adminruta8"
    if not User.objects.filter(username=username).exists():
        User.objects.create_superuser(username=username, email='', password=password)
        print(f"Usuario administrador creado: '{username}' con contraseña: '{password}'")
    else:
        print(f"Usuario '{username}' ya existe.")
    
    print("Carga finalizada con éxito.")

if __name__ == '__main__':
    seed_db()
