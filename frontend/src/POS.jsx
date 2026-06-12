import React, { useState, useEffect, useRef } from 'react';
import './POS.css';

const API_BASE_URL = 'http://localhost:8000/api/inventario';

function POS() {
  const [token, setToken] = useState(localStorage.getItem('ruta8_token') || '');
  const [username, setUsername] = useState(localStorage.getItem('ruta8_username') || '');
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  
  // Vistas y datos
  const [currentView, setCurrentView] = useState('pos'); // 'pos' o 'inventario'
  const [productos, setProductos] = useState([]); // Lista completa para inventario
  const [busquedaInventario, setBusquedaInventario] = useState('');
  
  // Formulario para Crear / Editar producto en inventario
  const [formId, setFormId] = useState(null); // Null = Crear, número = Editar
  const [formCodigo, setFormCodigo] = useState('');
  const [formNombre, setFormNombre] = useState('');
  const [formPrecio, setFormPrecio] = useState('');
  const [formStock, setFormStock] = useState('');

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
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteCedulaRif, setClienteCedulaRif] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [clienteCorreo, setClienteCorreo] = useState('');
  const [metodoPago, setMetodoPago] = useState('efectivo');

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
      stock_actual: parseInt(formStock, 10)
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
        // Limpiar datos de cliente
        setClienteNombre('');
        setClienteCedulaRif('');
        setClienteTelefono('');
        setClienteCorreo('');
        setMetodoPago('efectivo');
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
  const productosFiltrados = productos.filter(p => 
    p.nombre_completo.toLowerCase().includes(busquedaInventario.toLowerCase()) ||
    p.codigo_barras.includes(busquedaInventario)
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
        </div>
      </div>
    );
  }

  // Calcular totales del carrito
  const totalVenta = cart.reduce((acc, item) => acc + item.cantidad * parseFloat(item.precio_venta), 0);

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
              <input
                type="text"
                className="search-inventario-input"
                placeholder="Filtrar por nombre o código de barras..."
                value={busquedaInventario}
                onChange={(e) => setBusquedaInventario(e.target.value)}
              />
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
                      <th className="text-right">Precio de Venta</th>
                      <th className="text-right">Stock Actual</th>
                      <th className="text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosFiltrados.map((p) => (
                      <tr key={p.id} className={formId === p.id ? "row-editing" : ""}>
                        <td className="barcode-cell">{p.codigo_barras}</td>
                        <td className="name-cell">{p.nombre_completo}</td>
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
              <h2>Confirmar Registro de Venta</h2>
              <button className="btn-close" onClick={() => setShowCheckoutModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="checkout-totals">
                <div className="checkout-total-box">
                  <span className="box-label">Monto en Dólares</span>
                  <span className="box-value text-gold">${totalVenta.toFixed(2)}</span>
                </div>
                <div className="checkout-total-box">
                  <span className="box-label">Monto en Bolívares (Tasa: {tasaCambio.toFixed(2)})</span>
                  <span className="box-value">Bs. {(totalVenta * tasaCambio).toFixed(2)}</span>
                </div>
              </div>

              <form onSubmit={(e) => {
                e.preventDefault();
                finalizarVenta({
                  tasa_cambio: tasaCambio,
                  metodo_pago: metodoPago,
                  cliente_nombre: clienteNombre,
                  cliente_cedula_rif: clienteCedulaRif,
                  cliente_telefono: clienteTelefono,
                  cliente_correo: clienteCorreo
                });
              }} className="checkout-form">
                
                <h3 className="section-title">👤 Datos del Cliente</h3>
                <div className="form-row">
                  <div className="form-group-sm">
                    <label>Cédula / RIF</label>
                    <input 
                      type="text" 
                      placeholder="V-12345678 o J-123456789" 
                      value={clienteCedulaRif}
                      onChange={(e) => setClienteCedulaRif(e.target.value)}
                    />
                  </div>
                  <div className="form-group-sm">
                    <label>Nombre / Razón Social</label>
                    <input 
                      type="text" 
                      placeholder="Ej. Juan Pérez" 
                      value={clienteNombre}
                      onChange={(e) => setClienteNombre(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group-sm">
                    <label>Teléfono</label>
                    <input 
                      type="text" 
                      placeholder="Ej. 04121234567" 
                      value={clienteTelefono}
                      onChange={(e) => setClienteTelefono(e.target.value)}
                    />
                  </div>
                  <div className="form-group-sm">
                    <label>Correo Electrónico</label>
                    <input 
                      type="email" 
                      placeholder="ejemplo@correo.com" 
                      value={clienteCorreo}
                      onChange={(e) => setClienteCorreo(e.target.value)}
                    />
                  </div>
                </div>

                <h3 className="section-title">💳 Método de Pago</h3>
                <div className="payment-methods-grid">
                  <button
                    type="button"
                    className={`payment-method-btn ${metodoPago === 'efectivo' ? 'active' : ''}`}
                    onClick={() => setMetodoPago('efectivo')}
                  >
                    <span className="method-icon">💵</span>
                    <span className="method-name">Efectivo</span>
                  </button>

                  <button
                    type="button"
                    className={`payment-method-btn ${metodoPago === 'pago_movil' ? 'active' : ''}`}
                    onClick={() => setMetodoPago('pago_movil')}
                  >
                    <span className="method-icon">📱</span>
                    <span className="method-name">Pago Móvil</span>
                  </button>

                  <button
                    type="button"
                    className={`payment-method-btn ${metodoPago === 'punto_venta' ? 'active' : ''}`}
                    onClick={() => setMetodoPago('punto_venta')}
                  >
                    <span className="method-icon">💳</span>
                    <span className="method-name">Punto de Venta</span>
                  </button>
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCheckoutModal(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? 'Procesando...' : '✓ Confirmar y Pagar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default POS;
