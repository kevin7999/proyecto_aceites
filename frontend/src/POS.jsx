import React, { useState, useEffect, useRef } from 'react';
import './POS.css';

const API_BASE_URL = 'http://localhost:8000/api/inventario';

function POS() {
  const [token, setToken] = useState(localStorage.getItem('ruta8_token') || '');
  const [username, setUsername] = useState(localStorage.getItem('ruta8_username') || '');
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  
  // Vistas y datos
  const [currentView, setCurrentView] = useState('pos'); // 'pos', 'inventario' o 'clientes'
  const [productos, setProductos] = useState([]); // Lista completa para inventario
  const [busquedaInventario, setBusquedaInventario] = useState('');
  const [clientes, setClientes] = useState([]);
  const [busquedaClientes, setBusquedaClientes] = useState('');
  
  // Formulario para Crear / Editar producto en inventario
  const [formId, setFormId] = useState(null); // Null = Crear, número = Editar
  const [formCodigo, setFormCodigo] = useState('');
  const [formNombre, setFormNombre] = useState('');
  const [formPrecio, setFormPrecio] = useState('');
  const [formStock, setFormStock] = useState('');
  const [formCategoria, setFormCategoria] = useState('aceites');
  
  // Filtro de categorías en inventario
  const [filtroCategoria, setFiltroCategoria] = useState('todos');

  // POS State
  const [barcode, setBarcode] = useState('');
  const [cart, setCart] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [cierreData, setCierreData] = useState(null);
  const [showCierreModal, setShowCierreModal] = useState(false);
  const [backendStatus, setBackendStatus] = useState('checking');

  // Tasa de cambio multidivisa
  const [tasaCambio, setTasaCambio] = useState(() => {
    const saved = localStorage.getItem('ruta8_tasa_cambio');
    return saved ? parseFloat(saved) : 40.0;
  });
  const [editandoTasa, setEditandoTasa] = useState(false);
  const [tasaTemporal, setTasaTemporal] = useState(tasaCambio.toString());

  // Checkout Modal State
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState(1); // 1 = Cédula/RIF, 2 = Datos (si es nuevo), 3 = Pago
  const [consumidorFinal, setConsumidorFinal] = useState(false);
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteCedulaRif, setClienteCedulaRif] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [clienteCorreo, setClienteCorreo] = useState('');
  const [metodoPago, setMetodoPago] = useState('efectivo'); // 'efectivo', 'pago_movil', 'punto_venta' o 'mixto'
  const [pagoMixtoActivo, setPagoMixtoActivo] = useState(false);
  const [montoEfectivoUSDInput, setMontoEfectivoUSDInput] = useState('');
  const [metodoPagoRestante, setMetodoPagoRestante] = useState('pago_movil'); // 'pago_movil' o 'punto_venta'

  // Modales de Clientes
  const [showEditClienteModal, setShowEditClienteModal] = useState(false);
  const [editCliente, setEditCliente] = useState(null); // Cliente en edición
  const [editNombre, setEditNombre] = useState('');
  const [editCedulaRif, setEditCedulaRif] = useState('');
  const [editTelefono, setEditTelefono] = useState('');

  const [showHistorialModal, setShowHistorialModal] = useState(false);
  const [historialCliente, setHistorialCliente] = useState([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);

  const scannerInputRef = useRef(null);

  const guardarTasa = (e) => {
    e.preventDefault();
    const parsed = parseFloat(tasaTemporal);
    if (!isNaN(parsed) && parsed > 0) {
      setTasaCambio(parsed);
      localStorage.setItem('ruta8_tasa_cambio', parsed.toString());
      addAlert('success', `Tasa de cambio actualizada a Bs. ${parsed.toFixed(2)}`);
      setEditandoTasa(false);
    } else {
      addAlert('warning', 'Ingrese un valor de tasa válido.');
    }
  };

  // Cargar productos al abrir vista de inventario
  useEffect(() => {
    if (token && currentView === 'inventario') {
      fetchProductos();
    }
  }, [token, currentView]);

  // Cargar clientes al abrir vista de clientes
  useEffect(() => {
    if (token && currentView === 'clientes') {
      fetchClientes();
    }
  }, [token, currentView]);

  // Mantener el input de escaneo siempre enfocado si estamos en la vista POS
  useEffect(() => {
    if (!token || currentView !== 'pos') return;

    const focusScanner = () => {
      // Solo re-enfocar si el foco no está en otro input (ej. búsqueda manual)
      if (document.activeElement?.tagName !== 'INPUT' || document.activeElement === scannerInputRef.current) {
        scannerInputRef.current?.focus();
      }
    };

    focusScanner();
    document.addEventListener('click', focusScanner);

    return () => {
      document.removeEventListener('click', focusScanner);
    };
  }, [token, currentView]);

  // Verificar conexión con el backend local
  useEffect(() => {
    const verificarConexion = () => {
      fetch(`${API_BASE_URL}/productos/`, {
        headers: token ? { 'Authorization': `Token ${token}` } : {}
      })
        .then(() => setBackendStatus('online'))
        .catch((err) => {
          // Si es un error de red (no de credenciales)
          if (err.message && err.message.includes('Failed to fetch')) {
            setBackendStatus('offline');
          } else {
            setBackendStatus('online'); // Responde con 401/403, significa que el server está activo
          }
        });
    };

    verificarConexion();
    const interval = setInterval(verificarConexion, 10000); // Verificar cada 10s
    return () => clearInterval(interval);
  }, [token]);

  // Agregar alertas autodescartables
  const addAlert = (type, message) => {
    const id = Date.now() + Math.random().toString(36).substr(2, 5);
    setAlerts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setAlerts((prev) => prev.filter((alert) => alert.id !== id));
    }, 4000);
  };

  // Manejar Login
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginUser.trim() || !loginPass.trim()) {
      addAlert('warning', 'Complete todos los campos del login.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUser, password: loginPass })
      });

      const data = await response.json();
      if (response.ok) {
        setToken(data.token);
        setUsername(data.username);
        localStorage.setItem('ruta8_token', data.token);
        localStorage.setItem('ruta8_username', data.username);
        addAlert('success', `Sesión iniciada como: ${data.username}`);
        setCurrentView('pos');
      } else {
        addAlert('error', 'Usuario o contraseña incorrectos.');
      }
    } catch (error) {
      addAlert('error', 'Error al conectar con el servidor local.');
    } finally {
      setLoading(false);
    }
  };

  // Cerrar Sesión
  const handleLogout = () => {
    setToken('');
    setUsername('');
    localStorage.removeItem('ruta8_token');
    localStorage.removeItem('ruta8_username');
    setCart([]);
    setProductos([]);
    addAlert('info', 'Sesión cerrada.');
  };

  // Obtener lista completa de clientes registrados
  const fetchClientes = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/clientes/`, {
        headers: { 'Authorization': `Token ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setClientes(data);
      } else if (response.status === 401) {
        handleLogout();
      } else {
        addAlert('error', 'Error al obtener listado de clientes.');
      }
    } catch (error) {
      addAlert('error', 'Error de red al consultar clientes.');
    } finally {
      setLoading(false);
    }
  };

  // Buscar cliente por cédula/RIF en checkout paso 1
  const buscarClientePorCedula = async () => {
    if (!clienteCedulaRif.trim()) {
      addAlert('warning', 'Ingrese una cédula o RIF.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/clientes/buscar/?cedula_rif=${encodeURIComponent(clienteCedulaRif.trim())}`, {
        headers: { 'Authorization': `Token ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setClienteNombre(data.nombre);
        setClienteTelefono(data.telefono);
        setClienteCorreo(data.correo || '');
        addAlert('success', `Cliente encontrado: ${data.nombre}`);
        setCheckoutStep(3); // Salta directamente al paso de pago
      } else if (response.status === 404) {
        setClienteNombre('');
        setClienteTelefono('');
        setClienteCorreo('');
        addAlert('info', 'Cliente nuevo. Complete los datos.');
        setCheckoutStep(2); // Va al paso de llenar los datos
      } else {
        addAlert('error', 'Error al consultar el cliente.');
      }
    } catch (error) {
      addAlert('error', 'Error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  // Ver historial de compras de un cliente
  const handleVerHistorial = async (cliente) => {
    setLoading(true);
    setClienteSeleccionado(cliente);
    try {
      const param = cliente.cedula_rif 
        ? `cedula_rif=${encodeURIComponent(cliente.cedula_rif)}`
        : `nombre=${encodeURIComponent(cliente.nombre)}`;
      const response = await fetch(`${API_BASE_URL}/clientes/historial/?${param}`, {
        headers: { 'Authorization': `Token ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setHistorialCliente(data);
        setShowHistorialModal(true);
      } else {
        addAlert('error', 'No se pudo cargar el historial.');
      }
    } catch (error) {
      addAlert('error', 'Error de red.');
    } finally {
      setLoading(false);
    }
  };

  // Abrir modal de edición de cliente
  const iniciarEdicionCliente = (cliente) => {
    setEditCliente(cliente);
    setEditNombre(cliente.nombre);
    setEditCedulaRif(cliente.cedula_rif);
    setEditTelefono(cliente.telefono);
    setShowEditClienteModal(true);
  };

  // Guardar edición del cliente
  const handleGuardarEdicionCliente = async (e) => {
    e.preventDefault();
    if (!editNombre.trim()) {
      addAlert('warning', 'El nombre es obligatorio.');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        old_cedula_rif: editCliente.cedula_rif,
        old_nombre: editCliente.nombre,
        nombre: editNombre.trim(),
        cedula_rif: editCedulaRif.trim(),
        telefono: editTelefono.trim()
      };

      const response = await fetch(`${API_BASE_URL}/clientes/editar/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        addAlert('success', 'Datos del cliente actualizados con éxito.');
        setShowEditClienteModal(false);
        fetchClientes();
      } else {
        const errData = await response.json();
        addAlert('error', `Error: ${errData.error || 'No se pudo actualizar.'}`);
      }
    } catch (error) {
      addAlert('error', 'Error al guardar los datos.');
    } finally {
      setLoading(false);
    }
  };

  // Obtener lista completa de productos para el CRUD de Inventario
  const fetchProductos = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/productos/`, {
        headers: { 'Authorization': `Token ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setProductos(data);
      } else if (response.status === 401) {
        handleLogout();
      } else {
        addAlert('error', 'Error al obtener inventario.');
      }
    } catch (error) {
      addAlert('error', 'Error de red al consultar inventario.');
    }
  };

  // Buscar y agregar producto en el POS mediante el escáner
  const fetchAndAddProduct = async (code) => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/producto/${code.trim()}/`, {
        headers: { 'Authorization': `Token ${token}` }
      });
      if (response.status === 404) {
        addAlert('error', `Producto con código "${code}" no registrado.`);
        setLoading(false);
        return;
      }
      if (response.status === 401) {
        handleLogout();
        return;
      }
      if (!response.ok) {
        throw new Error('Error al consultar el producto.');
      }
      const producto = await response.json();
      addProductToCart(producto);
    } catch (error) {
      addAlert('error', 'Error de conexión con el backend.');
    } finally {
      setLoading(false);
    }
  };

  const addProductToCart = (producto) => {
    setCart((currentCart) => {
      const existingItem = currentCart.find((item) => item.id === producto.id);
      
      if (existingItem) {
        if (existingItem.cantidad + 1 > producto.stock_actual) {
          addAlert('warning', `Stock insuficiente para ${producto.nombre_completo}. Disponibles: ${producto.stock_actual}`);
          return currentCart;
        }
        addAlert('info', `Cantidad incrementada: ${producto.nombre_completo}`);
        return currentCart.map((item) =>
          item.id === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item
        );
      } else {
        if (producto.stock_actual <= 0) {
          addAlert('warning', `Sin stock para ${producto.nombre_completo}.`);
          return currentCart;
        }
        addAlert('success', `Agregado: ${producto.nombre_completo}`);
        return [...currentCart, { ...producto, cantidad: 1 }];
      }
    });
  };

  // Crear o Editar Producto en el Inventario (CRUD)
  const handleSubmitProducto = async (e) => {
    e.preventDefault();
    if (!formCodigo.trim() || !formNombre.trim() || !formPrecio || formStock === '') {
      addAlert('warning', 'Complete todos los campos del producto.');
      return;
    }

    const payload = {
      codigo_barras: formCodigo.trim(),
      nombre_completo: formNombre.trim(),
      precio_venta: parseFloat(formPrecio),
      stock_actual: parseInt(formStock, 10),
      categoria: formCategoria
    };

    setLoading(true);
    const isEdit = formId !== null;
    const url = isEdit 
      ? `${API_BASE_URL}/productos/${formId}/`
      : `${API_BASE_URL}/productos/`;
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        addAlert('success', isEdit ? 'Producto actualizado con éxito.' : 'Producto creado con éxito.');
        limpiarFormulario();
        fetchProductos();
      } else {
        const errData = await response.json();
        addAlert('error', `Error: ${JSON.stringify(errData)}`);
      }
    } catch (error) {
      addAlert('error', 'Error al guardar el producto.');
    } finally {
      setLoading(false);
    }
  };

  // Cargar datos en el formulario para editar producto
  const iniciarEdicion = (prod) => {
    setFormId(prod.id);
    setFormCodigo(prod.codigo_barras);
    setFormNombre(prod.nombre_completo);
    setFormPrecio(prod.precio_venta);
    setFormStock(prod.stock_actual);
    setFormCategoria(prod.categoria || 'aceites');
  };

  // Eliminar producto del inventario
  const eliminarProducto = async (id, nombre) => {
    if (!window.confirm(`¿Está seguro de que desea eliminar "${nombre}" del catálogo?`)) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/productos/${id}/`, {
        method: 'DELETE',
        headers: { 'Authorization': `Token ${token}` }
      });
      if (response.ok) {
        addAlert('success', `Producto "${nombre}" eliminado.`);
        fetchProductos();
        if (formId === id) limpiarFormulario();
      } else {
        addAlert('error', 'No se pudo eliminar el producto.');
      }
    } catch (error) {
      addAlert('error', 'Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const limpiarFormulario = () => {
    setFormId(null);
    setFormCodigo('');
    setFormNombre('');
    setFormPrecio('');
    setFormStock('');
    setFormCategoria('aceites');
  };

  // Adición rápida de stock (+ Stock)
  const handleQuickStockAdd = async (prod) => {
    const cantStr = window.prompt(`Ingresar la cantidad de unidades a SUMAR al stock de "${prod.nombre_completo}" (Stock actual: ${prod.stock_actual}):`, "12");
    if (cantStr === null) return; // cancelado
    const cant = parseInt(cantStr, 10);
    if (isNaN(cant) || cant <= 0) {
      addAlert('warning', 'Ingrese una cantidad válida mayor a 0.');
      return;
    }
    setLoading(true);
    try {
      const nuevoStock = prod.stock_actual + cant;
      const response = await fetch(`${API_BASE_URL}/productos/${prod.id}/`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`
        },
        body: JSON.stringify({ stock_actual: nuevoStock })
      });
      if (response.ok) {
        addAlert('success', `Stock de "${prod.nombre_completo}" actualizado a ${nuevoStock} unidades.`);
        fetchProductos();
      } else {
        addAlert('error', 'No se pudo actualizar el stock.');
      }
    } catch (error) {
      addAlert('error', 'Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  // Manejar el submit del escáner (al presionar Enter)
  const handleScannerSubmit = (e) => {
    e.preventDefault();
    if (barcode.trim()) {
      fetchAndAddProduct(barcode);
      setBarcode('');
    }
  };

  // Manejar ingreso manual del código
  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualCode.trim()) {
      fetchAndAddProduct(manualCode);
      setManualCode('');
    }
  };

  // Modificar cantidad directamente en la tabla
  const updateQuantity = (id, change) => {
    setCart((currentCart) =>
      currentCart.map((item) => {
        if (item.id === id) {
          const nuevaCantidad = item.cantidad + change;
          if (nuevaCantidad <= 0) return item;
          if (nuevaCantidad > item.stock_actual) {
            addAlert('warning', `Stock máximo de ${item.stock_actual} unidades alcanzado.`);
            return item;
          }
          return { ...item, cantidad: nuevaCantidad };
        }
        return item;
      })
    );
  };

  // Eliminar producto del carrito
  const removeFromCart = (id, nombre) => {
    setCart((currentCart) => currentCart.filter((item) => item.id !== id));
    addAlert('info', `Eliminado del carrito: ${nombre}`);
  };

  // Limpiar todo el carrito
  const clearCart = () => {
    if (cart.length === 0) return;
    if (window.confirm('¿Está seguro de que desea limpiar la venta actual?')) {
      setCart([]);
      addAlert('info', 'Carrito vaciado.');
    }
  };

  // Procesar y finalizar la venta en el backend
  const finalizarVenta = async (checkoutData) => {
    if (cart.length === 0) {
      addAlert('warning', 'El carrito está vacío.');
      return;
    }

    setLoading(true);
    const payload = {
      detalles: cart.map((item) => ({
        producto_id: item.id,
        cantidad: item.cantidad,
      })),
      tasa_cambio: checkoutData.tasa_cambio,
      metodo_pago: checkoutData.metodo_pago,
      monto_efectivo_usd: checkoutData.monto_efectivo_usd || 0.00,
      metodo_pago_restante: checkoutData.metodo_pago_restante || null,
      cliente_nombre: checkoutData.cliente_nombre || null,
      cliente_cedula_rif: checkoutData.cliente_cedula_rif || null,
      cliente_telefono: checkoutData.cliente_telefono || null,
      cliente_correo: checkoutData.cliente_correo || null,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/venta/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        addAlert('success', `¡Venta registrada con éxito! Total: $${parseFloat(data.total).toFixed(2)}`);
        setCart([]);
        setShowCheckoutModal(false);
        setCheckoutStep(1);
        setConsumidorFinal(false);
        // Limpiar datos de cliente
        setClienteNombre('');
        setClienteCedulaRif('');
        setClienteTelefono('');
        setClienteCorreo('');
        setMetodoPago('efectivo');
        setPagoMixtoActivo(false);
        setMontoEfectivoUSDInput('');
        setMetodoPagoRestante('pago_movil');
      } else {
        const errorMsg = data.non_field_errors 
          ? data.non_field_errors.join(' ') 
          : JSON.stringify(data);
        addAlert('error', `Error al registrar: ${errorMsg}`);
      }
    } catch (error) {
      addAlert('error', 'Error de red al procesar la venta.');
    } finally {
      setLoading(false);
    }
  };

  // Realizar Cierre de Caja (Llamada a n8n)
  const realizarCierreCaja = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/cierre/`, {
        method: 'POST',
        headers: { 'Authorization': `Token ${token}` }
      });
      const data = await response.json();
      
      setCierreData(data);
      setShowCierreModal(true);

      if (response.status === 200 || (data.envio_n8n && data.envio_n8n.exito)) {
        addAlert('success', 'Cierre de caja procesado y enviado a n8n.');
      } else {
        addAlert('warning', `Cierre guardado localmente. Detalle n8n: ${data.envio_n8n?.mensaje}`);
      }
    } catch (error) {
      addAlert('error', 'Error al procesar el cierre de caja diario.');
    } finally {
      setLoading(false);
    }
  };

  // Filtrar productos en pantalla de inventario
  const productosFiltrados = productos.filter(p => {
    const coincideTexto = p.nombre_completo.toLowerCase().includes(busquedaInventario.toLowerCase()) ||
      p.codigo_barras.includes(busquedaInventario);
    const coincideCategoria = filtroCategoria === 'todos' || (p.categoria || 'otros') === filtroCategoria;
    return coincideTexto && coincideCategoria;
  });

  // Filtrar clientes en pantalla de clientes
  const clientesFiltrados = clientes.filter(c => 
    c.nombre.toLowerCase().includes(busquedaClientes.toLowerCase()) ||
    (c.cedula_rif || '').toLowerCase().includes(busquedaClientes.toLowerCase())
  );

  // Pantalla de Login si no hay Token activo
  if (!token) {
    return (
      <div className="login-wrapper">
        <div className="alerts-container">
          {alerts.map((alert) => (
            <div key={alert.id} className={`alert alert-${alert.type}`}>
              <span className="alert-message">{alert.message}</span>
            </div>
          ))}
        </div>
        
        <div className="login-card">
          <div className="login-logo">🛢️</div>
          <h2>Ruta 8 Autopartes</h2>
          <p className="login-subtitle">Sistema de Control de Caja e Inventario</p>
          
          <div className="login-status-indicator">
            <span className={`status-dot ${backendStatus}`}></span>
            <span className="status-text">
              Servidor: {backendStatus === 'online' ? 'Conectado' : backendStatus === 'offline' ? 'Desconectado' : 'Verificando...'}
            </span>
          </div>
          
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label>Usuario</label>
              <input 
                type="text" 
                placeholder="Ingrese su usuario (ej: ruta8)" 
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                required
              />
            </div>
            
            <div className="form-group">
              <label>Contraseña</label>
              <input 
                type="password" 
                placeholder="••••••••" 
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? 'Accediendo...' : 'Iniciar Sesión'}
            </button>
          </form>

          <div className="login-credentials-hint">
            <span className="hint-icon">💡</span>
            <span className="hint-text">Usuario por defecto: <code>ruta8</code> / Contraseña: <code>adminruta8</code></span>
          </div>
        </div>
      </div>
    );
  }

  // Calcular totales del carrito
  const totalVenta = cart.reduce((acc, item) => acc + item.cantidad * parseFloat(item.precio_venta), 0);

  // Calcular impuestos y desgloses para Checkout Paso 3
  const subtotalNeto = totalVenta;
  const iva = subtotalNeto * 0.16;
  
  let igtf = 0;
  let totalUSD = subtotalNeto + iva;
  let restanteBs = 0;
  let errorMixto = '';
  const maxUsdCash = (subtotalNeto + iva) / 0.97;

  if (metodoPago === 'efectivo') {
    igtf = (subtotalNeto + iva) * 0.03;
    totalUSD = subtotalNeto + iva + igtf;
  } else if (metodoPago === 'mixto') {
    const cashUsd = parseFloat(montoEfectivoUSDInput) || 0;
    if (cashUsd < 0) {
      errorMixto = 'El monto no puede ser negativo';
    } else if (cashUsd > maxUsdCash) {
      errorMixto = `Límite excedido (máx: $${maxUsdCash.toFixed(2)})`;
    }
    igtf = cashUsd * 0.03;
    totalUSD = subtotalNeto + iva + igtf;
    const restanteUsd = Math.max(0, totalUSD - cashUsd);
    restanteBs = restanteUsd * tasaCambio;
  } else {
    // pago_movil o punto_venta
    igtf = 0;
    totalUSD = subtotalNeto + iva;
  }

  return (
    <div className="pos-layout">
      {/* Alertas del Sistema */}
      <div className="alerts-container">
        {alerts.map((alert) => (
          <div key={alert.id} className={`alert alert-${alert.type}`}>
            <span className="alert-icon">
              {alert.type === 'success' && '✓'}
              {alert.type === 'error' && '✗'}
              {alert.type === 'warning' && '⚠'}
              {alert.type === 'info' && 'ℹ'}
            </span>
            <span className="alert-message">{alert.message}</span>
          </div>
        ))}
      </div>

      {/* Header del POS con Barra de Navegación */}
      <header className="pos-header">
        <div className="brand">
          <span className="logo-icon">🛢️</span>
          <div>
            <h1>Ruta 8 Autopartes</h1>
            <p className="subtitle">Aceites, Lubricantes y Repuestos</p>
          </div>
        </div>

        {/* Pestañas de Navegación Simplificadas */}
        <nav className="nav-tabs">
          <button 
            className={`nav-btn ${currentView === 'pos' ? 'active' : ''}`} 
            onClick={() => setCurrentView('pos')}
          >
            🛒 Punto de Venta
          </button>
          <button 
            className={`nav-btn ${currentView === 'inventario' ? 'active' : ''}`} 
            onClick={() => setCurrentView('inventario')}
          >
            📦 Catálogo / Inventario
          </button>
          <button 
            className={`nav-btn ${currentView === 'clientes' ? 'active' : ''}`} 
            onClick={() => setCurrentView('clientes')}
          >
            👥 Clientes
          </button>
        </nav>
        
        <div className="pos-status-bar">
          <div className="status-item rate-badge">
            {editandoTasa ? (
              <form onSubmit={guardarTasa} className="tasa-edit-form">
                <span>Tasa Bs.:</span>
                <input 
                  type="number" 
                  step="0.01" 
                  value={tasaTemporal} 
                  onChange={(e) => setTasaTemporal(e.target.value)}
                  className="tasa-input-mini"
                  autoFocus
                />
                <button type="submit" className="btn-save-mini">✓</button>
                <button type="button" className="btn-cancel-mini" onClick={() => setEditandoTasa(false)}>✗</button>
              </form>
            ) : (
              <div className="tasa-display">
                <span>Tasa: <b>Bs. {tasaCambio.toFixed(2)}</b></span>
                <button className="btn-edit-mini" onClick={() => { setTasaTemporal(tasaCambio.toString()); setEditandoTasa(true); }} title="Editar Tasa de Cambio">✏️</button>
              </div>
            )}
          </div>

          <div className="status-item user-badge">
            <span>Operador: <b>{username}</b></span>
            <button className="btn-logout-link" onClick={handleLogout} title="Cerrar sesión">Cerrar Sesión 🚪</button>
          </div>
          <div className="status-item">
            <span className={`status-dot ${backendStatus}`}></span>
            <span>Server: {backendStatus === 'online' ? 'Conectado' : 'Offline'}</span>
          </div>
        </div>
      </header>

      {/* VISTA 1: PUNTO DE VENTA (POS) */}
      {currentView === 'pos' && (
        <main className="pos-main">
          {/* Lector oculto de código de barras */}
          <form onSubmit={handleScannerSubmit} className="scanner-form">
            <input
              ref={scannerInputRef}
              type="text"
              className="scanner-input"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Esperando lectura..."
              autoComplete="off"
            />
          </form>

          {/* Sección de la Tabla de Compra */}
          <section className="cart-section">
            <div className="section-header">
              <h2>🛒 Detalle de la Compra</h2>
              {cart.length > 0 && (
                <button className="btn-text" onClick={clearCart}>
                  Vaciar Carrito
                </button>
              )}
            </div>

            <div className="table-wrapper">
              {cart.length === 0 ? (
                <div className="empty-cart-state">
                  <div className="empty-icon">📟</div>
                  <h3>Pase el escáner sobre el código de barras</h3>
                  <p>O use el buscador rápido en la barra lateral para ingresar el código manualmente.</p>
                </div>
              ) : (
                <table className="cart-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Descripción Producto</th>
                      <th className="text-right">Precio Unitario</th>
                      <th className="text-center">Cantidad</th>
                      <th className="text-right">Subtotal</th>
                      <th className="text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item) => (
                      <tr key={item.id}>
                        <td className="barcode-cell">{item.codigo_barras}</td>
                        <td className="name-cell">{item.nombre_completo}</td>
                        <td className="text-right">${parseFloat(item.precio_venta).toFixed(2)}</td>
                        <td className="qty-cell">
                          <div className="qty-controls">
                            <button 
                              className="btn-qty" 
                              onClick={() => updateQuantity(item.id, -1)}
                              disabled={item.cantidad <= 1}
                            >
                              -
                            </button>
                            <span className="qty-value">{item.cantidad}</span>
                            <button 
                              className="btn-qty" 
                              onClick={() => updateQuantity(item.id, 1)}
                              disabled={item.cantidad >= item.stock_actual}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="text-right subtotal-cell">
                          ${(item.cantidad * parseFloat(item.precio_venta)).toFixed(2)}
                        </td>
                        <td className="text-center">
                          <button 
                            className="btn-delete" 
                            onClick={() => removeFromCart(item.id, item.nombre_completo)}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Barra Lateral de Controles y Totales */}
          <aside className="control-sidebar">
            <div className="card total-card">
              <span className="card-label">TOTAL NETO</span>
              <div className="total-amount">${totalVenta.toFixed(2)}</div>
              <div className="total-amount-ves">Bs. {(totalVenta * tasaCambio).toFixed(2)}</div>
              <span className="item-count">{cart.reduce((a, b) => a + b.cantidad, 0)} envases registrados</span>
              
              <button 
                className="btn btn-primary btn-checkout" 
                onClick={() => {
                  if (cart.length === 0) {
                    addAlert('warning', 'El carrito está vacío.');
                    return;
                  }
                  setShowCheckoutModal(true);
                }}
                disabled={cart.length === 0 || loading}
              >
                {loading ? 'Registrando...' : '✓ FINALIZAR VENTA'}
              </button>
            </div>

            <div className="card search-card">
              <h3>🔍 Buscar Código Manual</h3>
              <p className="card-desc">Si el código está borroso, digítalo aquí.</p>
              <form onSubmit={handleManualSubmit} className="manual-form">
                <input
                  type="text"
                  placeholder="Ej: 7501234567890"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                />
                <button type="submit" className="btn btn-secondary" disabled={loading}>
                  Agregar al Carrito
                </button>
              </form>
            </div>

            <div className="card actions-card">
              <h3>📊 Cierre de Caja Diario</h3>
              <p className="card-desc">Agrupa las ventas de hoy y sincroniza con n8n.</p>
              <button 
                className="btn btn-danger btn-block" 
                onClick={realizarCierreCaja}
                disabled={loading}
              >
                Cerrar Caja Hoy
              </button>
            </div>
          </aside>
        </main>
      )}

      {/* VISTA 2: INVENTARIO (CRUD) */}
      {currentView === 'inventario' && (
        <main className="pos-main">
          {/* Listado de Productos */}
          <section className="cart-section">
            <div className="section-header">
              <h2>📦 Administración de Productos e Inventario</h2>
              <div className="inventory-filters" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select 
                  className="filter-select"
                  value={filtroCategoria}
                  onChange={(e) => setFiltroCategoria(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '8px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', outline: 'none' }}
                >
                  <option value="todos">Todas las categorías</option>
                  <option value="aceites">Aceites</option>
                  <option value="filtros">Filtros</option>
                  <option value="liquidos">Líquidos / Fluidos</option>
                  <option value="repuestos">Repuestos</option>
                  <option value="otros">Otros</option>
                </select>
                <input
                  type="text"
                  className="search-inventario-input"
                  placeholder="Filtrar por nombre o código de barras..."
                  value={busquedaInventario}
                  onChange={(e) => setBusquedaInventario(e.target.value)}
                />
              </div>
            </div>

            <div className="table-wrapper">
              {productosFiltrados.length === 0 ? (
                <div className="empty-cart-state">
                  <h3>No se encontraron productos</h3>
                  <p>Intente otra búsqueda o cree el producto en el panel lateral.</p>
                </div>
              ) : (
                <table className="cart-table">
                  <thead>
                    <tr>
                      <th>Código Barras</th>
                      <th>Nombre / Descripción del Producto</th>
                      <th>Categoría</th>
                      <th className="text-right">Precio de Venta</th>
                      <th className="text-right">Stock Actual</th>
                      <th className="text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosFiltrados.map((p) => (
                      <tr key={p.id} className={formId === p.id ? "row-editing" : ""}>
                        <td className="barcode-cell">{p.codigo_barras}</td>
                        <td className="name-cell"><b>{p.nombre_completo}</b></td>
                        <td>
                          <span className="category-badge" style={{ textTransform: 'capitalize', fontSize: '0.85rem', color: 'var(--accent-info)', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: '12px' }}>
                            {p.categoria || 'otros'}
                          </span>
                        </td>
                        <td className="text-right">${parseFloat(p.precio_venta).toFixed(2)}</td>
                        <td className="text-right">
                          <span className={`stock-badge ${p.stock_actual <= 5 ? "stock-low" : ""}`}>
                            {p.stock_actual} unid.
                          </span>
                        </td>
                        <td className="text-center">
                          <div className="crud-actions">
                            <button 
                              className="btn-action-edit" 
                              onClick={() => handleQuickStockAdd(p)}
                              title="Adición rápida de stock"
                              style={{ backgroundColor: 'rgba(255, 159, 28, 0.1)', borderColor: 'rgba(255, 159, 28, 0.3)', color: 'var(--accent-oil)' }}
                            >
                              ➕ Stock
                            </button>
                            <button 
                              className="btn-action-edit" 
                              onClick={() => iniciarEdicion(p)}
                              title="Editar producto"
                            >
                              ✏️
                            </button>
                            <button 
                              className="btn-action-delete" 
                              onClick={() => eliminarProducto(p.id, p.nombre_completo)}
                              title="Eliminar del catálogo"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Formulario de Creación / Edición */}
          <aside className="control-sidebar">
            <div className="card form-card">
              <h3>{formId !== null ? '✏️ Editar Producto' : '➕ Agregar Producto Nuevo'}</h3>
              <p className="card-desc">Llene los datos del envase para registrarlo en el catálogo.</p>
              
              <form onSubmit={handleSubmitProducto} className="manual-form">
                <div className="form-group-sm">
                  <label>Código de Barras</label>
                  <input
                    type="text"
                    placeholder="Ej: 7501234567890"
                    value={formCodigo}
                    onChange={(e) => setFormCodigo(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group-sm">
                  <label>Nombre Completo / Marca</label>
                  <input
                    type="text"
                    placeholder="Ej: Aceite Inca 20W50 Mineral 1L"
                    value={formNombre}
                    onChange={(e) => setFormNombre(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group-sm">
                  <label>Categoría</label>
                  <select
                    value={formCategoria}
                    onChange={(e) => setFormCategoria(e.target.value)}
                    style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', outline: 'none' }}
                  >
                    <option value="aceites">Aceites</option>
                    <option value="filtros">Filtros</option>
                    <option value="liquidos">Líquidos / Fluidos</option>
                    <option value="repuestos">Repuestos</option>
                    <option value="otros">Otros</option>
                  </select>
                </div>

                <div className="form-group-sm">
                  <label>Precio de Venta ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ej: 150.00"
                    value={formPrecio}
                    onChange={(e) => setFormPrecio(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group-sm">
                  <label>Stock Inicial (Unidades)</label>
                  <input
                    type="number"
                    placeholder="Ej: 24"
                    value={formStock}
                    onChange={(e) => setFormStock(e.target.value)}
                    required
                  />
                </div>

                <div className="form-buttons">
                  <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                    {formId !== null ? 'Actualizar' : 'Registrar'}
                  </button>
                  {formId !== null && (
                    <button type="button" className="btn btn-secondary btn-block" onClick={limpiarFormulario}>
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </div>
          </aside>
        </main>
      )}

      {/* VISTA 3: CLIENTES */}
      {currentView === 'clientes' && (
        <main className="pos-main no-sidebar">
          <section className="cart-section">
            <div className="section-header">
              <h2>👥 Registro de Clientes</h2>
              <input
                type="text"
                className="search-inventario-input"
                placeholder="Filtrar por nombre o cédula/RIF..."
                value={busquedaClientes}
                onChange={(e) => setBusquedaClientes(e.target.value)}
              />
            </div>

            <div className="table-wrapper">
              {loading && clientes.length === 0 ? (
                <div className="empty-cart-state">
                  <h3>Cargando clientes...</h3>
                </div>
              ) : clientesFiltrados.length === 0 ? (
                <div className="empty-cart-state">
                  <h3>No se encontraron clientes</h3>
                  <p>Los clientes se registran automáticamente al finalizar una venta con sus datos.</p>
                </div>
              ) : (
                <table className="cart-table">
                  <thead>
                    <tr>
                      <th>Nombre / Razón Social</th>
                      <th>Cédula / RIF</th>
                      <th>Teléfono</th>
                      <th className="text-center">Compras Realizadas</th>
                      <th className="text-right">Total Gastado</th>
                      <th className="text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientesFiltrados.map((c, index) => (
                      <tr key={index}>
                        <td className="name-cell"><b>{c.nombre}</b></td>
                        <td className="barcode-cell">{c.cedula_rif || 'N/A'}</td>
                        <td>{c.telefono || 'N/A'}</td>
                        <td className="text-center">
                          <span className="stock-badge">
                            {c.compras_count}
                          </span>
                        </td>
                        <td className="text-right subtotal-cell">
                          ${parseFloat(c.total_gastado).toFixed(2)}
                        </td>
                        <td className="text-center">
                          <div className="crud-actions">
                            <button 
                              className="btn-action-edit" 
                              onClick={() => handleVerHistorial(c)}
                              title="Ver historial de compras"
                            >
                              👁️
                            </button>
                            <button 
                              className="btn-action-edit" 
                              onClick={() => iniciarEdicionCliente(c)}
                              title="Editar cliente"
                            >
                              ✏️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </main>
      )}

      {/* Modal de Reporte de Cierre Diario */}
      {showCierreModal && cierreData && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Reporte de Cierre de Caja Diario</h2>
              <button className="btn-close" onClick={() => setShowCierreModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="cierre-summary">
                <div className="summary-item">
                  <span className="summary-label">Fecha del Cierre:</span>
                  <span className="summary-val">{cierreData.fecha}</span>
                </div>
                <div className="summary-item highlight">
                  <span className="summary-label">Monto Total Acumulado:</span>
                  <span className="summary-val">${parseFloat(cierreData.monto_acumulado).toFixed(2)}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Envases Vendidos:</span>
                  <span className="summary-val">{cierreData.productos_vendidos_count} unidades</span>
                </div>
              </div>

              {cierreData.desglose_pagos && (
                <div className="cierre-pagos-box">
                  <h4>Desglose por Método de Pago:</h4>
                  <div className="summary-item">
                    <span className="summary-label">💵 Efectivo:</span>
                    <span className="summary-val">${parseFloat(cierreData.desglose_pagos.efectivo).toFixed(2)}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">📱 Pago Móvil:</span>
                    <span className="summary-val">${parseFloat(cierreData.desglose_pagos.pago_movil).toFixed(2)}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">💳 Punto de Venta:</span>
                    <span className="summary-val">${parseFloat(cierreData.desglose_pagos.punto_venta).toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div className="n8n-status-box" style={{ marginTop: '16px' }}>
                <h4>Estado de la sincronización (n8n):</h4>
                <div className={`status-badge ${cierreData.envio_n8n?.exito ? 'success' : 'error'}`}>
                  {cierreData.envio_n8n?.exito ? 'Sincronizado' : 'Pendiente / Offline'}
                </div>
                <p className="status-desc">{cierreData.envio_n8n?.mensaje}</p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowCierreModal(false)}>
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Checkout / Confirmación de Pago */}
      {showCheckoutModal && (
        <div className="modal-backdrop">
          <div className="modal-content modal-checkout">
            <div className="modal-header">
              <h2>Registro de Venta — Paso {checkoutStep} de 3</h2>
              <button className="btn-close" onClick={() => { setShowCheckoutModal(false); setCheckoutStep(1); setConsumidorFinal(false); }}>×</button>
            </div>
            
            <div className="checkout-step-indicator" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', padding: '0 10px' }}>
              <span style={{ fontWeight: checkoutStep === 1 ? 'bold' : 'normal', color: checkoutStep === 1 ? 'var(--accent-oil)' : 'var(--text-muted)' }}>1. Identificación</span>
              <span style={{ color: 'var(--text-muted)' }}>➔</span>
              <span style={{ fontWeight: checkoutStep === 2 ? 'bold' : 'normal', color: checkoutStep === 2 ? 'var(--accent-oil)' : 'var(--text-muted)', opacity: consumidorFinal ? 0.3 : 1 }}>2. Registro</span>
              <span style={{ color: 'var(--text-muted)' }}>➔</span>
              <span style={{ fontWeight: checkoutStep === 3 ? 'bold' : 'normal', color: checkoutStep === 3 ? 'var(--accent-oil)' : 'var(--text-muted)' }}>3. Pago</span>
            </div>

            <div className="modal-body">
              <div className="checkout-totals" style={{ marginBottom: '16px' }}>
                <div className="checkout-total-box">
                  <span className="box-label">Monto en Dólares</span>
                  <span className="box-value text-gold">${totalVenta.toFixed(2)}</span>
                </div>
                <div className="checkout-total-box">
                  <span className="box-label">Monto en Bolívares (Tasa: {tasaCambio.toFixed(2)})</span>
                  <span className="box-value">Bs. {(totalVenta * tasaCambio).toFixed(2)}</span>
                </div>
              </div>

              {/* PASO 1: CEDULA / RIF */}
              {checkoutStep === 1 && (
                <div className="checkout-form">
                  <h3 className="section-title">👤 Identificación del Cliente</h3>
                  <div className="form-group-sm" style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={consumidorFinal} 
                        onChange={(e) => {
                          setConsumidorFinal(e.target.checked);
                          if (e.target.checked) {
                            setClienteCedulaRif('');
                            setClienteNombre('Consumidor Final');
                            setClienteTelefono('');
                            setClienteCorreo('');
                          } else {
                            setClienteNombre('');
                          }
                        }}
                        style={{ marginRight: '8px', width: 'auto' }}
                      />
                      Venta Rápida (Consumidor Final)
                    </label>
                  </div>

                  {!consumidorFinal && (
                    <div className="form-group-sm">
                      <label>Cédula / RIF del Cliente</label>
                      <input 
                        type="text" 
                        placeholder="Ej: V-12345678 o J-123456789" 
                        value={clienteCedulaRif}
                        onChange={(e) => setClienteCedulaRif(e.target.value)}
                        autoFocus
                      />
                    </div>
                  )}

                  <div className="modal-footer" style={{ marginTop: '24px', padding: '16px 0 0 0' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => { setShowCheckoutModal(false); setCheckoutStep(1); setConsumidorFinal(false); }}>
                      Cancelar
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-primary" 
                      onClick={() => {
                        if (consumidorFinal) {
                          setCheckoutStep(3);
                        } else {
                          buscarClientePorCedula();
                        }
                      }}
                      disabled={loading || (!consumidorFinal && !clienteCedulaRif.trim())}
                    >
                      {loading ? 'Buscando...' : 'Siguiente ➔'}
                    </button>
                  </div>
                </div>
              )}

              {/* PASO 2: REGISTRO DE DATOS */}
              {checkoutStep === 2 && (
                <div className="checkout-form">
                  <h3 className="section-title">📝 Registrar Cliente Nuevo</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>
                    Cédula/RIF ingresada: <b>{clienteCedulaRif}</b>
                  </p>
                  
                  <div className="form-group-sm" style={{ marginBottom: '16px' }}>
                    <label>Nombre / Razón Social</label>
                    <input 
                      type="text" 
                      placeholder="Ej. Juan Pérez" 
                      value={clienteNombre}
                      onChange={(e) => setClienteNombre(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  <div className="form-group-sm">
                    <label>Teléfono (Opcional)</label>
                    <input 
                      type="text" 
                      placeholder="Ej. 04121234567" 
                      value={clienteTelefono}
                      onChange={(e) => setClienteTelefono(e.target.value)}
                    />
                  </div>

                  <div className="modal-footer" style={{ marginTop: '24px', padding: '16px 0 0 0' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setCheckoutStep(1)}>
                      Atrás
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-primary" 
                      onClick={() => {
                        if (!clienteNombre.trim()) {
                          addAlert('warning', 'El nombre es obligatorio.');
                          return;
                        }
                        setCheckoutStep(3);
                      }}
                    >
                      Siguiente ➔
                    </button>
                  </div>
                </div>
              )}

              {/* PASO 3: METODO DE PAGO Y CONFIRMACION */}
              {checkoutStep === 3 && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (metodoPago === 'mixto' && errorMixto) {
                    addAlert('warning', 'Corrija los errores del pago mixto antes de continuar.');
                    return;
                  }
                  finalizarVenta({
                    tasa_cambio: tasaCambio,
                    metodo_pago: metodoPago,
                    monto_efectivo_usd: metodoPago === 'mixto' ? parseFloat(montoEfectivoUSDInput) || 0 : 0,
                    metodo_pago_restante: metodoPago === 'mixto' ? metodoPagoRestante : null,
                    cliente_nombre: consumidorFinal ? 'Consumidor Final' : clienteNombre,
                    cliente_cedula_rif: consumidorFinal ? null : clienteCedulaRif,
                    cliente_telefono: consumidorFinal ? null : clienteTelefono,
                    cliente_correo: null
                  });
                }} className="checkout-form-large">
                  
                  <h3 className="section-title">👤 Resumen del Cliente</h3>
                  <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '0.95rem' }}>
                    {consumidorFinal ? (
                      <p style={{ margin: 0 }}><b>Cliente:</b> Consumidor Final (Venta Rápida)</p>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                        <p style={{ margin: 0 }}><b>Cliente:</b> {clienteNombre}</p>
                        <p style={{ margin: 0 }}><b>Cédula/RIF:</b> {clienteCedulaRif}</p>
                        <p style={{ margin: 0 }}><b>Teléfono:</b> {clienteTelefono || 'N/A'}</p>
                      </div>
                    )}
                  </div>

                  <div className="checkout-two-columns">
                    {/* COLUMNA IZQUIERDA: RESUMEN DE FACTURA */}
                    <div className="checkout-invoice-summary">
                      <h4 className="column-title">🧾 Detalle de Cobro</h4>
                      
                      <div className="invoice-rows">
                        <div className="invoice-row">
                          <span>Subtotal Neto:</span>
                          <b>${subtotalNeto.toFixed(2)}</b>
                        </div>
                        <div className="invoice-row">
                          <span>IVA (16%):</span>
                          <b>${iva.toFixed(2)}</b>
                        </div>
                        <div className="invoice-row">
                          <span>
                            IGTF (3%):
                            {metodoPago === 'efectivo' && <span className="tax-info-tag">Cash USD</span>}
                            {metodoPago === 'mixto' && <span className="tax-info-tag">Sobre USD efectivo</span>}
                            {(metodoPago === 'pago_movil' || metodoPago === 'punto_venta') && <span className="tax-info-tag green">Exento (Bs)</span>}
                          </span>
                          <b>${igtf.toFixed(2)}</b>
                        </div>
                        
                        <div className="invoice-divider"></div>
                        
                        <div className="invoice-row total-row">
                          <span>Total a Pagar (USD):</span>
                          <span className="total-val-usd">${totalUSD.toFixed(2)}</span>
                        </div>

                        {metodoPago !== 'mixto' ? (
                          <div className="invoice-row total-row-bs">
                            <span>Total a Pagar (Bs):</span>
                            <span>Bs. {(totalUSD * tasaCambio).toFixed(2)}</span>
                          </div>
                        ) : (
                          <div className="mixed-breakdown-box">
                            <h5>Desglose de Pago Mixto:</h5>
                            <div className="invoice-row sub-row">
                              <span>💵 Pago Efectivo USD:</span>
                              <b>${(parseFloat(montoEfectivoUSDInput) || 0).toFixed(2)}</b>
                            </div>
                            <div className="invoice-row sub-row">
                              <span>💳 Restante en USD:</span>
                              <b>${Math.max(0, totalUSD - (parseFloat(montoEfectivoUSDInput) || 0)).toFixed(2)}</b>
                            </div>
                            <div className="invoice-row sub-row highlight-bs">
                              <span>📱 Restante en Bs. (Tasa {tasaCambio}):</span>
                              <b>Bs. {restanteBs.toFixed(2)}</b>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="tax-alert-box">
                        <span className="info-icon">💡</span>
                        <p>
                          {metodoPago === 'efectivo' && "Pago en efectivo USD aplica 3% IGTF sobre el total (Subtotal + IVA)."}
                          {(metodoPago === 'pago_movil' || metodoPago === 'punto_venta') && "Pagos electrónicos en Bolívares están exentos del 3% IGTF."}
                          {metodoPago === 'mixto' && "Se aplica el 3% de IGTF únicamente sobre la fracción cancelada en USD en efectivo."}
                        </p>
                      </div>
                    </div>

                    {/* COLUMNA DERECHA: FORMA DE PAGO */}
                    <div className="checkout-payment-section">
                      <h4 className="column-title">💳 Selección de Pago</h4>
                      
                      <div className="payment-mode-tabs">
                        <button
                          type="button"
                          className={`mode-tab-btn ${metodoPago !== 'mixto' ? 'active' : ''}`}
                          onClick={() => {
                            setMetodoPago('efectivo');
                          }}
                        >
                          Pago Único
                        </button>
                        <button
                          type="button"
                          className={`mode-tab-btn ${metodoPago === 'mixto' ? 'active' : ''}`}
                          onClick={() => {
                            setMetodoPago('mixto');
                            setMontoEfectivoUSDInput('');
                          }}
                        >
                          Pago Mixto
                        </button>
                      </div>

                      {metodoPago !== 'mixto' ? (
                        <div className="payment-options-single">
                          <p className="payment-section-desc">Seleccione el método para cancelar el 100% de la factura:</p>
                          <div className="single-methods-grid">
                            <button
                              type="button"
                              className={`payment-method-card ${metodoPago === 'efectivo' ? 'active' : ''}`}
                              onClick={() => setMetodoPago('efectivo')}
                            >
                              <span className="card-icon">💵</span>
                              <span className="card-name">Efectivo USD</span>
                              <span className="card-desc-mini">Aplica IGTF 3%</span>
                            </button>

                            <button
                              type="button"
                              className={`payment-method-card ${metodoPago === 'pago_movil' ? 'active' : ''}`}
                              onClick={() => setMetodoPago('pago_movil')}
                            >
                              <span className="card-icon">📱</span>
                              <span className="card-name">Pago Móvil Bs</span>
                              <span className="card-desc-mini">Sin IGTF</span>
                            </button>

                            <button
                              type="button"
                              className={`payment-method-card ${metodoPago === 'punto_venta' ? 'active' : ''}`}
                              onClick={() => setMetodoPago('punto_venta')}
                            >
                              <span className="card-icon">💳</span>
                              <span className="card-name">Punto Venta Bs</span>
                              <span className="card-desc-mini">Sin IGTF</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="payment-options-mixed">
                          <p className="payment-section-desc">Ingrese el monto en efectivo y elija cómo pagar el saldo restante en Bolívares:</p>
                          
                          <div className="form-group-sm mixed-input-group">
                            <label>Monto pagado en Efectivo USD ($)</label>
                            <div className="input-with-symbol">
                              <span className="input-symbol">$</span>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={montoEfectivoUSDInput}
                                onChange={(e) => setMontoEfectivoUSDInput(e.target.value)}
                                min="0"
                                max={maxUsdCash.toFixed(2)}
                                autoFocus
                              />
                            </div>
                            {errorMixto ? (
                              <span className="input-error-msg">{errorMixto}</span>
                            ) : (
                              <span className="input-helper-msg">Límite máximo: ${maxUsdCash.toFixed(2)}</span>
                            )}
                          </div>

                          <div className="mixed-restante-selector">
                            <label className="selector-label">Método de Pago para el Restante (Bs):</label>
                            <div className="restante-methods-grid">
                              <button
                                type="button"
                                className={`restante-method-btn ${metodoPagoRestante === 'pago_movil' ? 'active' : ''}`}
                                onClick={() => setMetodoPagoRestante('pago_movil')}
                              >
                                <span className="btn-icon">📱</span>
                                <span className="btn-label">Pago Móvil</span>
                              </button>
                              
                              <button
                                type="button"
                                className={`restante-method-btn ${metodoPagoRestante === 'punto_venta' ? 'active' : ''}`}
                                onClick={() => setMetodoPagoRestante('punto_venta')}
                              >
                                <span className="btn-icon">💳</span>
                                <span className="btn-label">Punto de Venta</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="modal-footer" style={{ marginTop: '24px', padding: '16px 0 0 0' }}>
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      onClick={() => {
                        if (consumidorFinal) {
                          setCheckoutStep(1);
                        } else {
                          setCheckoutStep(2);
                        }
                      }}
                    >
                      Atrás
                    </button>
                    <button 
                      type="submit" 
                      className="btn btn-primary" 
                      disabled={loading || (metodoPago === 'mixto' && (errorMixto || !montoEfectivoUSDInput || parseFloat(montoEfectivoUSDInput) <= 0))}
                    >
                      {loading ? 'Procesando...' : '✓ Confirmar y Pagar'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Historial de Compras */}
      {showHistorialModal && clienteSeleccionado && (
        <div className="modal-backdrop">
          <div className="modal-content modal-history">
            <div className="modal-header">
              <h2>Historial de Compras - {clienteSeleccionado.nombre}</h2>
              <button className="btn-close" onClick={() => setShowHistorialModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="client-meta-info" style={{ marginBottom: '16px', display: 'flex', gap: '24px' }}>
                <p><b>Cédula/RIF:</b> {clienteSeleccionado.cedula_rif || 'N/A'}</p>
                <p><b>Teléfono:</b> {clienteSeleccionado.telefono || 'N/A'}</p>
              </div>
              <div className="history-list" style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '450px', overflowY: 'auto', paddingRight: '8px' }}>
                {historialCliente.length === 0 ? (
                  <p className="no-history-msg" style={{ textAlign: 'center', color: 'var(--text-muted)', margin: '20px 0' }}>No se encontraron ventas para este cliente.</p>
                ) : (
                  historialCliente.map((venta) => (
                    <div key={venta.id} className="history-item-card" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px' }}>
                      <div className="history-item-header" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '12px' }}>
                        <span className="sale-id" style={{ fontWeight: 'bold', color: 'var(--accent-oil)' }}>Venta #{venta.id}</span>
                        <span className="sale-date" style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{new Date(venta.fecha).toLocaleString()}</span>
                      </div>
                      <div className="history-item-details">
                        <table className="cart-table mini-table" style={{ width: '100%', fontSize: '0.9rem' }}>
                          <thead>
                            <tr>
                              <th>Producto</th>
                              <th className="text-center">Cant.</th>
                              <th className="text-right">Unitario</th>
                              <th className="text-right">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {venta.detalles.map((det) => (
                              <tr key={det.id}>
                                <td>{det.producto.nombre_completo}</td>
                                <td className="text-center">{det.cantidad}</td>
                                <td className="text-right">${parseFloat(det.precio_unitario).toFixed(2)}</td>
                                <td className="text-right">${(det.cantidad * parseFloat(det.precio_unitario)).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="history-item-footer" style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '12px', marginTop: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                          <div>
                            <div style={{ marginBottom: '6px' }}>
                              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Método de Pago:</span><br />
                              <b className="payment-method-tag" style={{ color: 'var(--accent-info)', textTransform: 'uppercase', fontSize: '0.9rem' }}>
                                {venta.metodo_pago === 'mixto' ? 'Pago Mixto (USD + Bs)' : venta.metodo_pago.replace('_', ' ')}
                              </b>
                            </div>
                            
                            {/* Desglose detallado del pago */}
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {venta.metodo_pago === 'mixto' && (
                                <>
                                  <div>💵 Efectivo USD: <b>${parseFloat(venta.monto_efectivo_usd).toFixed(2)}</b></div>
                                  <div>
                                    {venta.metodo_pago_restante === 'pago_movil' ? '📱 Pago Móvil' : '💳 Punto de Venta'}: <b>Bs. {parseFloat(venta.monto_electronico_bs).toFixed(2)}</b>
                                    <span style={{ fontSize: '0.8rem', opacity: 0.8 }}> (${(parseFloat(venta.monto_electronico_bs) / parseFloat(venta.tasa_cambio)).toFixed(2)})</span>
                                  </div>
                                </>
                              )}
                              {venta.metodo_pago === 'efectivo' && (
                                <div>💵 Efectivo USD: <b>${parseFloat(venta.total).toFixed(2)}</b></div>
                              )}
                              {(venta.metodo_pago === 'pago_movil' || venta.metodo_pago === 'punto_venta') && (
                                <div>
                                  {venta.metodo_pago === 'pago_movil' ? '📱 Pago Móvil' : '💳 Punto de Venta'}: <b>Bs. {parseFloat(venta.monto_electronico_bs).toFixed(2)}</b>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="history-totals" style={{ textAlign: 'right', minWidth: '160px' }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                <span>Subtotal Neto:</span>
                                <span>${(parseFloat(venta.total) - parseFloat(venta.iva) - parseFloat(venta.igtf)).toFixed(2)}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                <span>IVA (16%):</span>
                                <span>${parseFloat(venta.iva).toFixed(2)}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                <span>IGTF (3%):</span>
                                <span>${parseFloat(venta.igtf).toFixed(2)}</span>
                              </div>
                            </div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 'bold', borderTop: '1px solid var(--border-color)', marginTop: '6px', paddingTop: '4px', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                              <span>Total:</span>
                              <span style={{ color: 'var(--accent-oil)' }}>${parseFloat(venta.total).toFixed(2)}</span>
                            </div>
                            <div className="total-ves-mini" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '2px' }}>
                              Bs. {(parseFloat(venta.total) * parseFloat(venta.tasa_cambio)).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowHistorialModal(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edición de Cliente */}
      {showEditClienteModal && editCliente && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Editar Datos de Cliente</h2>
              <button className="btn-close" onClick={() => setShowEditClienteModal(false)}>×</button>
            </div>
            <form onSubmit={handleGuardarEdicionCliente}>
              <div className="modal-body">
                <div className="form-group-sm" style={{ marginBottom: '16px' }}>
                  <label>Nombre / Razón Social</label>
                  <input 
                    type="text" 
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group-sm" style={{ marginBottom: '16px' }}>
                  <label>Cédula / RIF</label>
                  <input 
                    type="text" 
                    value={editCedulaRif}
                    onChange={(e) => setEditCedulaRif(e.target.value)}
                  />
                </div>
                <div className="form-group-sm">
                  <label>Teléfono</label>
                  <input 
                    type="text" 
                    value={editTelefono}
                    onChange={(e) => setEditTelefono(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditClienteModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Guardando...' : '✓ Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default POS;
