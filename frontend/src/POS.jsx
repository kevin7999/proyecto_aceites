import React, { useState, useEffect, useRef } from 'react';
import './POS.css';

const API_BASE_URL = 'http://localhost:8000/api/inventario';

const parseTelefono = (telefono) => {
  const tel = (telefono || '').trim();
  const prefijosValidos = ['0412', '0414', '0424', '0416', '0426'];
  for (const p of prefijosValidos) {
    if (tel.startsWith(p)) {
      return { prefijo: p, resto: tel.slice(p.length) };
    }
  }
  return { prefijo: '0412', resto: tel };
};

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
  const [formCosto, setFormCosto] = useState('');
  const [formStock, setFormStock] = useState('');
  const [formCategoriaSelect, setFormCategoriaSelect] = useState('aceites');
  const [formCategoriaCustom, setFormCategoriaCustom] = useState('');
  
  // Filtro de categorías en inventario
  const [filtroCategoria, setFiltroCategoria] = useState('todos');

  // Obtener todas las categorías únicas de los productos cargados
  const categoriasUnicas = React.useMemo(() => {
    const cats = new Set();
    const defaultCats = ['aceites', 'filtros', 'liquidos', 'repuestos', 'otros'];
    defaultCats.forEach(c => cats.add(c));

    productos.forEach(p => {
      if (p.categoria) {
        const partes = p.categoria.split(/[,/]/).map(c => c.trim().toLowerCase());
        partes.forEach(c => {
          if (c) cats.add(c);
        });
      }
    });

    return Array.from(cats).sort((a, b) => {
      if (a === 'otros') return 1;
      if (b === 'otros') return -1;
      return a.localeCompare(b);
    });
  }, [productos]);

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
  const [clienteCedulaRifTipo, setClienteCedulaRifTipo] = useState('V');
  const [clienteCedulaRifNumero, setClienteCedulaRifNumero] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [clienteTelefonoPrefijo, setClienteTelefonoPrefijo] = useState('0412');
  const [clienteTelefonoResto, setClienteTelefonoResto] = useState('');
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
  const [editCedulaRifTipo, setEditCedulaRifTipo] = useState('V');
  const [editCedulaRifNumero, setEditCedulaRifNumero] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editTelefonoPrefijo, setEditTelefonoPrefijo] = useState('0412');
  const [editTelefonoResto, setEditTelefonoResto] = useState('');

  const [showHistorialModal, setShowHistorialModal] = useState(false);
  const [historialCliente, setHistorialCliente] = useState([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [showCierreDetalleModal, setShowCierreDetalleModal] = useState(false);
  const [cierreFechaSelected, setCierreFechaSelected] = useState('');
  const [detalleTab, setDetalleTab] = useState('ticket'); // 'ticket' o 'ventas'
  
  // Modales de Importación CSV/Excel y Backups
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);

  const [busquedaProdNombre, setBusquedaProdNombre] = useState('');

  // Historial de Ventas / Facturación
  const [ventasLista, setVentasLista] = useState([]);
  const [busquedaVentas, setBusquedaVentas] = useState('');
  const [criterioBusqueda, setCriterioBusqueda] = useState('todos'); // 'todos', 'id', 'nombre', 'cedula'
  const [cierresLista, setCierresLista] = useState([]);
  const [busquedaCierres, setBusquedaCierres] = useState('');
  const [fechaInicio, setFechaInicio] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [fechaFin, setFechaFin] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

  // Cargar productos al abrir vista de inventario o pos
  useEffect(() => {
    if (token && (currentView === 'inventario' || currentView === 'pos')) {
      fetchProductos();
    }
  }, [token, currentView]);

  // Cargar clientes al abrir vista de clientes
  useEffect(() => {
    if (token && currentView === 'clientes') {
      fetchClientes();
    }
  }, [token, currentView]);

  // Cargar ventas al abrir vista de historial de ventas, dashboard o cierres
  useEffect(() => {
    if (token && (currentView === 'ventas' || currentView === 'dashboard' || currentView === 'cierres')) {
      fetchVentas();
    }
  }, [token, currentView]);

  // Cargar cierres al abrir vista de cierres o dashboard
  useEffect(() => {
    if (token && (currentView === 'cierres' || currentView === 'dashboard')) {
      fetchCierres();
    }
  }, [token, currentView]);

  // Mantener el input de escaneo siempre enfocado si estamos en la vista POS
  useEffect(() => {
    if (!token || currentView !== 'pos') return;

    const focusScanner = () => {
      // Solo re-enfocar si el foco no está en otro elemento de formulario (INPUT, SELECT, OPTION, BUTTON, TEXTAREA)
      const activeTag = document.activeElement?.tagName;
      const isFormElement = ['INPUT', 'SELECT', 'OPTION', 'BUTTON', 'TEXTAREA'].includes(activeTag);
      if (!isFormElement || document.activeElement === scannerInputRef.current) {
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

  // Obtener lista completa de ventas
  const fetchVentas = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/venta/`, {
        headers: { 'Authorization': `Token ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setVentasLista(data);
      } else if (response.status === 401) {
        handleLogout();
      } else {
        addAlert('error', 'Error al obtener listado de ventas.');
      }
    } catch (error) {
      addAlert('error', 'Error de red al consultar ventas.');
    } finally {
      setLoading(false);
    }
  };

  // Obtener lista completa de cierres de caja históricos
  const fetchCierres = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/cierres/`, {
        headers: { 'Authorization': `Token ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCierresLista(data);
      } else if (response.status === 401) {
        handleLogout();
      } else {
        addAlert('error', 'Error al obtener historial de cierres.');
      }
    } catch (error) {
      addAlert('error', 'Error de red al consultar cierres.');
    } finally {
      setLoading(false);
    }
  };

  // Buscar cliente por cédula/RIF en checkout paso 1
  const buscarClientePorCedula = async () => {
    const num = clienteCedulaRifNumero.trim();
    if (!num) {
      addAlert('warning', 'Ingrese una cédula o RIF.');
      return;
    }
    const cedulaCompleta = `${clienteCedulaRifTipo}-${num}`;
    setClienteCedulaRif(cedulaCompleta);
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/clientes/buscar/?cedula_rif=${encodeURIComponent(cedulaCompleta)}`, {
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
    setEditCedulaRif(cliente.cedula_rif || '');
    
    // Parsear Cédula/RIF
    const cedula = (cliente.cedula_rif || '').trim();
    if (cedula.startsWith('J-')) {
      setEditCedulaRifTipo('J');
      setEditCedulaRifNumero(cedula.slice(2));
    } else if (cedula.startsWith('V-')) {
      setEditCedulaRifTipo('V');
      setEditCedulaRifNumero(cedula.slice(2));
    } else {
      setEditCedulaRifTipo('V');
      setEditCedulaRifNumero(cedula);
    }

    const { prefijo, resto } = parseTelefono(cliente.telefono);
    setEditTelefonoPrefijo(prefijo);
    setEditTelefonoResto(resto);
    setEditTelefono(cliente.telefono || '');
    setShowEditClienteModal(true);
  };

  // Guardar edición del cliente
  const handleGuardarEdicionCliente = async (e) => {
    e.preventDefault();
    if (!editNombre.trim()) {
      addAlert('warning', 'El nombre es obligatorio.');
      return;
    }
    const resto = editTelefonoResto.trim();
    if (resto && resto.length !== 7) {
      addAlert('warning', 'El número de teléfono debe tener exactamente 7 dígitos.');
      return;
    }
    const telefonoCompleto = resto ? `${editTelefonoPrefijo}${resto}` : '';
    const cedulaCompleta = editCedulaRifNumero.trim() ? `${editCedulaRifTipo}-${editCedulaRifNumero.trim()}` : '';

    setLoading(true);
    try {
      const payload = {
        old_cedula_rif: editCliente.cedula_rif,
        old_nombre: editCliente.nombre,
        nombre: editNombre.trim(),
        cedula_rif: cedulaCompleta,
        telefono: telefonoCompleto
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

  // Descargar respaldo de base de datos
  const handleDownloadBackup = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/backup/`, {
        headers: { 'Authorization': `Token ${token}` }
      });
      if (response.ok) {
        const blob = await response.blob();
        const disposition = response.headers.get('Content-Disposition');
        let filename = `backup_ruta8_${new Date().toISOString().split('T')[0]}.sqlite3`;
        if (disposition && disposition.indexOf('attachment') !== -1) {
          const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
          const matches = filenameRegex.exec(disposition);
          if (matches != null && matches[1]) {
            filename = matches[1].replace(/['"]/g, '');
          }
        }
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        addAlert('success', 'Respaldo de base de datos descargado exitosamente.');
      } else {
        addAlert('error', 'Error al generar la copia de seguridad.');
      }
    } catch (error) {
      addAlert('error', 'Error de red al intentar descargar la copia de seguridad.');
    }
  };

  // Procesar importación de catálogo CSV/Excel
  const handleImportFile = async () => {
    if (!importFile) {
      addAlert('warning', 'Seleccione un archivo primero.');
      return;
    }
    setImporting(true);
    setImportResults(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const response = await fetch(`${API_BASE_URL}/productos/importar-csv/`, {
        method: 'POST',
        headers: { 'Authorization': `Token ${token}` },
        body: formData
      });
      
      const data = await response.json();
      if (response.ok) {
        setImportResults(data);
        addAlert('success', 'Importación finalizada con éxito.');
        fetchProductos(); // Recargar el inventario
      } else {
        addAlert('error', data.error || 'Error al procesar el archivo.');
      }
    } catch (error) {
      addAlert('error', 'Error de red al procesar la importación.');
    } finally {
      setImporting(false);
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
    if (!formCodigo.trim() || !formNombre.trim() || !formPrecio || formCosto === '' || formStock === '') {
      addAlert('warning', 'Complete todos los campos del producto.');
      return;
    }

    const payload = {
      codigo_barras: formCodigo.trim(),
      nombre_completo: formNombre.trim(),
      precio_venta: parseFloat(formPrecio),
      precio_costo: parseFloat(formCosto),
      stock_actual: parseInt(formStock, 10),
      categoria: formCategoriaSelect === 'custom' ? formCategoriaCustom.trim() : formCategoriaSelect
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
    setFormCosto(prod.precio_costo);
    setFormStock(prod.stock_actual);
    
    const cat = (prod.categoria || 'aceites').trim().toLowerCase();
    const isDefault = ['aceites', 'filtros', 'liquidos', 'repuestos', 'otros'].includes(cat);
    if (isDefault) {
      setFormCategoriaSelect(cat);
      setFormCategoriaCustom('');
    } else {
      setFormCategoriaSelect('custom');
      setFormCategoriaCustom(prod.categoria || '');
    }
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
    setFormCosto('');
    setFormStock('');
    setFormCategoriaSelect('aceites');
    setFormCategoriaCustom('');
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
        setClienteCedulaRifTipo('V');
        setClienteCedulaRifNumero('');
        setClienteTelefono('');
        setClienteTelefonoPrefijo('0412');
        setClienteTelefonoResto('');
        setClienteCorreo('');
        setMetodoPago('efectivo');
        setPagoMixtoActivo(false);
        setMontoEfectivoUSDInput('');
        setMetodoPagoRestante('pago_movil');
        fetchVentas();
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
      fetchCierres();

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
    const pCatClean = (p.categoria || 'otros').toLowerCase().trim();
    const fCatClean = filtroCategoria.toLowerCase().trim();
    
    const matchCat = (cat, filter) => {
      if (filter === 'aceites') {
        return cat.includes('aceite');
      }
      if (filter === 'liquidos') {
        return cat.includes('liquido') || cat.includes('fluido');
      }
      if (filter === 'filtros') {
        return cat.includes('filtro');
      }
      if (filter === 'repuestos') {
        return cat.includes('repuesto');
      }
      return cat.includes(filter);
    };

    const coincideCategoria = filtroCategoria === 'todos' || matchCat(pCatClean, fCatClean);
    return coincideTexto && coincideCategoria;
  });

  // Filtrar productos para búsqueda manual en el POS
  const productosCoincidentes = productos.filter(p => 
    (p.nombre_completo || '').toLowerCase().includes(busquedaProdNombre.toLowerCase()) ||
    (p.codigo_barras || '').includes(busquedaProdNombre)
  );

  // Filtrar clientes en pantalla de clientes
  const clientesFiltrados = clientes.filter(c => 
    c.nombre.toLowerCase().includes(busquedaClientes.toLowerCase()) ||
    (c.cedula_rif || '').toLowerCase().includes(busquedaClientes.toLowerCase())
  );

  // Filtrar la lista de ventas según fechaInicio, fechaFin, busquedaVentas y criterioBusqueda
  const ventasFiltradas = ventasLista.filter((v) => {
    const fechaVentaStr = v.fecha.split('T')[0];
    const cumpleFecha = fechaVentaStr >= fechaInicio && fechaVentaStr <= fechaFin;
    
    const query = busquedaVentas.trim().toLowerCase();
    if (!query) return cumpleFecha;
    
    let cumpleQuery = false;
    if (criterioBusqueda === 'id') {
      cumpleQuery = v.id.toString() === query || `venta #${v.id}`.toLowerCase() === query;
    } else if (criterioBusqueda === 'nombre') {
      cumpleQuery = (v.cliente_nombre || '').toLowerCase().includes(query);
    } else if (criterioBusqueda === 'cedula') {
      cumpleQuery = (v.cliente_cedula_rif || '').toLowerCase().includes(query);
    } else {
      cumpleQuery = 
        (v.cliente_nombre || '').toLowerCase().includes(query) ||
        (v.cliente_cedula_rif || '').toLowerCase().includes(query) ||
        v.id.toString() === query ||
        `venta #${v.id}`.toLowerCase().includes(query);
    }
      
    return cumpleFecha && cumpleQuery;
  });

  const totalUSDFiltrado = ventasFiltradas.reduce((sum, v) => sum + parseFloat(v.total || 0), 0);
  const totalBsFiltrado = ventasFiltradas.reduce((sum, v) => sum + (parseFloat(v.total || 0) * parseFloat(v.tasa_cambio || 1.00)), 0);
  const totalEfectivoUSD = ventasFiltradas.reduce((sum, v) => sum + parseFloat(v.monto_efectivo_usd || 0), 0);
  const totalElectronicoBs = ventasFiltradas.reduce((sum, v) => sum + parseFloat(v.monto_electronico_bs || 0), 0);

  const getCierreDetails = () => {
    const currentCierre = cierresLista.find(c => c.fecha === cierreFechaSelected);
    if (!currentCierre) return null;

    const salesForDay = ventasLista.filter(v => v.fecha.split('T')[0] === cierreFechaSelected);

    const aggregatedProducts = {};
    salesForDay.forEach(sale => {
      (sale.detalles || []).forEach(detail => {
        const prod = detail.producto;
        if (!prod) return;
        const key = prod.id || prod.codigo_barras || prod.nombre_completo;
        if (!aggregatedProducts[key]) {
          aggregatedProducts[key] = {
            codigo: prod.codigo_barras || 'N/A',
            nombre: prod.nombre_completo || 'Desconocido',
            cantidad: 0,
            precio_unitario: parseFloat(detail.precio_unitario || 0),
            precio_costo_unitario: parseFloat(detail.precio_costo_unitario || 0),
            total_usd: 0,
            total_costo_usd: 0
          };
        }
        aggregatedProducts[key].cantidad += detail.cantidad;
        aggregatedProducts[key].total_usd += parseFloat(detail.precio_unitario || 0) * detail.cantidad;
        aggregatedProducts[key].total_costo_usd += parseFloat(detail.precio_costo_unitario || 0) * detail.cantidad;
      });
    });

    const aggregatedList = Object.values(aggregatedProducts);

    let totalCostoVendido = 0;
    let totalVendidoUSD = 0;
    aggregatedList.forEach(item => {
      totalCostoVendido += item.total_costo_usd;
      totalVendidoUSD += item.total_usd;
    });
    const gananciaNeta = totalVendidoUSD - totalCostoVendido;

    return {
      cierre: currentCierre,
      sales: salesForDay,
      products: aggregatedList,
      totalCostoVendido,
      totalVendidoUSD,
      gananciaNeta
    };
  };

  const details = showCierreDetalleModal ? getCierreDetails() : null;

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

  // --- CALCULOS DEL DASHBOARD ---
  const getDashboardData = () => {
    const ahora = new Date();
    const esteMes = ahora.getMonth();
    const esteAno = ahora.getFullYear();

    // Ventas de este mes
    const ventasMes = ventasLista.filter(v => {
      const d = new Date(v.fecha);
      return d.getMonth() === esteMes && d.getFullYear() === esteAno;
    });

    const totalVentasMes = ventasMes.reduce((sum, v) => sum + parseFloat(v.total || 0), 0);
    
    // Utilidad de este mes (PVP - Costo)
    let totalCostoMes = 0;
    ventasMes.forEach(v => {
      if (v.detalles) {
        v.detalles.forEach(d => {
          totalCostoMes += d.cantidad * parseFloat(d.precio_costo_unitario || 0);
        });
      }
    });
    const utilidadMes = totalVentasMes - totalCostoMes;
    const transaccionesMes = ventasMes.length;
    const ticketPromedio = transaccionesMes > 0 ? (totalVentasMes / transaccionesMes) : 0;

    // --- Ventas de los últimos 7 días ---
    const ultimos7Dias = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const fechaStr = d.toISOString().split('T')[0];
      ultimos7Dias.push({
        fechaStr,
        label: d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }),
        monto: 0
      });
    }

    ventasLista.forEach(v => {
      const fechaV = v.fecha.split('T')[0];
      const diaObj = ultimos7Dias.find(d => d.fechaStr === fechaV);
      if (diaObj) {
        diaObj.monto += parseFloat(v.total || 0);
      }
    });

    // --- Métodos de pago preferidos (USD acumulado) ---
    const pagosMetodo = { efectivo: 0, pago_movil: 0, punto_venta: 0, mixto: 0 };
    ventasLista.forEach(v => {
      if (pagosMetodo[v.metodo_pago] !== undefined) {
        pagosMetodo[v.metodo_pago] += parseFloat(v.total || 0);
      }
    });

    // --- Top 5 Productos más Vendidos ---
    const productosVendidosMap = {};
    ventasLista.forEach(v => {
      if (v.detalles) {
        v.detalles.forEach(d => {
          const prodName = d.producto?.nombre_completo || 'Producto Eliminado';
          if (!productosVendidosMap[prodName]) {
            productosVendidosMap[prodName] = { nombre: prodName, cant: 0, total: 0 };
          }
          productosVendidosMap[prodName].cant += d.cantidad;
          productosVendidosMap[prodName].total += d.cantidad * parseFloat(d.precio_unitario || 0);
        });
      }
    });

    const topProductos = Object.values(productosVendidosMap)
      .sort((a, b) => b.cant - a.cant)
      .slice(0, 5);

    return {
      totalVentasMes,
      utilidadMes,
      transaccionesMes,
      ticketPromedio,
      ventas7Dias: ultimos7Dias,
      pagosMetodo,
      topProductos
    };
  };

  const dbData = getDashboardData();

  return (
    <div className={`pos-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
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

      {/* Barra Lateral Izquierda */}
      <aside className="pos-sidebar">
        <div className="sidebar-brand">
          <span className="logo-icon">🛢️</span>
          {!sidebarCollapsed && (
            <div className="brand-text">
              <h2>Ruta 8</h2>
              <p>Autopartes</p>
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          <button 
            className={`sidebar-btn ${currentView === 'dashboard' ? 'active' : ''}`} 
            onClick={() => setCurrentView('dashboard')}
            title="Dashboard de Métricas"
          >
            <span className="btn-icon">📊</span>
            {!sidebarCollapsed && <span className="btn-label">Dashboard</span>}
          </button>
          <button 
            className={`sidebar-btn ${currentView === 'pos' ? 'active' : ''}`} 
            onClick={() => setCurrentView('pos')}
            title="Punto de Venta"
          >
            <span className="btn-icon">🛒</span>
            {!sidebarCollapsed && <span className="btn-label">Punto de Venta</span>}
          </button>
          <button 
            className={`sidebar-btn ${currentView === 'inventario' ? 'active' : ''}`} 
            onClick={() => setCurrentView('inventario')}
            title="Catálogo / Inventario"
          >
            <span className="btn-icon">📦</span>
            {!sidebarCollapsed && <span className="btn-label">Inventario</span>}
          </button>
          <button 
            className={`sidebar-btn ${currentView === 'clientes' ? 'active' : ''}`} 
            onClick={() => setCurrentView('clientes')}
            title="Clientes"
          >
            <span className="btn-icon">👥</span>
            {!sidebarCollapsed && <span className="btn-label">Clientes</span>}
          </button>
          <button 
            className={`sidebar-btn ${currentView === 'ventas' ? 'active' : ''}`} 
            onClick={() => { setCurrentView('ventas'); fetchVentas(); }}
            title="Historial de Ventas"
          >
            <span className="btn-icon">🧾</span>
            {!sidebarCollapsed && <span className="btn-label">Historial de Ventas</span>}
          </button>
          <button 
            className={`sidebar-btn ${currentView === 'cierres' ? 'active' : ''}`} 
            onClick={() => { setCurrentView('cierres'); fetchCierres(); }}
            title="Historial de Cierres de Caja"
          >
            <span className="btn-icon">📁</span>
            {!sidebarCollapsed && <span className="btn-label">Historial de Cierres</span>}
          </button>
        </nav>

        <div className="sidebar-footer">
          {!sidebarCollapsed && (
            <div className="user-info">
              <span className="user-name">👤 {username}</span>
            </div>
          )}
          <button 
            className="sidebar-btn backup-btn" 
            onClick={handleDownloadBackup} 
            title="Descargar Respaldo de Base de Datos"
            style={{ 
              width: '100%', 
              justifyContent: 'flex-start', 
              background: 'none', 
              border: 'none', 
              color: 'var(--text-muted)', 
              padding: '10px 14px', 
              borderRadius: '8px', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              marginBottom: '4px'
            }}
          >
            <span className="btn-icon">💾</span>
            {!sidebarCollapsed && <span className="btn-label">Respaldar BD</span>}
          </button>
          <button className="btn-logout" onClick={handleLogout} title="Cerrar Sesión">
            <span className="btn-icon">🚪</span>
            {!sidebarCollapsed && <span className="btn-label">Cerrar Sesión</span>}
          </button>
        </div>

        <button className="sidebar-toggle-btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
          {sidebarCollapsed ? '▶' : '◀'}
        </button>
      </aside>

      {/* Contenido Principal */}
      <div className="pos-content">
        <header className="pos-header">
          <div className="view-title">
            <h2>
              {currentView === 'dashboard' && '📊 Dashboard de Rendimiento'}
              {currentView === 'pos' && '🛒 Punto de Venta'}
              {currentView === 'inventario' && '📦 Catálogo / Inventario'}
              {currentView === 'clientes' && '👥 Registro de Clientes'}
              {currentView === 'ventas' && '🧾 Historial de Ventas (Facturas)'}
              {currentView === 'cierres' && '📁 Historial de Cierres de Caja'}
            </h2>
          </div>
          
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

            <div className="status-item">
              <span className={`status-dot ${backendStatus}`}></span>
              <span>Servidor: <b style={{ textTransform: 'capitalize' }}>{backendStatus}</b></span>
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
                  setClienteNombre('');
                  setClienteCedulaRif('');
                  setClienteCedulaRifTipo('V');
                  setClienteCedulaRifNumero('');
                  setClienteTelefono('');
                  setClienteTelefonoPrefijo('0412');
                  setClienteTelefonoResto('');
                  setClienteCorreo('');
                  setConsumidorFinal(false);
                  setCheckoutStep(1);
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

            <div className="card search-card">
              <h3>🏷️ Buscar por Nombre</h3>
              <p className="card-desc">Escribe parte del nombre del producto.</p>
              <div className="manual-product-search-container" style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Ej: Aceite 15W40, Filtro..."
                  value={busquedaProdNombre}
                  onChange={(e) => setBusquedaProdNombre(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', outline: 'none' }}
                />
                {busquedaProdNombre.trim() !== '' && (
                  <div className="product-search-dropdown" style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '0 0 6px 6px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    zIndex: 1000,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                  }}>
                    {productosCoincidentes.length === 0 ? (
                      <div style={{ padding: '10px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No se encontraron productos</div>
                    ) : (
                      productosCoincidentes.map((prod) => (
                        <div
                          key={prod.id}
                          onClick={() => {
                            addProductToCart(prod);
                            setBusquedaProdNombre('');
                          }}
                          style={{
                            padding: '10px',
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--border-color)',
                            fontSize: '0.85rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                          className="search-item-hover"
                        >
                          <div style={{ textAlign: 'left', flex: 1, paddingRight: '8px' }}>
                            <span style={{ fontWeight: 'bold', display: 'block', color: 'var(--text-main)' }}>{prod.nombre_completo}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Stock: {prod.stock_actual} | {prod.codigo_barras}</span>
                          </div>
                          <span style={{ fontWeight: 'bold', color: 'var(--accent-oil)' }}>${parseFloat(prod.precio_venta).toFixed(2)}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
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
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setImportFile(null);
                    setImportResults(null);
                    setShowImportModal(true);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 14px' }}
                  title="Cargar productos en lote desde Excel o CSV"
                >
                  <span>📥</span> Importar Excel/CSV
                </button>
                <select 
                  className="filter-select"
                  value={filtroCategoria}
                  onChange={(e) => setFiltroCategoria(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '8px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', outline: 'none', textTransform: 'capitalize' }}
                >
                  <option value="todos">Todas las categorías</option>
                  {categoriasUnicas.map(cat => {
                    let label = cat;
                    if (cat === 'aceites') label = 'Aceites';
                    else if (cat === 'filtros') label = 'Filtros';
                    else if (cat === 'liquidos') label = 'Líquidos / Fluidos';
                    else if (cat === 'repuestos') label = 'Repuestos';
                    else if (cat === 'otros') label = 'Otros';
                    
                    return (
                      <option key={cat} value={cat}>
                        {label}
                      </option>
                    );
                  })}
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
                      <th className="text-right">Costo</th>
                      <th className="text-right">Precio Venta</th>
                      <th className="text-right">Margen (Utilidad)</th>
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
                        <td className="text-right">${parseFloat(p.precio_costo || 0).toFixed(2)}</td>
                        <td className="text-right">${parseFloat(p.precio_venta).toFixed(2)}</td>
                        <td className="text-right" style={{ color: (p.precio_venta - p.precio_costo) > 0 ? 'var(--accent-success)' : 'var(--text-muted)' }}>
                          ${(p.precio_venta - (p.precio_costo || 0)).toFixed(2)}
                          <span style={{ fontSize: '0.8rem', opacity: 0.8, marginLeft: '4px' }}>
                            ({p.precio_venta > 0 ? (((p.precio_venta - (p.precio_costo || 0)) / p.precio_venta) * 100).toFixed(0) : 0}%)
                          </span>
                        </td>
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

                <div className="form-group-sm" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label>Categoría</label>
                  <select
                    value={formCategoriaSelect}
                    onChange={(e) => setFormCategoriaSelect(e.target.value)}
                    style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', outline: 'none' }}
                  >
                    <option value="aceites">Aceites</option>
                    <option value="filtros">Filtros</option>
                    <option value="liquidos">Líquidos / Fluidos</option>
                    <option value="repuestos">Repuestos</option>
                    <option value="otros">Otros</option>
                    <option value="custom">✍️ Nueva / Personalizada...</option>
                  </select>
                  {formCategoriaSelect === 'custom' && (
                    <input
                      type="text"
                      placeholder="Escribe la categoría (ej: Dirección)"
                      value={formCategoriaCustom}
                      onChange={(e) => setFormCategoriaCustom(e.target.value)}
                      required
                      style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', width: '100%' }}
                    />
                  )}
                </div>

                <div className="form-group-sm">
                  <label>Precio de Costo ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ej: 100.00"
                    value={formCosto}
                    onChange={(e) => setFormCosto(e.target.value)}
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

      {/* VISTA 4: HISTORIAL DE VENTAS */}
      {currentView === 'ventas' && (
        <main className="pos-main no-sidebar" style={{ flexDirection: 'column', gap: '20px' }}>
          
          {/* Controles de Filtros */}
          <section className="filters-section card" style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="form-group-sm" style={{ flex: '1', minWidth: '150px' }}>
              <label>Fecha Inicio</label>
              <input 
                type="date" 
                value={fechaInicio} 
                onChange={(e) => setFechaInicio(e.target.value)} 
                style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
              />
            </div>
            <div className="form-group-sm" style={{ flex: '1', minWidth: '150px' }}>
              <label>Fecha Fin</label>
              <input 
                type="date" 
                value={fechaFin} 
                onChange={(e) => setFechaFin(e.target.value)} 
                style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
              />
            </div>
            <div className="form-group-sm" style={{ flex: '1', minWidth: '150px' }}>
              <label>Buscar por</label>
              <select
                value={criterioBusqueda}
                onChange={(e) => setCriterioBusqueda(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', outline: 'none' }}
              >
                <option value="todos">Todo</option>
                <option value="id">Nro. de Factura</option>
                <option value="nombre">Nombre de Cliente</option>
                <option value="cedula">Cédula / RIF</option>
              </select>
            </div>
            <div className="form-group-sm" style={{ flex: '2', minWidth: '250px' }}>
              <label>Buscar Venta / Cliente</label>
              <input 
                type="text" 
                placeholder={
                  criterioBusqueda === 'id' ? "Ej: 12 (Búsqueda exacta)" :
                  criterioBusqueda === 'nombre' ? "Ej: Kevin" :
                  criterioBusqueda === 'cedula' ? "Ej: V-12345678" :
                  "Filtrar por Cédula, Nombre o Nro. Venta..."
                }
                value={busquedaVentas}
                onChange={(e) => setBusquedaVentas(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
              />
            </div>
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                const today = new Date().toISOString().split('T')[0];
                setFechaInicio(today);
                setFechaFin(today);
                setBusquedaVentas('');
                setCriterioBusqueda('todos');
              }}
              style={{ marginTop: '22px', height: '40px', padding: '0 16px' }}
            >
              Restablecer
            </button>
          </section>

          {/* Tarjetas de Estadísticas */}
          <section className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div className="card stats-card" style={{ borderTop: '4px solid var(--accent-oil)' }}>
              <span className="card-label">Facturado (USD)</span>
              <span className="total-amount" style={{ fontSize: '2rem' }}>${totalUSDFiltrado.toFixed(2)}</span>
            </div>
            <div className="card stats-card" style={{ borderTop: '4px solid var(--accent-info)' }}>
              <span className="card-label">Facturado (Bs)</span>
              <span className="total-amount" style={{ fontSize: '2rem', color: 'var(--accent-info)' }}>Bs. {totalBsFiltrado.toFixed(2)}</span>
            </div>
            <div className="card stats-card" style={{ borderTop: '4px solid var(--accent-success)' }}>
              <span className="card-label">Transacciones</span>
              <span className="total-amount" style={{ fontSize: '2rem', color: 'var(--accent-success)' }}>{ventasFiltradas.length}</span>
            </div>
            <div className="card stats-card" style={{ borderTop: '4px solid #a855f7' }}>
              <span className="card-label">Desglose de Cobro</span>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                <div>💵 Efectivo USD: <b>${totalEfectivoUSD.toFixed(2)}</b></div>
                <div>💳 Electrónico Bs: <b>Bs. {totalElectronicoBs.toFixed(2)}</b></div>
              </div>
            </div>
          </section>

          {/* Tabla de Historial */}
          <section className="cart-section">
            <div className="section-header">
              <h2>📋 Listado de Facturas</h2>
            </div>
            
            <div className="table-wrapper">
              {loading && ventasLista.length === 0 ? (
                <div className="empty-cart-state">
                  <h3>Cargando facturas...</h3>
                </div>
              ) : ventasFiltradas.length === 0 ? (
                <div className="empty-cart-state">
                  <h3>No se encontraron ventas</h3>
                  <p>Ajuste el rango de fechas o los filtros de búsqueda.</p>
                </div>
              ) : (
                <table className="cart-table">
                  <thead>
                    <tr>
                      <th>Venta ID</th>
                      <th>Fecha / Hora</th>
                      <th>Cliente</th>
                      <th>Cédula / RIF</th>
                      <th>Método Pago</th>
                      <th className="text-right">Total USD</th>
                      <th className="text-right">Total Bs.</th>
                      <th className="text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventasFiltradas.map((v) => (
                      <tr key={v.id}>
                        <td><b>#{v.id}</b></td>
                        <td>{new Date(v.fecha).toLocaleString()}</td>
                        <td className="name-cell" style={{ fontSize: '1.1rem' }}>{v.cliente_nombre || 'Consumidor Final'}</td>
                        <td className="barcode-cell">{v.cliente_cedula_rif || 'N/A'}</td>
                        <td>
                          <span className="category-badge" style={{ textTransform: 'uppercase', fontSize: '0.8rem', color: 'var(--accent-info)', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: '12px' }}>
                            {v.metodo_pago === 'mixto' ? 'Mixto' : v.metodo_pago.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="text-right subtotal-cell">${parseFloat(v.total).toFixed(2)}</td>
                        <td className="text-right" style={{ fontWeight: '600' }}>Bs. {(parseFloat(v.total) * parseFloat(v.tasa_cambio)).toFixed(2)}</td>
                        <td className="text-center">
                          <button 
                            className="btn btn-secondary" 
                            onClick={() => {
                              setClienteSeleccionado({
                                nombre: v.cliente_nombre || 'Consumidor Final',
                                cedula_rif: v.cliente_cedula_rif,
                                telefono: v.cliente_telefono
                              });
                              setHistorialCliente([v]);
                              setShowHistorialModal(true);
                            }}
                            style={{ padding: '6px 12px', fontSize: '0.9rem' }}
                            title="Ver Factura Detallada"
                          >
                            👁️ Factura
                          </button>
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

      {/* VISTA 5: DASHBOARD DE RENDIMIENTO */}
      {currentView === 'dashboard' && (
        <main className="pos-main no-sidebar" style={{ flexDirection: 'column', gap: '24px' }}>
          {/* Tarjetas rápidas */}
          <section className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div className="card stats-card" style={{ borderTop: '4px solid var(--accent-oil)' }}>
              <span className="card-label">Facturado este Mes (USD)</span>
              <span className="total-amount" style={{ fontSize: '2.2rem' }}>${dbData.totalVentasMes.toFixed(2)}</span>
              <span className="card-desc" style={{ margin: 0, fontSize: '0.8rem' }}>Total bruto facturado en USD</span>
            </div>
            
            <div className="card stats-card" style={{ borderTop: '4px solid var(--accent-success)' }}>
              <span className="card-label">Utilidad Neta este Mes</span>
              <span className="total-amount" style={{ fontSize: '2.2rem', color: 'var(--accent-success)' }}>
                ${dbData.utilidadMes.toFixed(2)}
              </span>
              <span className="category-badge success" style={{
                alignSelf: 'flex-start',
                marginTop: '4px',
                fontSize: '0.8rem',
                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                color: '#22c55e',
                border: '1px solid currentColor',
                padding: '2px 8px',
                borderRadius: '12px',
                fontWeight: 'bold'
              }}>
                Margen: {dbData.totalVentasMes > 0 ? ((dbData.utilidadMes / dbData.totalVentasMes) * 100).toFixed(0) : 0}%
              </span>
            </div>
            
            <div className="card stats-card" style={{ borderTop: '4px solid var(--accent-info)' }}>
              <span className="card-label">Transacciones este Mes</span>
              <span className="total-amount" style={{ fontSize: '2.2rem', color: 'var(--accent-info)' }}>{dbData.transaccionesMes}</span>
              <span className="card-desc" style={{ margin: 0, fontSize: '0.8rem' }}>Cantidad total de facturas emitidas</span>
            </div>

            <div className="card stats-card" style={{ borderTop: '4px solid #a855f7' }}>
              <span className="card-label">Ticket Promedio (USD)</span>
              <span className="total-amount" style={{ fontSize: '2.2rem', color: '#a855f7' }}>${dbData.ticketPromedio.toFixed(2)}</span>
              <span className="card-desc" style={{ margin: 0, fontSize: '0.8rem' }}>Promedio facturado por cliente</span>
            </div>
          </section>

          {/* Gráficos y Top Productos */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
            {/* Columna Izquierda: Gráficos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="card" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '16px' }}>📈 Ventas de los Últimos 7 Días (USD)</h3>
                <div style={{ width: '100%', height: '220px', display: 'flex', alignItems: 'flex-end', paddingBottom: '10px' }}>
                  {(() => {
                    const maxMonto = Math.max(...dbData.ventas7Dias.map(d => d.monto), 10);
                    return (
                      <svg viewBox="0 0 500 200" width="100%" height="200" style={{ overflow: 'visible' }}>
                        <defs>
                          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--accent-oil)" />
                            <stop offset="100%" stopColor="rgba(245, 158, 11, 0.05)" />
                          </linearGradient>
                        </defs>
                        <line x1="40" y1="20" x2="480" y2="20" stroke="var(--border-color)" strokeDasharray="4 4" />
                        <line x1="40" y1="80" x2="480" y2="80" stroke="var(--border-color)" strokeDasharray="4 4" />
                        <line x1="40" y1="140" x2="480" y2="140" stroke="var(--border-color)" strokeDasharray="4 4" />
                        <line x1="40" y1="170" x2="480" y2="170" stroke="var(--border-color)" />

                        {dbData.ventas7Dias.map((d, index) => {
                          const barHeight = (d.monto / maxMonto) * 130;
                          const x = 50 + index * 60;
                          const y = 170 - barHeight;
                          return (
                            <g key={d.fechaStr}>
                              <rect
                                x={x}
                                y={y}
                                width="32"
                                height={Math.max(barHeight, 2)}
                                rx="4"
                                fill="url(#barGrad)"
                                style={{ transition: 'all 0.5s ease-in-out' }}
                              />
                              {d.monto > 0 && (
                                <text
                                  x={x + 16}
                                  y={y - 6}
                                  textAnchor="middle"
                                  fill="var(--text-main)"
                                  fontSize="10"
                                  fontWeight="bold"
                                >
                                  ${d.monto.toFixed(0)}
                                </text>
                              )}
                              <text
                                x={x + 16}
                                y="186"
                                textAnchor="middle"
                                fill="var(--text-muted)"
                                fontSize="10"
                              >
                                {d.label}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    );
                  })()}
                </div>
              </div>

              <div className="card" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '12px' }}>💳 Desglose de Métodos de Pago</h3>
                <p className="card-desc" style={{ marginBottom: '16px' }}>Distribución del dinero acumulado por tipo de pago</p>
                {(() => {
                  const totalPagos = Object.values(dbData.pagosMetodo).reduce((a, b) => a + b, 0) || 1;
                  const getPercent = (val) => ((val / totalPagos) * 100).toFixed(0);
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.9rem' }}>
                          <span>💵 Efectivo USD</span>
                          <span><b>${dbData.pagosMetodo.efectivo.toFixed(2)}</b> ({getPercent(dbData.pagosMetodo.efectivo)}%)</span>
                        </div>
                        <div style={{ height: '8px', borderRadius: '4px', backgroundColor: 'var(--border-color)', overflow: 'hidden' }}>
                          <div style={{ width: `${getPercent(dbData.pagosMetodo.efectivo)}%`, height: '100%', backgroundColor: 'var(--accent-oil)' }}></div>
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.9rem' }}>
                          <span>📱 Pago Móvil Bs</span>
                          <span><b>${dbData.pagosMetodo.pago_movil.toFixed(2)}</b> ({getPercent(dbData.pagosMetodo.pago_movil)}%)</span>
                        </div>
                        <div style={{ height: '8px', borderRadius: '4px', backgroundColor: 'var(--border-color)', overflow: 'hidden' }}>
                          <div style={{ width: `${getPercent(dbData.pagosMetodo.pago_movil)}%`, height: '100%', backgroundColor: 'var(--accent-info)' }}></div>
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.9rem' }}>
                          <span>💳 Punto de Venta Bs</span>
                          <span><b>${dbData.pagosMetodo.punto_venta.toFixed(2)}</b> ({getPercent(dbData.pagosMetodo.punto_venta)}%)</span>
                        </div>
                        <div style={{ height: '8px', borderRadius: '4px', backgroundColor: 'var(--border-color)', overflow: 'hidden' }}>
                          <div style={{ width: `${getPercent(dbData.pagosMetodo.punto_venta)}%`, height: '100%', backgroundColor: '#3b82f6' }}></div>
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.9rem' }}>
                          <span>🔀 Pago Mixto</span>
                          <span><b>${dbData.pagosMetodo.mixto.toFixed(2)}</b> ({getPercent(dbData.pagosMetodo.mixto)}%)</span>
                        </div>
                        <div style={{ height: '8px', borderRadius: '4px', backgroundColor: 'var(--border-color)', overflow: 'hidden' }}>
                          <div style={{ width: `${getPercent(dbData.pagosMetodo.mixto)}%`, height: '100%', backgroundColor: '#a855f7' }}></div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Columna Derecha: Top Productos */}
            <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '6px' }}>🏆 Top 5 Productos más Vendidos</h3>
              <p className="card-desc" style={{ marginBottom: '20px' }}>Los productos con mayor rotación en el negocio</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                {dbData.topProductos.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', margin: 'auto' }}>No hay ventas registradas para este periodo.</div>
                ) : (
                  dbData.topProductos.map((p, idx) => (
                    <div key={p.nombre} style={{ display: 'flex', alignItems: 'center', gap: '16px', paddingBottom: '12px', borderBottom: idx < 4 ? '1px solid var(--border-color)' : 'none' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: idx === 0 ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-tertiary)',
                        color: idx === 0 ? 'var(--accent-oil)' : 'var(--text-main)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '0.95rem',
                        border: idx === 0 ? '1px solid var(--accent-oil)' : '1px solid var(--border-color)'
                      }}>
                        #{idx + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ fontWeight: '600', fontSize: '0.95rem', marginBottom: '2px' }}>{p.nombre}</h4>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{p.cant} unidades vendidas</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'block' }}>${p.total.toFixed(2)}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Facturado</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </main>
      )}

      {/* VISTA 6: HISTORIAL DE CIERRES DE CAJA */}
      {currentView === 'cierres' && (
        <main className="pos-main no-sidebar" style={{ flexDirection: 'column', gap: '20px' }}>
          {/* Filtros */}
          <section className="filters-section card" style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="form-group-sm" style={{ flex: '1', minWidth: '250px' }}>
              <label>Buscar Cierre (Fecha o n8n)</label>
              <input 
                type="text" 
                placeholder="Filtrar por Fecha (Ej: 2026-06-13) o Mensaje..."
                value={busquedaCierres}
                onChange={(e) => setBusquedaCierres(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', outline: 'none' }}
              />
            </div>
            <button 
              className="btn btn-secondary" 
              onClick={() => setBusquedaCierres('')}
              style={{ marginTop: '22px', height: '40px', padding: '0 16px' }}
            >
              Restablecer Filtro
            </button>
          </section>

          {/* Tabla de Cierres */}
          <section className="cart-section">
            <div className="section-header">
              <h2>📋 Listado de Cierres de Caja</h2>
            </div>
            
            <div className="table-wrapper">
              {loading && cierresLista.length === 0 ? (
                <div className="empty-cart-state">
                  <h3>Cargando cierres...</h3>
                </div>
              ) : cierresLista.filter(c => {
                if (!busquedaCierres.trim()) return true;
                const q = busquedaCierres.toLowerCase();
                return c.fecha.includes(q) || (c.mensaje_n8n || '').toLowerCase().includes(q);
              }).length === 0 ? (
                <div className="empty-cart-state">
                  <h3>No se encontraron cierres registrados</h3>
                  <p>Realice un cierre desde el Punto de Venta para guardarlo en el historial.</p>
                </div>
              ) : (
                <table className="cart-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th className="text-right">Tasa del Día</th>
                      <th className="text-right">Total USD</th>
                      <th className="text-right">Total Bs.</th>
                      <th className="text-center">Cant. Productos</th>
                      <th>Desglose de Cobro (USD)</th>
                      <th className="text-center">Sincronización n8n</th>
                      <th>Mensaje / Respuesta</th>
                      <th className="text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cierresLista.filter(c => {
                      if (!busquedaCierres.trim()) return true;
                      const q = busquedaCierres.toLowerCase();
                      return c.fecha.includes(q) || (c.mensaje_n8n || '').toLowerCase().includes(q);
                    }).map((c) => (
                      <tr key={c.id}>
                        <td><b>{c.fecha}</b></td>
                        <td className="text-right">Bs. {parseFloat(c.tasa_cambio).toFixed(2)}</td>
                        <td className="text-right" style={{ fontWeight: '600', color: 'var(--accent-oil)' }}>
                          ${parseFloat(c.monto_acumulado).toFixed(2)}
                        </td>
                        <td className="text-right" style={{ fontWeight: '600' }}>
                          Bs. {(parseFloat(c.monto_acumulado) * parseFloat(c.tasa_cambio)).toFixed(2)}
                        </td>
                        <td className="text-center">{c.productos_vendidos_count} unidades</td>
                        <td>
                          <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div>💵 Ef: <b>${parseFloat(c.efectivo_usd).toFixed(2)}</b></div>
                            <div>📱 PM: <b>${parseFloat(c.pago_movil_usd).toFixed(2)}</b></div>
                            <div>💳 PV: <b>${parseFloat(c.punto_venta_usd).toFixed(2)}</b></div>
                          </div>
                        </td>
                        <td className="text-center">
                          <span className="category-badge" style={{
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '0.8rem',
                            fontWeight: 'bold',
                            backgroundColor: c.sincronizado_n8n ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: c.sincronizado_n8n ? '#22c55e' : '#ef4444',
                            border: '1px solid currentColor'
                          }}>
                            {c.sincronizado_n8n ? 'Sincronizado' : 'Offline / Pendiente'}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.mensaje_n8n}>
                          {c.mensaje_n8n || 'Sincronizado exitosamente.'}
                        </td>
                        <td className="text-center">
                          <button
                            className="btn btn-secondary"
                            onClick={() => {
                              setCierreFechaSelected(c.fecha);
                              setShowCierreDetalleModal(true);
                            }}
                            style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                            title="Ver Productos Vendidos en este día"
                          >
                            👁️ Detalle
                          </button>
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

      {/* Modal de Detalle de Cierre (Factura Visual / Ticket de Venta) */}
      {showCierreDetalleModal && details && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ width: '650px', maxWidth: '95%' }}>
            <div className="modal-header">
              <h2>Detalle de Cierre de Caja ({details.cierre.fecha})</h2>
              <button className="btn-close" onClick={() => setShowCierreDetalleModal(false)}>×</button>
            </div>
            
            {/* Pestañas / Tabs */}
            <div className="modal-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '16px' }}>
              <button 
                className={`tab-btn ${detalleTab === 'ticket' ? 'active' : ''}`}
                onClick={() => setDetalleTab('ticket')}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'none',
                  border: 'none',
                  borderBottom: detalleTab === 'ticket' ? '2px solid var(--accent-oil)' : 'none',
                  color: detalleTab === 'ticket' ? 'var(--accent-oil)' : 'var(--text-muted)',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '0.95rem'
                }}
              >
                📄 Comprobante Consolidado
              </button>
              <button 
                className={`tab-btn ${detalleTab === 'ventas' ? 'active' : ''}`}
                onClick={() => setDetalleTab('ventas')}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'none',
                  border: 'none',
                  borderBottom: detalleTab === 'ventas' ? '2px solid var(--accent-oil)' : 'none',
                  color: detalleTab === 'ventas' ? 'var(--accent-oil)' : 'var(--text-muted)',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '0.95rem'
                }}
              >
                🧾 Transacciones ({details.sales.length})
              </button>
            </div>

            <div className="modal-body print-section-modal" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {detalleTab === 'ticket' ? (
                <div className="ticket-container" style={{
                  backgroundColor: '#ffffff',
                  color: '#1e293b',
                  padding: '24px',
                  borderRadius: '8px',
                  boxShadow: 'inset 0 0 10px rgba(0,0,0,0.05)',
                  fontFamily: 'monospace, Courier, monospace',
                  fontSize: '0.9rem',
                  lineHeight: '1.4'
                }}>
                  {/* Cabecera del ticket */}
                  <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                    <h2 style={{ margin: '0 0 4px 0', fontSize: '1.4rem', fontWeight: 'bold', color: '#0f172a' }}>LUBRICANTES RUTA 8</h2>
                    <p style={{ margin: '0', fontSize: '0.8rem', color: '#64748b' }}>COMPROBANTE DE CIERRE DIARIO</p>
                    <p style={{ margin: '0', fontSize: '0.8rem', color: '#64748b' }}>----------------------------------</p>
                    <p style={{ margin: '4px 0 0 0', fontWeight: 'bold' }}>Fecha: {details.cierre.fecha}</p>
                    <p style={{ margin: '2px 0 0 0' }}>Tasa del día: <b>Bs. {parseFloat(details.cierre.tasa_cambio).toFixed(2)}</b></p>
                  </div>

                  <p style={{ margin: '0 0 6px 0' }}>-------------------------------------------------</p>
                  
                  {/* Tabla de productos */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px dashed #94a3b8', textAlign: 'left' }}>
                        <th style={{ padding: '4px 0', width: '8%' }}>CANT</th>
                        <th style={{ padding: '4px 0', width: '52%' }}>PRODUCTO</th>
                        <th style={{ padding: '4px 0', textAlign: 'right', width: '20%' }}>P.UNIT</th>
                        <th style={{ padding: '4px 0', textAlign: 'right', width: '20%' }}>TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.products.length === 0 ? (
                        <tr>
                          <td colSpan="4" style={{ padding: '12px 0', textAlign: 'center', color: '#64748b' }}>
                            No hubo productos vendidos este día.
                          </td>
                        </tr>
                      ) : (
                        details.products.map((p, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px dotted #e2e8f0' }}>
                            <td style={{ padding: '6px 0', verticalAlign: 'top' }}>{p.cantidad}</td>
                            <td style={{ padding: '6px 0', verticalAlign: 'top', paddingRight: '4px' }}>{p.nombre}</td>
                            <td style={{ padding: '6px 0', textAlign: 'right', verticalAlign: 'top' }}>${p.precio_unitario.toFixed(2)}</td>
                            <td style={{ padding: '6px 0', textAlign: 'right', verticalAlign: 'top', fontWeight: 'bold' }}>${p.total_usd.toFixed(2)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>

                  <p style={{ margin: '6px 0' }}>-------------------------------------------------</p>

                  {/* Resumen e Indicadores */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>CANTIDAD TOTAL VENDIDA:</span>
                      <b>{details.cierre.productos_vendidos_count} unidades</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 'bold', marginTop: '6px', color: '#0f172a' }}>
                      <span>TOTAL GENERAL (USD):</span>
                      <span>${parseFloat(details.cierre.monto_acumulado).toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 'bold', color: '#475569' }}>
                      <span>TOTAL GENERAL (BS):</span>
                      <span>Bs. {(parseFloat(details.cierre.monto_acumulado) * parseFloat(details.cierre.tasa_cambio)).toFixed(2)}</span>
                    </div>
                  </div>

                  <p style={{ margin: '10px 0' }}>-------------------------------------------------</p>

                  {/* Desglose de pagos */}
                  <div>
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '0.9rem', fontWeight: 'bold', color: '#0f172a' }}>DESGLOSE DE FORMA DE PAGO:</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', paddingLeft: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>💵 Efectivo USD:</span>
                        <span>${parseFloat(details.cierre.efectivo_usd).toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>📱 Pago Móvil (USD equiv):</span>
                        <span>${parseFloat(details.cierre.pago_movil_usd).toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>💳 Punto de Venta (USD equiv):</span>
                        <span>${parseFloat(details.cierre.punto_venta_usd).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <p style={{ margin: '10px 0' }}>-------------------------------------------------</p>

                  {/* Margen de Ganancia (Costo vs PVP) - Gerencial */}
                  <div>
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '0.9rem', fontWeight: 'bold', color: '#1e3a8a' }}>📊 AUDITORÍA Y GANANCIAS (GERENCIAL):</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', paddingLeft: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Costo de Adquisición Total:</span>
                        <span>${details.totalCostoVendido.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#16a34a' }}>
                        <span>Utilidad Neta Estimada:</span>
                        <span>${details.gananciaNeta.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#64748b' }}>
                        <span>Margen de Utilidad Promedio:</span>
                        <span>
                          {details.totalVendidoUSD > 0 
                            ? `${((details.gananciaNeta / details.totalVendidoUSD) * 100).toFixed(1)}%`
                            : '0.0%'
                          }
                        </span>
                      </div>
                    </div>
                  </div>

                  <p style={{ margin: '10px 0 4px 0' }}>-------------------------------------------------</p>
                  <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#64748b' }}>
                    <p style={{ margin: '0' }}>¡Cierre auditado localmente!</p>
                    <p style={{ margin: '2px 0 0 0' }}>Sincronización n8n: {details.cierre.sincronizado_n8n ? '✅ EXITO' : '❌ PENDIENTE'}</p>
                  </div>
                </div>
              ) : (
                /* Listado de transacciones individuales */
                <div className="sales-list-container" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {details.sales.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      No se encontraron transacciones individuales registradas para este día en la memoria local.
                    </div>
                  ) : (
                    details.sales.map((sale) => (
                      <div key={sale.id} className="transaction-card" style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        padding: '12px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
                          <span style={{ fontWeight: 'bold', color: 'var(--accent-oil)' }}>Venta #{sale.id}</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {new Date(sale.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.85rem', marginBottom: '6px' }}>
                          <div>Cliente: <b>{sale.cliente_nombre || 'Consumidor Final'}</b> {sale.cliente_cedula_rif && `(C.I./R.I.F: ${sale.cliente_cedula_rif})`}</div>
                          <div>Forma de pago: <b style={{ textTransform: 'capitalize' }}>{sale.metodo_pago.replace('_', ' ')}</b> {sale.metodo_pago_restante && `+ ${sale.metodo_pago_restante.replace('_', ' ')}`}</div>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', marginTop: '6px' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                              <th style={{ textAlign: 'left', padding: '2px 0' }}>Prod</th>
                              <th style={{ textAlign: 'center', padding: '2px 0' }}>Cant</th>
                              <th style={{ textAlign: 'right', padding: '2px 0' }}>Precio</th>
                              <th style={{ textAlign: 'right', padding: '2px 0' }}>Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(sale.detalles || []).map((det, idx) => (
                              <tr key={idx}>
                                <td style={{ padding: '2px 0' }}>{det.producto?.nombre_completo || 'Desconocido'}</td>
                                <td style={{ textAlign: 'center', padding: '2px 0' }}>{det.cantidad}</td>
                                <td style={{ textAlign: 'right', padding: '2px 0' }}>${parseFloat(det.precio_unitario).toFixed(2)}</td>
                                <td style={{ textAlign: 'right', padding: '2px 0', fontWeight: 'bold' }}>${(parseFloat(det.precio_unitario) * det.cantidad).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', borderTop: '1px dashed var(--border-color)', paddingTop: '6px', fontWeight: 'bold', fontSize: '0.9rem' }}>
                          <span>Total Venta:</span>
                          <span style={{ color: 'var(--accent-oil)' }}>${parseFloat(sale.total).toFixed(2)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer no-print" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => window.print()}
                disabled={detalleTab !== 'ticket'}
                title={detalleTab !== 'ticket' ? 'Cambie al comprobante consolidado para imprimir' : 'Imprimir comprobante'}
              >
                🖨️ Imprimir Factura
              </button>
              <button className="btn btn-primary" onClick={() => setShowCierreDetalleModal(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Importación de Productos (CSV / Excel) */}
      {showImportModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ width: '600px', maxWidth: '95%' }}>
            <div className="modal-header">
              <h2>📥 Importar Productos desde Excel o CSV</h2>
              <button className="btn-close" onClick={() => setShowImportModal(false)}>×</button>
            </div>
            
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ backgroundColor: 'rgba(6, 182, 212, 0.1)', border: '1px solid var(--accent-info)', borderRadius: '8px', padding: '12px', fontSize: '0.85rem' }}>
                <h4 style={{ margin: '0 0 6px 0', color: 'var(--accent-info)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  ℹ️ Formatos Soportados
                </h4>
                <p style={{ margin: '0 0 8px 0', lineHeight: '1.4' }}>
                  El sistema acepta planillas Excel (<b>.xlsx</b> / <b>.xls</b>) y archivos separados por comas (<b>.csv</b>).
                </p>
                <h5 style={{ margin: '0 0 4px 0', color: 'var(--text-main)', fontWeight: 'bold' }}>Planilla de Estantes (Formato Ruta 8):</h5>
                <p style={{ margin: '0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Las columnas deben seguir el orden: <code style={{ color: 'var(--accent-oil)', fontWeight: 'bold' }}>PRODUCTOS</code> (Col A), <code style={{ color: 'var(--accent-oil)', fontWeight: 'bold' }}>CANTIDAD</code> (Col B), <code style={{ color: 'var(--accent-oil)', fontWeight: 'bold' }}>P.UNIT</code> (Col C), y el precio de venta final en la columna <code style={{ color: 'var(--accent-oil)', fontWeight: 'bold' }}>TOTAL DÓLAR</code> (Col H) o <code style={{ color: 'var(--accent-oil)', fontWeight: 'bold' }}>SUBTOTAL</code> (Col G).
                </p>
              </div>

              <div className="form-group-sm" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontWeight: 'bold' }}>Seleccione el Archivo de Excel o CSV</label>
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  onChange={(e) => {
                    setImportFile(e.target.files[0]);
                    setImportResults(null);
                  }}
                  style={{
                    padding: '12px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-main)',
                    width: '100%'
                  }}
                />
              </div>

              {importing && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center', padding: '12px', color: 'var(--accent-oil)', fontWeight: 'bold' }}>
                  <span className="animate-spin">⏳</span> Procesando catálogo e importando productos...
                </div>
              )}

              {importResults && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', border: '1px solid #22c55e', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#22c55e' }}>{importResults.creados}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Productos Creados</div>
                    </div>
                    <div style={{ backgroundColor: 'rgba(6, 182, 212, 0.1)', border: '1px solid var(--accent-info)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent-info)' }}>{importResults.actualizados}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Productos Actualizados</div>
                    </div>
                  </div>

                  {importResults.errores && importResults.errores.length > 0 && (
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                      <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-danger)', padding: '8px 12px', fontWeight: 'bold', fontSize: '0.85rem', borderBottom: '1px solid var(--border-color)' }}>
                        ⚠️ Advertencias / Errores en filas ({importResults.errores.length})
                      </div>
                      <div style={{
                        maxHeight: '120px',
                        overflowY: 'auto',
                        padding: '10px',
                        backgroundColor: 'var(--bg-primary)',
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}>
                        {importResults.errores.map((err, i) => (
                          <div key={i} style={{ color: 'var(--accent-danger)' }}>• {err}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowImportModal(false)}
                disabled={importing}
              >
                Cancelar
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleImportFile}
                disabled={importing || !importFile}
              >
                Procesar Archivo
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
                            setClienteCedulaRifTipo('V');
                            setClienteCedulaRifNumero('');
                            setClienteNombre('Consumidor Final');
                            setClienteTelefono('');
                            setClienteTelefonoPrefijo('0412');
                            setClienteTelefonoResto('');
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
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <select
                          value={clienteCedulaRifTipo}
                          onChange={(e) => setClienteCedulaRifTipo(e.target.value)}
                          style={{
                            width: '80px',
                            padding: '10px',
                            borderRadius: '6px',
                            backgroundColor: 'var(--bg-primary)',
                            color: 'var(--text-main)',
                            border: '1px solid var(--border-color)',
                            outline: 'none'
                          }}
                        >
                          <option value="V">V</option>
                          <option value="J">J</option>
                        </select>
                        <input 
                          type="text" 
                          placeholder="Ej: 12345678" 
                          value={clienteCedulaRifNumero}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            setClienteCedulaRifNumero(val);
                          }}
                          style={{ flex: 1 }}
                          autoFocus
                        />
                      </div>
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
                      disabled={loading || (!consumidorFinal && !clienteCedulaRifNumero.trim())}
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
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select
                        value={clienteTelefonoPrefijo}
                        onChange={(e) => setClienteTelefonoPrefijo(e.target.value)}
                        style={{
                          width: '100px',
                          padding: '10px',
                          borderRadius: '6px',
                          backgroundColor: 'var(--bg-primary)',
                          color: 'var(--text-main)',
                          border: '1px solid var(--border-color)',
                          outline: 'none'
                        }}
                      >
                        <option value="0412">0412</option>
                        <option value="0414">0414</option>
                        <option value="0424">0424</option>
                        <option value="0416">0416</option>
                        <option value="0426">0426</option>
                      </select>
                      <input 
                        type="text" 
                        placeholder="1234567" 
                        value={clienteTelefonoResto}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          if (val.length <= 7) {
                            setClienteTelefonoResto(val);
                          }
                        }}
                        style={{ flex: 1 }}
                      />
                    </div>
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
                        const rest = clienteTelefonoResto.trim();
                        if (rest && rest.length !== 7) {
                          addAlert('warning', 'El número de teléfono debe tener exactamente 7 dígitos.');
                          return;
                        }
                        setClienteTelefono(rest ? `${clienteTelefonoPrefijo}${rest}` : '');
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
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'right' }}>
                          Tasa aplicada: <b>Bs. {tasaCambio.toFixed(2)}</b>
                        </div>
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
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                              Tasa cobrada: <b>Bs. {parseFloat(venta.tasa_cambio || 1.00).toFixed(2)}</b>
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
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      value={editCedulaRifTipo}
                      onChange={(e) => setEditCedulaRifTipo(e.target.value)}
                      style={{
                        width: '80px',
                        padding: '10px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--bg-primary)',
                        color: 'var(--text-main)',
                        border: '1px solid var(--border-color)',
                        outline: 'none'
                      }}
                    >
                      <option value="V">V</option>
                      <option value="J">J</option>
                    </select>
                    <input 
                      type="text" 
                      placeholder="Ej: 12345678" 
                      value={editCedulaRifNumero}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setEditCedulaRifNumero(val);
                      }}
                      style={{ flex: 1 }}
                    />
                  </div>
                </div>
                <div className="form-group-sm">
                  <label>Teléfono (Opcional)</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      value={editTelefonoPrefijo}
                      onChange={(e) => setEditTelefonoPrefijo(e.target.value)}
                      style={{
                        width: '100px',
                        padding: '10px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--bg-primary)',
                        color: 'var(--text-main)',
                        border: '1px solid var(--border-color)',
                        outline: 'none'
                      }}
                    >
                      <option value="0412">0412</option>
                      <option value="0414">0414</option>
                      <option value="0424">0424</option>
                      <option value="0416">0416</option>
                      <option value="0426">0426</option>
                    </select>
                    <input 
                      type="text" 
                      placeholder="1234567" 
                      value={editTelefonoResto}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        if (val.length <= 7) {
                          setEditTelefonoResto(val);
                        }
                      }}
                      style={{ flex: 1 }}
                    />
                  </div>
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
    </div>
  );
}

export default POS;
