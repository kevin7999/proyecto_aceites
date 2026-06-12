from rest_framework import serializers
from django.db import transaction
from .models import Producto, Venta, DetalleVenta

class ProductoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Producto
        fields = ['id', 'codigo_barras', 'nombre_completo', 'precio_venta', 'stock_actual']


class DetalleVentaSerializer(serializers.ModelSerializer):
    # Campo para escribir el ID del producto al registrar una venta
    producto_id = serializers.IntegerField(write_only=True)
    # Detalle expandido del producto al leer la venta
    producto = ProductoSerializer(read_only=True)

    class Meta:
        model = DetalleVenta
        fields = ['id', 'producto', 'producto_id', 'cantidad', 'precio_unitario']
        # El precio unitario puede ser opcional al escribir si queremos tomarlo del Producto
        extra_kwargs = {
            'precio_unitario': {'required': False}
        }


class VentaSerializer(serializers.ModelSerializer):
    detalles = DetalleVentaSerializer(many=True)

    class Meta:
        model = Venta
        fields = [
            'id', 'fecha', 'total', 'tasa_cambio', 'metodo_pago',
            'cliente_nombre', 'cliente_cedula_rif', 'cliente_telefono', 'cliente_correo',
            'detalles'
        ]
        read_only_fields = ['id', 'fecha', 'total']

    def create(self, validated_data):
        detalles_data = validated_data.pop('detalles')
        
        # Extraer campos adicionales con valores por defecto seguros
        tasa_cambio = validated_data.get('tasa_cambio', 1.00)
        metodo_pago = validated_data.get('metodo_pago', 'efectivo')
        cliente_nombre = validated_data.get('cliente_nombre', None)
        cliente_cedula_rif = validated_data.get('cliente_cedula_rif', None)
        cliente_telefono = validated_data.get('cliente_telefono', None)
        cliente_correo = validated_data.get('cliente_correo', None)

        if not detalles_data:
            raise serializers.ValidationError("La venta debe contener al menos un producto.")

        with transaction.atomic():
            venta = Venta.objects.create(
                total=0,
                tasa_cambio=tasa_cambio,
                metodo_pago=metodo_pago,
                cliente_nombre=cliente_nombre,
                cliente_cedula_rif=cliente_cedula_rif,
                cliente_telefono=cliente_telefono,
                cliente_correo=cliente_correo
            )
            total_venta = 0

            for detalle_data in detalles_data:
                prod_id = detalle_data['producto_id']
                cantidad = detalle_data['cantidad']

                if cantidad <= 0:
                    raise serializers.ValidationError(
                        f"La cantidad para el producto con ID {prod_id} debe ser mayor a 0."
                    )

                # Bloquear fila del producto para evitar condiciones de carrera en stock
                try:
                    producto = Producto.objects.select_for_update().get(id=prod_id)
                except Producto.DoesNotExist:
                    raise serializers.ValidationError(
                        f"El producto con ID {prod_id} no existe."
                    )

                # Validar stock
                if producto.stock_actual < cantidad:
                    raise serializers.ValidationError(
                        f"Stock insuficiente para '{producto.nombre_completo}'. "
                        f"Disponible: {producto.stock_actual}, Solicitado: {cantidad}."
                    )

                # Descontar stock
                producto.stock_actual -= cantidad
                producto.save()

                # Usar el precio registrado en la base de datos (seguridad)
                precio_unitario = producto.precio_venta
                total_venta += precio_unitario * cantidad

                # Crear detalle
                DetalleVenta.objects.create(
                    venta=venta,
                    producto=producto,
                    cantidad=cantidad,
                    precio_unitario=precio_unitario
                )

            # Actualizar el total final de la venta
            venta.total = total_venta
            venta.save()

        return venta
