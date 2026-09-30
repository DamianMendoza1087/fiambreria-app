import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator, Platform, StatusBar } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { loginUser, fetchProducts, createProduct, updateProduct, deleteProduct, fetchUsers, createUser, updateUserPermissions, submitStockAudit, createPreSale, fetchPendingPreSales, deletePreSale, finalizeSale, fetchCashSessionStatus, openCashSession, closeCashSession, fetchCashAuditsByDate, fetchWorkLogs, fetchEmployeePerformance, compareEmployeesMetrics, fetchMRPStats } from './api';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState('');
  
  // Permisos por módulo
  const [isAccountActive, setIsAccountActive] = useState(false);
  const [canPreventa, setCanPreventa] = useState(true);
  const [canCaja, setCanCaja] = useState(false);
  const [canStock, setCanStock] = useState(false);
  const [canIngreso, setCanIngreso] = useState(false);
  
  const [currentTab, setCurrentTab] = useState('preventa');
  
  // Login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Productos & Buscadores
  const [products, setProducts] = useState([]);
  const [searchQueryVendor, setSearchQueryVendor] = useState('');
  const [searchQueryCashier, setSearchQueryCashier] = useState('');
  const [searchQueryStock, setSearchQueryStock] = useState('');

  // Auditoría
  const [selectedAuditProd, setSelectedAuditProd] = useState(null);
  const [countedQtyInput, setCountedQtyInput] = useState('');

  // Ingreso / Edición de Producto
  const [editingProductId, setEditingProductId] = useState(null);
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState('Varios');
  const [prodCost, setProdCost] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodSupplier, setProdSupplier] = useState('');
  const [prodStock, setProdStock] = useState('');
  const [prodUnitType, setProdUnitType] = useState('unid');
  const [prodBarcode, setProdBarcode] = useState('');

  // Cámara / Escáner
  const [permission, requestPermission] = useCameraPermissions();
  const [showCamera, setShowCamera] = useState(false);
  const [cameraTarget, setCameraTarget] = useState(null);
  const [scanned, setScanned] = useState(false);

  // Carritos
  const [vendorCart, setVendorCart] = useState([]);
  const [pendingPreSales, setPendingPreSales] = useState([]);
  const [selectedPreSaleId, setSelectedPreSaleId] = useState(null);
  const [cashierCart, setCashierCart] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('Efectivo');
  const [amountMP, setAmountMP] = useState('');
  const [cashTendered, setCashTendered] = useState('');

  // CAJA Y ARQUEO
  const [cashStatus, setCashStatus] = useState({ is_open: false });
  const [initialCashInput, setInitialCashInput] = useState('');
  const [closeCashInput, setCloseCashInput] = useState('');
  const [closeAttempt, setCloseAttempt] = useState(1);
  const [showCloseModal, setShowCloseModal] = useState(false);

  // VERIFICACIÓN DE CAJA
  const [selectedAuditDate, setSelectedAuditDate] = useState(new Date().toISOString().split('T')[0]);
  const [cashAuditsList, setCashAuditsList] = useState([]);

  // RRHH & COMPARATIVA DE EMPLEADOS
  const [usersList, setUsersList] = useState([]);
  const [workLogs, setWorkLogs] = useState([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPass, setNewUserPass] = useState('');
  
  const [empCompare1, setEmpCompare1] = useState('');
  const [empCompare2, setEmpCompare2] = useState('');
  const [comparisonResult, setComparisonResult] = useState(null);

  // MRP COMPRAS INTELIGENTES
  const [mrpSuggestions, setMrpSuggestions] = useState([]);
  const [mrpDays, setMrpDays] = useState('7');
  const [mrpTargetDays, setMrpTargetDays] = useState('3');

  const loadInitialData = async () => {
    try {
      setProducts(await fetchProducts());
      const users = await fetchUsers();
      setUsersList(users);
      if (users.length > 1) {
        setEmpCompare1(users[0].email);
        setEmpCompare2(users[1].email);
      }
      setPendingPreSales(await fetchPendingPreSales());
      setCashStatus(await fetchCashSessionStatus());

      const currentUser = users.find(u => u.email === email);
      if (currentUser) {
        setIsAccountActive(currentUser.is_active);
        setCanPreventa(currentUser.can_preventa);
        setCanCaja(currentUser.can_caja);
        setCanStock(currentUser.can_stock);
        setCanIngreso(currentUser.can_ingreso ?? true);
      }
    } catch (e) {
      console.log('Error de sincronización:', e.message);
    }
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    loadInitialData();
    const interval = setInterval(() => {
      loadInitialData();
    }, 5000);
    return () => clearInterval(interval);
  }, [isLoggedIn]);

  const handleTabChange = async (tabName) => {
    setCurrentTab(tabName);
    if (tabName === 'verificacion') loadCashAudits();
    else if (tabName === 'rrhh') loadHRData();
    else if (tabName === 'mrp') loadMRPData();
    await loadInitialData();
  };

  const loadCashAudits = async () => {
    try {
      setLoading(true);
      setCashAuditsList(await fetchCashAuditsByDate(selectedAuditDate));
    } catch (e) {
      alert('Error cargando auditorías de caja');
    } finally {
      setLoading(false);
    }
  };

  const loadHRData = async () => {
    try {
      setLoading(true);
      setWorkLogs(await fetchWorkLogs());
      setUsersList(await fetchUsers());
    } catch (e) {
      alert('Error al obtener datos de RRHH');
    } finally {
      setLoading(false);
    }
  };

  const handleCompareEmployees = async () => {
    if (!empCompare1 || !empCompare2) return alert('Seleccioná dos empleados para comparar');
    if (empCompare1 === empCompare2) return alert('Seleccioná dos empleados distintos');
    try {
      setLoading(true);
      const res = await compareEmployeesMetrics(empCompare1, empCompare2, 30);
      setComparisonResult(res);
    } catch (e) {
      alert('Error en la comparativa de empleados');
    } finally {
      setLoading(false);
    }
  };

  const loadMRPData = async () => {
    try {
      setLoading(true);
      const d = parseInt(mrpDays) || 7;
      const t = parseInt(mrpTargetDays) || 3;
      setMrpSuggestions(await fetchMRPStats(d, t));
    } catch (e) {
      alert('Error cargando sugerencias de MRP');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) return alert('Por favor ingresá tu email y contraseña.');
    try {
      setLoading(true);
      const res = await loginUser(email, password);
      setIsLoggedIn(true);
      setUserRole(res.role || 'vendedor');
      setIsAccountActive(res.is_active);
      setCanPreventa(res.can_preventa);
      setCanCaja(res.can_caja);
      setCanStock(res.can_stock);
      setCanIngreso(res.can_ingreso ?? true);
      
      await loadInitialData();
    } catch (e) {
      alert('Error de inicio de sesión: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setEmail(''); setPassword(''); setUserRole('');
    setIsAccountActive(false); setCanPreventa(false); setCanCaja(false); setCanStock(false); setCanIngreso(false);
  };

  const handleOpenCash = async () => {
    if (!initialCashInput) return alert('Ingresá el monto inicial de caja');
    try {
      setLoading(true);
      const val = parseFloat(initialCashInput.replace(',', '.'));
      await openCashSession(val, email);
      alert('✅ Caja abierta correctamente. Podés comenzar a cobrar.');
      setInitialCashInput('');
      await loadInitialData();
    } catch (e) {
      alert('Error al abrir la caja: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseCash = async () => {
    if (!closeCashInput) return alert('Ingresá el monto final en efectivo contado');
    try {
      setLoading(true);
      const val = parseFloat(closeCashInput.replace(',', '.'));
      const res = await closeCashSession(val, email, closeAttempt);

      if (res.status === 'mismatch_first_attempt') {
        alert(res.message);
        setCloseAttempt(2);
        setCloseCashInput('');
      } else {
        if (res.is_correct) {
          alert(`✅ ${res.message}`);
        } else {
          alert(`⚠️ Arqueo finalizado: ${res.message}`);
        }
        setShowCloseModal(false);
        setCloseCashInput('');
        setCloseAttempt(1);
        await loadInitialData();
      }
    } catch (e) {
      alert('Error al cerrar caja: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleCamera = async (targetModule) => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        alert('Se requieren permisos de cámara para escanear.');
        return;
      }
    }
    if (showCamera && cameraTarget === targetModule) {
      setShowCamera(false);
      setCameraTarget(null);
    } else {
      setCameraTarget(targetModule);
      setShowCamera(true);
    }
  };

  const handleBarcodeScanned = ({ data }) => {
    setScanned(true);
    setShowCamera(false);

    if (cameraTarget === 'ingreso') {
      setProdBarcode(data);
      alert(`✅ Código EAN capturado: ${data}`);
    } else if (cameraTarget === 'preventa') {
      const found = products.find(p => p.barcode === data);
      if (found) {
        addToVendorCart(found);
        alert(`✅ Agregado a Pre-venta: ${found.name}`);
      } else {
        alert(`⚠️ Código EAN ${data} no encontrado.`);
      }
    } else if (cameraTarget === 'caja') {
      const found = products.find(p => p.barcode === data);
      if (found) {
        addToCashierCart(found);
        alert(`✅ Agregado a Caja: ${found.name}`);
      } else {
        alert(`⚠️ Código EAN ${data} no encontrado.`);
      }
    } else if (cameraTarget === 'stock') {
      const found = products.find(p => p.barcode === data);
      if (found) {
        setSelectedAuditProd(found);
        alert(`🎯 Producto seleccionado para conteo: ${found.name}`);
      } else {
        alert(`⚠️ Código EAN ${data} no encontrado.`);
      }
    }

    setTimeout(() => setScanned(false), 2000);
  };

  const handleSaveAudit = async () => {
    if (!selectedAuditProd || !countedQtyInput) return alert('Ingresá la cantidad contada');
    try {
      setLoading(true);
      const val = parseFloat(countedQtyInput.replace(',', '.'));
      await submitStockAudit(selectedAuditProd.id, val, email);
      alert(`✅ Conteo registrado para ${selectedAuditProd.name}: ${val} ${selectedAuditProd.unit_type}`);
      setSelectedAuditProd(null);
      setCountedQtyInput('');
      setSearchQueryStock('');
      await loadInitialData();
    } catch (e) {
      alert('Error al registrar conteo');
    } finally {
      setLoading(false);
    }
  };

  const addToVendorCart = (prod) => {
    const existing = vendorCart.find(i => i.id === prod.id);
    const step = prod.unit_type === 'kg' ? 0.25 : 1;
    const currentQty = existing ? existing.qty : 0;
    const newQty = currentQty + step;

    if (newQty > prod.stock) {
      return alert(`⚠️ Stock insuficiente. Solo quedan ${prod.stock} ${prod.unit_type} disponibles.`);
    }

    if (existing) {
      setVendorCart(vendorCart.map(i => i.id === prod.id ? { ...i, qty: newQty } : i));
    } else {
      setVendorCart([...vendorCart, { ...prod, qty: step }]);
    }
    setSearchQueryVendor('');
  };

  const updateVendorCartQty = (id, delta) => {
    setVendorCart(vendorCart.map(item => {
      if (item.id === id) {
        const prod = products.find(p => p.id === id);
        const step = item.unit_type === 'kg' ? 0.25 : 1;
        const newQty = item.qty + (delta * step);
        const maxStock = prod ? prod.stock : 999;

        if (newQty > maxStock) {
          alert(`⚠️ No podés superar el stock disponible (${maxStock} ${item.unit_type})`);
          return item;
        }
        return newQty > 0 ? { ...item, qty: newQty } : null;
      }
      return item;
    }).filter(Boolean));
  };

  const updateVendorCartDirectQty = (id, valString) => {
    const cleanVal = valString.replace(',', '.');
    const val = parseFloat(cleanVal) || 0;
    const prod = products.find(p => p.id === id);
    const maxStock = prod ? prod.stock : 999;

    setVendorCart(vendorCart.map(item => {
      if (item.id === id) {
        if (val > maxStock) {
          alert(`⚠️ Supera el stock disponible (${maxStock} ${item.unit_type}).`);
        }
        return { ...item, qty: cleanVal };
      }
      return item;
    }));
  };

  const handleGeneratePreSale = async () => {
    if (vendorCart.length === 0) return alert('El carrito de pre-venta está vacío');
    try {
      setLoading(true);
      const items = vendorCart.map(i => ({ product_id: i.id, quantity: parseFloat(i.qty) || 0 }));
      const res = await createPreSale({ items, created_by: email });
      alert(`✅ Pre-venta #${res.presale_id} generada correctamente`);
      setVendorCart([]);
      await loadInitialData();
    } catch (e) {
      alert('Error al generar pre-venta');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPreSale = (ps) => {
    setSelectedPreSaleId(ps.id);
    setCashierCart(ps.items.map(i => {
      const prod = products.find(p => p.id === i.product_id);
      return {
        id: i.product_id,
        name: i.name,
        price_per_unit: i.price_per_unit,
        unit_type: i.unit_type || (prod ? prod.unit_type : 'unid'),
        qty: i.qty,
        maxStock: prod ? prod.stock : 999
      };
    }));
    setCashTendered(''); setAmountMP('');
  };

  const handleCancelPreSale = async (psId) => {
    try {
      setLoading(true);
      await deletePreSale(psId);
      alert(`🗑️ Pre-venta #${psId} cancelada`);
      if (selectedPreSaleId === psId) {
        setSelectedPreSaleId(null);
        setCashierCart([]);
      }
      await loadInitialData();
    } catch (e) {
      alert('Error al cancelar pre-venta');
    } finally {
      setLoading(false);
    }
  };

  const updateCashierCartQty = (id, delta) => {
    setCashierCart(cashierCart.map(item => {
      if (item.id === id) {
        const prod = products.find(p => p.id === id);
        const step = item.unit_type === 'kg' ? 0.25 : 1;
        const currentNum = parseFloat(item.qty) || 0;
        const newQty = currentNum + (delta * step);
        const maxStock = prod ? prod.stock : 999;

        if (newQty > maxStock) {
          alert(`⚠️ No podés superar el stock disponible (${maxStock} ${item.unit_type})`);
          return item;
        }
        return newQty > 0 ? { ...item, qty: newQty } : null;
      }
      return item;
    }).filter(Boolean));
  };

  const updateCashierCartDirectQty = (id, valString) => {
    const cleanVal = valString.replace(',', '.');
    const val = parseFloat(cleanVal) || 0;
    const prod = products.find(p => p.id === id);
    const maxStock = prod ? prod.stock : 999;

    setCashierCart(cashierCart.map(item => {
      if (item.id === id) {
        if (val > maxStock) {
          alert(`⚠️ Supera el stock disponible (${maxStock} ${item.unit_type}).`);
        }
        return { ...item, qty: cleanVal };
      }
      return item;
    }));
  };

  const addToCashierCart = (prod) => {
    const existing = cashierCart.find(i => i.id === prod.id);
    const step = prod.unit_type === 'kg' ? 0.25 : 1;
    const currentQty = existing ? (parseFloat(existing.qty) || 0) : 0;
    const newQty = currentQty + step;

    if (newQty > prod.stock) {
      return alert(`⚠️ Stock insuficiente. Solo quedan ${prod.stock} ${prod.unit_type} disponibles.`);
    }

    if (existing) {
      setCashierCart(cashierCart.map(i => i.id === prod.id ? { ...i, qty: newQty } : i));
    } else {
      setCashierCart([...cashierCart, { ...prod, qty: step, price_per_unit: prod.price_per_unit }]);
    }
    setSearchQueryCashier('');
  };

  const getCashierTotal = () => cashierCart.reduce((acc, i) => acc + (i.price_per_unit * (parseFloat(i.qty) || 0)), 0).toFixed(2);

  const getRequiredCash = () => {
    const total = parseFloat(getCashierTotal()) || 0;
    if (paymentMethod === 'Efectivo') return total;
    if (paymentMethod === 'Mixto') {
      const mpVal = parseFloat(amountMP) || 0;
      return Math.max(0, total - mpVal);
    }
    return 0;
  };

  const getChangeDue = () => {
    const cashRequired = getRequiredCash();
    const tendered = parseFloat(cashTendered) || 0;
    const change = tendered - cashRequired;
    return change > 0 ? change.toFixed(2) : '0.00';
  };

  const handleFinalizeSale = async () => {
    if (!cashStatus.is_open) return alert('⚠️️ Debes abrir la caja antes de procesar ventas.');
    if (cashierCart.length === 0) return alert('No hay productos en el ticket de caja');
    const total = parseFloat(getCashierTotal());
    let cash = 0, mp = 0;

    if (paymentMethod === 'Efectivo') {
      cash = total;
      const tendered = parseFloat(cashTendered) || 0;
      if (tendered < total) {
        return alert(`⚠️ El dinero ingresado ($${tendered}) es menor que el total ($${total})`);
      }
    } else if (paymentMethod === 'Mercado Pago') {
      mp = total;
    } else {
      mp = parseFloat(amountMP) || 0;
      if (mp > total) {
        return alert(`⚠️ El monto de Mercado Pago ($${mp}) no puede superar el total ($${total})`);
      }
      cash = total - mp;
      const tendered = parseFloat(cashTendered) || 0;
      if (cash > 0 && tendered < cash) {
        return alert(`⚠️ El dinero ingresado ($${tendered}) es menor que el saldo en efectivo ($${cash.toFixed(2)})`);
      }
    }

    try {
      setLoading(true);
      await finalizeSale({
        presale_id: selectedPreSaleId,
        items: cashierCart.map(i => ({ product_id: i.id, quantity: parseFloat(i.qty) || 0 })),
        total_amount: total,
        amount_cash: cash,
        amount_mp: mp,
        payment_method: paymentMethod,
        sold_by: email
      });
      alert(`💳 Venta cobrada con éxito!\nVuelto a entregar en efectivo: $${getChangeDue()}`);
      setSelectedPreSaleId(null);
      setCashierCart([]);
      setAmountMP(''); setCashTendered('');
      await loadInitialData();
    } catch (e) {
      alert('Error procesando cobro');
    } finally {
      setLoading(false);
    }
  };

  const handleStartEditProduct = (prod) => {
    setEditingProductId(prod.id);
    setProdName(prod.name);
    setProdCategory(prod.category || 'Varios');
    setProdCost(prod.cost_price ? String(prod.cost_price) : '0');
    setProdPrice(String(prod.price_per_unit));
    setProdSupplier(prod.supplier || '');
    setProdStock(String(prod.stock));
    setProdUnitType(prod.unit_type || 'unid');
    setProdBarcode(prod.barcode || '');
  };

  const handleCancelEditProduct = () => {
    setEditingProductId(null);
    setProdName(''); setProdCost(''); setProdPrice(''); setProdSupplier(''); setProdStock(''); setProdBarcode(''); setProdUnitType('unid');
  };

  const handleSaveProduct = async () => {
    if (!prodName || !prodPrice || !prodStock) return alert('Completá nombre, precio de venta y stock');
    try {
      setLoading(true);
      const payload = {
        name: prodName,
        category: prodCategory,
        cost_price: parseFloat((prodCost || '0').replace(',', '.')),
        price_per_unit: parseFloat(prodPrice.replace(',', '.')),
        supplier: prodSupplier || null,
        unit_type: prodUnitType,
        stock: parseFloat(prodStock.replace(',', '.')),
        barcode: prodBarcode || null,
        is_active: true
      };

      if (editingProductId) {
        await updateProduct(editingProductId, payload);
        alert('✅ Producto actualizado correctamente');
      } else {
        await createProduct(payload);
        alert('✅ Producto ingresado correctamente');
      }

      handleCancelEditProduct();
      await loadInitialData();
    } catch (e) {
      alert('Error al guardar/actualizar producto');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (id) => {
    try {
      setLoading(true);
      await deleteProduct(id);
      await loadInitialData();
    } catch (e) {
      alert('Error al eliminar');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserName || !newUserEmail || !newUserPass) return alert('Completá los datos del usuario');
    try {
      setLoading(true);
      await createUser({ name: newUserName, email: newUserEmail, password: newUserPass });
      setNewUserName(''); setNewUserEmail(''); setNewUserPass('');
      await loadInitialData();
      alert('Empleado registrado. Habilitale la jornada en RRHH.');
    } catch (e) {
      alert('Error al registrar usuario');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePermission = async (user, permKey) => {
    try {
      setLoading(true);
      const updated = {
        is_active: permKey === 'is_active' ? !user.is_active : user.is_active,
        can_preventa: permKey === 'can_preventa' ? !user.can_preventa : user.can_preventa,
        can_caja: permKey === 'can_caja' ? !user.can_caja : user.can_caja,
        can_stock: permKey === 'can_stock' ? !user.can_stock : user.can_stock,
        can_ingreso: permKey === 'can_ingreso' ? !user.can_ingreso : (user.can_ingreso ?? false),
      };
      await updateUserPermissions(user.id, updated);
      await loadInitialData();
      if (permKey === 'is_active') loadHRData();
    } catch (e) {
      alert('Error al actualizar permisos del usuario');
    } finally {
      setLoading(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loginCard}>
          <Text style={styles.appTitle}>🍖 Fiambrería POS & MRP</Text>
          <TextInput style={styles.input} placeholder="Correo Electrónico" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <TextInput style={styles.input} placeholder="Contraseña" secureTextEntry value={password} onChangeText={setPassword} />
          <TouchableOpacity style={styles.buttonPrimary} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Ingresar</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAccountActive && userRole !== 'superadmin') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loginCard}>
          <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#dc3545', textAlign: 'center', marginBottom: 10 }}>🔒 Jornada No Habilitada</Text>
          <Text style={{ textAlign: 'center', color: '#555', marginBottom: 20 }}>
            Tu usuario aún no ha sido habilitado para iniciar el turno por el Dueño/Admin.
          </Text>
          <TouchableOpacity style={styles.buttonDanger} onPress={handleLogout}>
            <Text style={styles.buttonText}>Cerrar Sesión</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
const filteredProductsVendor = searchQueryVendor.trim() === '' ? [] : products.filter(p => p.name.toLowerCase().includes(searchQueryVendor.toLowerCase()));
  const filteredProductsCashier = searchQueryCashier.trim() === '' ? [] : products.filter(p => p.name.toLowerCase().includes(searchQueryCashier.toLowerCase()));
  const filteredProductsStock = searchQueryStock.trim() === '' ? [] : products.filter(p => p.name.toLowerCase().includes(searchQueryStock.toLowerCase()) || (p.barcode && p.barcode.includes(searchQueryStock)));

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>🍖 Fiambrería POS & MRP</Text>
          <Text style={{ color: '#ccc', fontSize: 11 }}>Usuario: {email} ({userRole})</Text>
        </View>
        <TouchableOpacity onPress={handleLogout}><Text style={{ color: '#dc3545', fontWeight: 'bold' }}>🚪 Salir</Text></TouchableOpacity>
      </View>

      <View style={styles.body}>
        {/* PRE-VENTA */}
        {currentTab === 'preventa' && (canPreventa || userRole === 'superadmin') && (
          <ScrollView contentContainerStyle={styles.scrollPadding} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>🛒 Pre-venta (Mostrador)</Text>
            
            <TouchableOpacity style={styles.buttonCamera} onPress={() => toggleCamera('preventa')}>
              <Text style={styles.buttonText}>{showCamera && cameraTarget === 'preventa' ? '📷 Cerrar Escáner' : '📷 Escanear EAN con Cámara'}</Text>
            </TouchableOpacity>

            {showCamera && cameraTarget === 'preventa' && permission?.granted && (
              <View style={styles.cameraContainer}>
                <CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={scanned ? undefined : handleBarcodeScanned} />
              </View>
            )}

            <Text style={styles.subSectionTitle}>🔍 Buscar Producto por Nombre / Código:</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Escribí para buscar (ej: ja, queso, salame...)"
              value={searchQueryVendor}
              onChangeText={setSearchQueryVendor}
            />

            {searchQueryVendor.trim() !== '' && (
              <View style={styles.dropdownContainer}>
                {filteredProductsVendor.length === 0 ? (
                  <Text style={{ padding: 10, color: '#888' }}>No se encontraron coincidencias.</Text>
                ) : (
                  filteredProductsVendor.map(p => (
                    <TouchableOpacity key={p.id} style={styles.dropdownItem} onPress={() => addToVendorCart(p)}>
                      <Text style={{ fontWeight: 'bold' }}>{p.name}</Text>
                      <Text style={{ color: '#28a745', fontSize: 12 }}>${p.price_per_unit} / {p.unit_type} | Stock: {p.stock} {p.unit_type}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            <Text style={styles.subSectionTitle}>Comanda de Pre-venta:</Text>
            {vendorCart.length === 0 ? <Text style={styles.emptyText}>Sin productos seleccionados</Text> : (
              vendorCart.map(i => (
                <View key={i.id} style={styles.cartRow}>
                  <Text style={{ flex: 1, fontWeight: 'bold' }}>{i.name}</Text>

                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateVendorCartQty(i.id, -1)}>
                      <Text style={{ color: '#fff', fontWeight: 'bold' }}>-</Text>
                    </TouchableOpacity>

                    <TextInput
                      style={styles.inputSmall}
                      keyboardType="numeric"
                      value={String(i.qty)}
                      onChangeText={(val) => updateVendorCartDirectQty(i.id, val)}
                    />

                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateVendorCartQty(i.id, 1)}>
                      <Text style={{ color: '#fff', fontWeight: 'bold' }}>+</Text>
                    </TouchableOpacity>

                    <Text style={{ fontSize: 11, marginLeft: 4, marginRight: 8, color: '#444' }}>{i.unit_type}</Text>
                  </View>

                  <Text style={{ fontWeight: 'bold' }}>${((i.price_per_unit) * (parseFloat(i.qty) || 0)).toFixed(2)}</Text>
                </View>
              ))
            )}
            
            <TouchableOpacity style={styles.buttonPrimary} onPress={handleGeneratePreSale} disabled={loading}>
              <Text style={styles.buttonText}>📝 Enviar Pre-venta a Caja</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* CAJA */}
        {currentTab === 'caja' && (canCaja || userRole === 'superadmin') && (
          <ScrollView contentContainerStyle={styles.scrollPadding} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>💳 Caja y Cobro</Text>

            {!cashStatus.is_open ? (
              <View style={styles.card}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#dc3545', textAlign: 'center', marginBottom: 10 }}>🔴 Caja Cerrada</Text>
                <Text style={{ color: '#555', textAlign: 'center', marginBottom: 15 }}>
                  Ingresá el **Fondo Fijo / Monto Inicial en Efectivo** para dar inicio a las ventas de la jornada:
                </Text>

                <TextInput
                  style={styles.inputHighlight}
                  placeholder="Monto Inicial en Efectivo ($)"
                  keyboardType="numeric"
                  value={initialCashInput}
                  onChangeText={setInitialCashInput}
                />

                <TouchableOpacity style={styles.buttonSuccess} onPress={handleOpenCash} disabled={loading}>
                  <Text style={styles.buttonText}>🔓 Abrir Caja e Iniciar Jornada</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#d4edda', padding: 12, borderRadius: 8, marginBottom: 15 }}>
                  <View>
                    <Text style={{ fontWeight: 'bold', color: '#155724' }}>🟢 CAJA ABIERTA</Text>
                    <Text style={{ fontSize: 11, color: '#155724' }}>Abierta por: {cashStatus.opened_by} ({cashStatus.opened_at}) | Fondo: ${cashStatus.initial_amount}</Text>
                  </View>
                  <TouchableOpacity style={{ backgroundColor: '#dc3545', padding: 8, borderRadius: 6 }} onPress={() => setShowCloseModal(true)}>
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>🔒 Arqueo / Cierre</Text>
                  </TouchableOpacity>
                </View>

                {showCloseModal && (
                  <View style={{ backgroundColor: '#fff3cd', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#ffeeba', marginBottom: 15 }}>
                    <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#856404', marginBottom: 6 }}>
                      🔒 Cierre Único de Caja a Ciegas
                    </Text>
                    <Text style={{ fontSize: 12, color: '#856404', marginBottom: 10 }}>
                      Ingresá el total de dinero en **Efectivo** contado en la caja:
                    </Text>

                    <TextInput
                      style={styles.inputHighlight}
                      placeholder="Monto total contado ($)"
                      keyboardType="numeric"
                      value={closeCashInput}
                      onChangeText={setCloseCashInput}
                    />

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                      <TouchableOpacity style={[styles.buttonPrimary, { flex: 0.48, backgroundColor: '#6c757d' }]} onPress={() => { setShowCloseModal(false); setCloseAttempt(1); }}>
                        <Text style={styles.buttonText}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.buttonDanger, { flex: 0.48 }]} onPress={handleCloseCash} disabled={loading}>
                        <Text style={styles.buttonText}>Confirmar Cierre</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <Text style={styles.subSectionTitle}>Pre-ventas Pendientes:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }}>
                  {pendingPreSales.length === 0 ? <Text style={styles.emptyText}>No hay pre-ventas pendientes.</Text> : (
                    pendingPreSales.map(ps => (
                      <View key={ps.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity 
                          style={[styles.preSaleBadge, selectedPreSaleId === ps.id && styles.preSaleBadgeActive]} 
                          onPress={() => handleSelectPreSale(ps)}
                        >
                          <Text style={{ fontWeight: 'bold', color: selectedPreSaleId === ps.id ? '#fff' : '#007bff' }}>
                            Ticket #{ps.id} ({ps.created_at})
                          </Text>
                          <Text style={{ color: selectedPreSaleId === ps.id ? '#fff' : '#333' }}>${ps.total.toFixed(2)}</Text>
                        </TouchableOpacity>

                        {(userRole === 'superadmin' || userRole === 'dueno') && (
                          <TouchableOpacity 
                            style={{ backgroundColor: '#dc3545', padding: 8, borderRadius: 6, marginRight: 12 }} 
                            onPress={() => handleCancelPreSale(ps.id)}
                          >
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>❌ Borrar</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))
                  )}
                </ScrollView>

                <TouchableOpacity style={styles.buttonCamera} onPress={() => toggleCamera('caja')}>
                  <Text style={styles.buttonText}>{showCamera && cameraTarget === 'caja' ? '📷 Cerrar Escáner' : '📷 Agregar con Escáner EAN'}</Text>
                </TouchableOpacity>

                {showCamera && cameraTarget === 'caja' && permission?.granted && (
                  <View style={styles.cameraContainer}>
                    <CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={scanned ? undefined : handleBarcodeScanned} />
                  </View>
                )}

                <Text style={styles.subSectionTitle}>🔍 Agregar Producto Adicional:</Text>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Buscar para agregar al ticket..."
                  value={searchQueryCashier}
                  onChangeText={setSearchQueryCashier}
                />

                {searchQueryCashier.trim() !== '' && (
                  <View style={styles.dropdownContainer}>
                    {filteredProductsCashier.length === 0 ? (
                      <Text style={{ padding: 10, color: '#888' }}>No se encontraron coincidencias.</Text>
                    ) : (
                      filteredProductsCashier.map(p => (
                        <TouchableOpacity key={p.id} style={styles.dropdownItem} onPress={() => addToCashierCart(p)}>
                          <Text style={{ fontWeight: 'bold' }}>{p.name}</Text>
                          <Text style={{ color: '#28a745', fontSize: 12 }}>${p.price_per_unit} / {p.unit_type} | Stock: {p.stock} {p.unit_type}</Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                )}

                <Text style={styles.subSectionTitle}>Edición de Ticket en Caja:</Text>
                {cashierCart.length === 0 ? <Text style={styles.emptyText}>Seleccioná una pre-venta o agregá productos.</Text> : (
                  cashierCart.map(i => (
                    <View key={i.id} style={styles.cartRow}>
                      <Text style={{ flex: 1, fontWeight: 'bold' }}>{i.name}</Text>
                      
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity style={styles.qtyBtn} onPress={() => updateCashierCartQty(i.id, -1)}>
                          <Text style={{ color: '#fff', fontWeight: 'bold' }}>-</Text>
                        </TouchableOpacity>
                        
                        <TextInput
                          style={styles.inputSmall}
                          keyboardType="numeric"
                          value={String(i.qty)}
                          onChangeText={(val) => updateCashierCartDirectQty(i.id, val)}
                        />

                        <TouchableOpacity style={styles.qtyBtn} onPress={() => updateCashierCartQty(i.id, 1)}>
                          <Text style={{ color: '#fff', fontWeight: 'bold' }}>+</Text>
                        </TouchableOpacity>

                        <Text style={{ fontSize: 11, marginLeft: 4, marginRight: 8, color: '#444' }}>{i.unit_type}</Text>
                      </View>

                      <Text style={{ fontWeight: 'bold' }}>${((i.price_per_unit) * (parseFloat(i.qty) || 0)).toFixed(2)}</Text>
                    </View>
                  ))
                )}

                <Text style={styles.subSectionTitle}>Método de Pago:</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                  <TouchableOpacity style={[styles.payBtn, paymentMethod === 'Efectivo' && styles.payBtnActive]} onPress={() => setPaymentMethod('Efectivo')}><Text style={styles.buttonText}>Efectivo</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.payBtn, paymentMethod === 'Mercado Pago' && styles.payBtnActive]} onPress={() => setPaymentMethod('Mercado Pago')}><Text style={styles.buttonText}>Mercado Pago</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.payBtn, paymentMethod === 'Mixto' && styles.payBtnActive]} onPress={() => setPaymentMethod('Mixto')}><Text style={styles.buttonText}>Mixto</Text></TouchableOpacity>
                </View>

                {paymentMethod === 'Mixto' && (
                  <View style={styles.card}>
                    <Text style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 5 }}>📱 Cobro con Mercado Pago:</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Monto a cobrar por MP ($)"
                      keyboardType="numeric"
                      value={amountMP}
                      onChangeText={setAmountMP}
                    />
                    <Text style={{ fontSize: 13, color: '#007bff', fontWeight: 'bold', marginTop: 4 }}>
                      💵 Restante a cobrar en Efectivo: ${getRequiredCash().toFixed(2)}
                    </Text>
                  </View>
                )}

                {(paymentMethod === 'Efectivo' || paymentMethod === 'Mixto') && (
                  <View style={styles.changeCard}>
                    <Text style={{ fontWeight: 'bold', fontSize: 13, color: '#333', marginBottom: 6 }}>
                      💵 Paga con Billete/Efectivo: (Requerido: ${getRequiredCash().toFixed(2)})
                    </Text>
                    <TextInput
                      style={styles.inputHighlight}
                      placeholder={`Ej: ${getRequiredCash().toFixed(2)}`}
                      keyboardType="numeric"
                      value={cashTendered}
                      onChangeText={setCashTendered}
                    />
                    
                    <View style={styles.changeRow}>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#155724' }}>💰 Vuelto en Efectivo:</Text>
                      <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#28a745' }}>${getChangeDue()}</Text>
                    </View>
                  </View>
                )}

                <View style={styles.totalBox}>
                  <Text style={{ fontSize: 18, fontWeight: 'bold' }}>TOTAL TICKET:</Text>
                  <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#28a745' }}>${getCashierTotal()}</Text>
                </View>

                <TouchableOpacity style={styles.buttonSuccess} onPress={handleFinalizeSale} disabled={loading}>
                  <Text style={styles.buttonText}>💳 Concretar Venta y Cobrar</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        )}

        {/* MÓDULO RRHH - HABILIACIÓN, FICHAJE Y COMPARATIVA */}
        {currentTab === 'rrhh' && (userRole === 'superadmin' || userRole === 'dueno') && (
          <ScrollView contentContainerStyle={styles.scrollPadding}>
            <Text style={styles.sectionTitle}>👨‍💼 RRHH, Fichaje y Rendimiento</Text>

            <Text style={styles.subSectionTitle}>Habilitación Diaria y Fichaje de Turno</Text>
            {usersList.filter(u => u.role !== 'superadmin').map(u => (
              <View key={u.id} style={styles.card}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{u.name}</Text>
                    <Text style={{ color: '#666', fontSize: 12 }}>{u.email}</Text>
                  </View>

                  <TouchableOpacity 
                    style={[styles.typeBtn, { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: u.is_active ? '#28a745' : '#dc3545' }]} 
                    onPress={() => handleTogglePermission(u, 'is_active')}
                  >
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>
                      {u.is_active ? '🟢 EN JORNADA' : '🔴 FUERA DE TURNO'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {/* SECCIÓN COMPARATIVA DE EMPLEADOS */}
            <View style={[styles.card, { marginTop: 10 }]}>
              <Text style={styles.subSectionTitle}>⚖️ Comparativa de Desempeño (Últimos 30 días)</Text>
              
              <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#555' }}>Empleado 1:</Text>
              <View style={{ borderBottomWidth: 1, borderBottomColor: '#ccc', marginBottom: 10 }}>
                {usersList.map(u => (
                  <TouchableOpacity 
                    key={`emp1-${u.id}`} 
                    style={{ padding: 6, backgroundColor: empCompare1 === u.email ? '#e8f4f8' : '#fff' }}
                    onPress={() => setEmpCompare1(u.email)}
                  >
                    <Text style={{ fontWeight: empCompare1 === u.email ? 'bold' : 'normal', color: empCompare1 === u.email ? '#007bff' : '#333' }}>
                      {u.name} ({u.email})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#555' }}>Empleado 2:</Text>
              <View style={{ borderBottomWidth: 1, borderBottomColor: '#ccc', marginBottom: 10 }}>
                {usersList.map(u => (
                  <TouchableOpacity 
                    key={`emp2-${u.id}`} 
                    style={{ padding: 6, backgroundColor: empCompare2 === u.email ? '#e8f4f8' : '#fff' }}
                    onPress={() => setEmpCompare2(u.email)}
                  >
                    <Text style={{ fontWeight: empCompare2 === u.email ? 'bold' : 'normal', color: empCompare2 === u.email ? '#007bff' : '#333' }}>
                      {u.name} ({u.email})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.buttonPrimary} onPress={handleCompareEmployees} disabled={loading}>
                <Text style={styles.buttonText}>🔍 Comparar Rendimiento</Text>
              </TouchableOpacity>

              {comparisonResult && (
                <View style={{ marginTop: 15, backgroundColor: '#f8f9fa', padding: 12, borderRadius: 8 }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 15, color: '#007bff', textAlign: 'center', marginBottom: 10 }}>
                    📊 Resultados Comparativos
                  </Text>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                    {/* COLUMNA EMPLEADO 1 */}
                    <View style={{ flex: 0.48, backgroundColor: '#fff', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#ddd' }}>
                      <Text style={{ fontWeight: 'bold', color: '#007bff' }}>{comparisonResult.emp1.name}</Text>
                      <Text style={{ fontSize: 11, marginTop: 4 }}>Ventas: <Text style={{ fontWeight: 'bold' }}>{comparisonResult.emp1.sales_count}</Text></Text>
                      <Text style={{ fontSize: 11 }}>Total: <Text style={{ fontWeight: 'bold', color: '#28a745' }}>${comparisonResult.emp1.total_revenue}</Text></Text>
                      <Text style={{ fontSize: 11 }}>Ticket Prom: <Text style={{ fontWeight: 'bold' }}>${comparisonResult.emp1.ticket_avg}</Text></Text>
                      <Text style={{ fontSize: 11 }}>Horas: <Text style={{ fontWeight: 'bold' }}>{comparisonResult.emp1.total_hours} hs</Text></Text>
                      <Text style={{ fontSize: 11 }}>Dif. Caja: <Text style={{ fontWeight: 'bold', color: '#dc3545' }}>${comparisonResult.emp1.total_cash_diff}</Text></Text>
                    </View>

                    {/* COLUMNA EMPLEADO 2 */}
                    <View style={{ flex: 0.48, backgroundColor: '#fff', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#ddd' }}>
                      <Text style={{ fontWeight: 'bold', color: '#6f42c1' }}>{comparisonResult.emp2.name}</Text>
                      <Text style={{ fontSize: 11, marginTop: 4 }}>Ventas: <Text style={{ fontWeight: 'bold' }}>{comparisonResult.emp2.sales_count}</Text></Text>
                      <Text style={{ fontSize: 11 }}>Total: <Text style={{ fontWeight: 'bold', color: '#28a745' }}>${comparisonResult.emp2.total_revenue}</Text></Text>
                      <Text style={{ fontSize: 11 }}>Ticket Prom: <Text style={{ fontWeight: 'bold' }}>${comparisonResult.emp2.ticket_avg}</Text></Text>
                      <Text style={{ fontSize: 11 }}>Horas: <Text style={{ fontWeight: 'bold' }}>{comparisonResult.emp2.total_hours} hs</Text></Text>
                      <Text style={{ fontSize: 11 }}>Dif. Caja: <Text style={{ fontWeight: 'bold', color: '#dc3545' }}>${comparisonResult.emp2.total_cash_diff}</Text></Text>
                    </View>
                  </View>

                  <View style={{ backgroundColor: '#e2e3e5', padding: 10, borderRadius: 6, marginTop: 6 }}>
                    <Text style={{ fontWeight: 'bold', fontSize: 12, color: '#383d41', marginBottom: 4 }}>💡 Diagnóstico Automático:</Text>
                    {comparisonResult.diagnosis.map((line, idx) => (
                      <Text key={idx} style={{ fontSize: 11, color: '#383d41', marginBottom: 2 }}>{line}</Text>
                    ))}
                  </View>
                </View>
              )}
            </View>

            <Text style={styles.subSectionTitle}>📋 Registro de Horas Trabajadas (Fichero)</Text>
            {workLogs.length === 0 ? <Text style={styles.emptyText}>No hay fichajes registrados todavía.</Text> : (
              workLogs.map(log => (
                <View key={log.id} style={styles.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontWeight: 'bold', color: '#007bff' }}>{log.user_name}</Text>
                    <Text style={{ fontWeight: 'bold' }}>📅 {log.date}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                    Entrada: <Text style={{ fontWeight: 'bold' }}>{log.clock_in}</Text> | Salida: <Text style={{ fontWeight: 'bold' }}>{log.clock_out}</Text>
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#28a745', marginTop: 4 }}>
                    ⏱️ Horas acumuladas: {log.hours_worked} hs
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        )}

        {/* MÓDULO MRP - COMPRAS INTELIGENTES */}
        {currentTab === 'mrp' && (userRole === 'superadmin' || userRole === 'dueno') && (
          <ScrollView contentContainerStyle={styles.scrollPadding}>
            <Text style={styles.sectionTitle}>📦 MRP: Compras Inteligentes</Text>
            
            <View style={styles.card}>
              <Text style={{ fontSize: 12, color: '#555', marginBottom: 10 }}>
                Analiza las ventas históricas para determinar la demanda diaria y sugerir la compra exacta de productos, evitando stock inmovilizado o faltantes.
              </Text>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ flex: 0.48 }}>
                  <Text style={{ fontSize: 11, fontWeight: 'bold' }}>Días Análisis de Ventas:</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={mrpDays} onChangeText={setMrpDays} />
                </View>

                <View style={{ flex: 0.48 }}>
                  <Text style={{ fontSize: 11, fontWeight: 'bold' }}>Días Stock Objetivos:</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={mrpTargetDays} onChangeText={setMrpTargetDays} />
                </View>
              </View>

              <TouchableOpacity style={styles.buttonPrimary} onPress={loadMRPData} disabled={loading}>
                <Text style={styles.buttonText}>📊 Recalcular Sugerencias MRP</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.subSectionTitle}>🛒 Reposición Recomendada de Productos</Text>
            {mrpSuggestions.length === 0 ? (
              <Text style={styles.emptyText}>No hay recomendaciones de compra. O bien no hubo ventas recientes o el stock cubre la demanda.</Text>
            ) : (
              mrpSuggestions.map((item, idx) => {
                let badgeColor = '#28a745';
                if (item.status === 'AGOTADO') badgeColor = '#dc3545';
                if (item.status === 'CRÍTICO') badgeColor = '#fd7e14';

                return (
                  <View key={idx} style={styles.card}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{item.product_name}</Text>
                      <View style={{ backgroundColor: badgeColor, padding: 4, borderRadius: 4 }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{item.status}</Text>
                      </View>
                    </View>

                    <Text style={{ fontSize: 12, color: '#666' }}>Proveedor: {item.supplier}</Text>

                    <View style={{ backgroundColor: '#f8f9fa', padding: 10, borderRadius: 8, marginTop: 8 }}>
                      <Text style={{ fontSize: 12 }}>Stock Actual: <Text style={{ fontWeight: 'bold' }}>{item.current_stock} {item.unit_type}</Text></Text>
                      <Text style={{ fontSize: 12 }}>Ventas en {mrpDays} días: <Text style={{ fontWeight: 'bold' }}>{item.total_sold_period} {item.unit_type}</Text></Text>
                      <Text style={{ fontSize: 12 }}>Demanda Media Diaria: <Text style={{ fontWeight: 'bold' }}>{item.daily_demand} {item.unit_type}/día</Text></Text>
                      
                      <View style={{ borderTopWidth: 1, borderTopColor: '#ddd', marginTop: 6, paddingTop: 6 }}>
                        <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#007bff' }}>
                          💡 Sugerencia de Compra: {item.suggested_buy} {item.unit_type}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#dc3545', fontWeight: 'bold' }}>
                          Inversión Estimada: ${item.estimated_cost}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}

        {/* VERIFICACIÓN DE CAJA */}
        {currentTab === 'verificacion' && (userRole === 'superadmin' || userRole === 'dueno') && (
          <ScrollView contentContainerStyle={styles.scrollPadding}>
            <Text style={styles.sectionTitle}>🔍 Verificación de Caja y Auditoría</Text>
            
            <View style={styles.card}>
              <Text style={{ fontWeight: 'bold', marginBottom: 6 }}>Filtrar por Fecha (AAAA-MM-DD):</Text>
              <View style={{ flexDirection: 'row' }}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={selectedAuditDate}
                  onChangeText={setSelectedAuditDate}
                  placeholder="YYYY-MM-DD"
                />
                <TouchableOpacity style={[styles.buttonPrimary, { marginLeft: 8, marginTop: 0 }]} onPress={loadCashAudits}>
                  <Text style={styles.buttonText}>🔍 Buscar</Text>
                </TouchableOpacity>
              </View>
            </View>

            {cashAuditsList.length === 0 ? (
              <Text style={styles.emptyText}>No hay registros de caja para la fecha seleccionada.</Text>
            ) : (
              cashAuditsList.map(audit => (
                <View key={audit.id} style={styles.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ fontWeight: 'bold', fontSize: 16 }}>Jornada: {audit.date}</Text>
                    <Text style={{ fontWeight: 'bold', color: audit.is_open ? '#28a745' : '#dc3545' }}>
                      {audit.is_open ? '🟢 EN CURSO' : '🔴 CERRADA'}
                    </Text>
                  </View>

                  <Text style={{ fontSize: 12, color: '#555' }}>Apertura: {audit.opened_at} por {audit.opened_by}</Text>
                  <Text style={{ fontSize: 12, color: '#555' }}>Cierre: {audit.closed_at} por {audit.closed_by}</Text>
                  <Text style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>Tickets cobrados: {audit.total_sales_count}</Text>

                  <View style={{ backgroundColor: '#f8f9fa', padding: 10, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#007bff' }}>
                    <Text style={{ fontSize: 13 }}>Fondo Inicial: <Text style={{ fontWeight: 'bold' }}>${audit.initial_amount}</Text></Text>
                    <Text style={{ fontSize: 13 }}>Total Mercado Pago: <Text style={{ fontWeight: 'bold', color: '#007bff' }}>${audit.total_mp || 0}</Text></Text>
                    <Text style={{ fontSize: 13 }}>Efectivo Teórico Esperado: <Text style={{ fontWeight: 'bold' }}>${audit.expected_cash || 0}</Text></Text>
                    <Text style={{ fontSize: 13 }}>Efectivo Reportado a Ciegas: <Text style={{ fontWeight: 'bold' }}>${audit.reported_cash || 0}</Text></Text>
                    
                    {audit.difference !== null && (
                      <Text style={{ fontSize: 14, fontWeight: 'bold', marginTop: 4, color: audit.difference === 0 ? '#28a745' : '#dc3545' }}>
                        Diferencia: ${audit.difference} ({audit.status_message})
                      </Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}

        {/* AUDITORÍA Y CONTROL DE STOCK */}
        {currentTab === 'inventario' && (canStock || userRole === 'superadmin') && (
          <ScrollView contentContainerStyle={styles.scrollPadding} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>📦 Auditoría y Control de Inventario</Text>

            <View style={styles.card}>
              <Text style={styles.subSectionTitle}>👁️ Conteo Físico a Ciegas (Operario)</Text>

              <TouchableOpacity style={styles.buttonCamera} onPress={() => toggleCamera('stock')}>
                <Text style={styles.buttonText}>{showCamera && cameraTarget === 'stock' ? '📷 Cerrar Escáner' : '📷 Escanear EAN del Producto'}</Text>
              </TouchableOpacity>

              {showCamera && cameraTarget === 'stock' && permission?.granted && (
                <View style={styles.cameraContainer}>
                  <CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={scanned ? undefined : handleBarcodeScanned} />
                </View>
              )}

              <TextInput
                style={styles.searchInput}
                placeholder="🔍 O escribí el nombre para seleccionar..."
                value={searchQueryStock}
                onChangeText={setSearchQueryStock}
              />

              {searchQueryStock.trim() !== '' && (
                <View style={styles.dropdownContainer}>
                  {filteredProductsStock.length === 0 ? (
                    <Text style={{ padding: 10, color: '#888' }}>No se encontraron coincidencias.</Text>
                  ) : (
                    filteredProductsStock.map(p => (
                      <TouchableOpacity key={p.id} style={styles.dropdownItem} onPress={() => { setSelectedAuditProd(p); setSearchQueryStock(''); }}>
                        <Text style={{ fontWeight: 'bold' }}>{p.name}</Text>
                        <Text style={{ color: '#666', fontSize: 11 }}>EAN: {p.barcode || 'Sin EAN'} | Categoría: {p.category}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}

              {selectedAuditProd && (
                <View style={{ marginTop: 15, backgroundColor: '#e9ecef', padding: 12, borderRadius: 8 }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 15, color: '#007bff' }}>Producto seleccionado: {selectedAuditProd.name}</Text>
                  <Text style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>Ingresá la cantidad exacta física hallada:</Text>
                  
                  <TextInput
                    style={styles.inputHighlight}
                    placeholder={`Cantidad contada (${selectedAuditProd.unit_type})`}
                    keyboardType="numeric"
                    value={countedQtyInput}
                    onChangeText={setCountedQtyInput}
                  />

                  <TouchableOpacity style={styles.buttonSuccess} onPress={handleSaveAudit} disabled={loading}>
                    <Text style={styles.buttonText}>💾 Confirmar y Registrar Conteo</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {(userRole === 'superadmin' || userRole === 'dueno') && (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.subSectionTitle}>📊 Control Financiero y Auditable de Stock</Text>
                {products.map(p => {
                  const cost = p.cost_price || 0;
                  const price = p.price_per_unit || 0;
                  const margin = price > 0 ? (((price - cost) / price) * 100).toFixed(1) : 0;

                  return (
                    <View key={p.id} style={styles.productCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: 'bold', fontSize: 15 }}>{p.name}</Text>
                        <Text style={{ color: '#666', fontSize: 11 }}>Proveedor: <Text style={{ fontWeight: 'bold', color: '#333' }}>{p.supplier || 'Sin especificar'}</Text></Text>
                        
                        <View style={{ flexDirection: 'row', marginTop: 4 }}>
                          <Text style={{ fontSize: 11, color: '#dc3545', fontWeight: 'bold', marginRight: 10 }}>
                            Costo: ${cost}
                          </Text>
                          <Text style={{ fontSize: 11, color: '#28a745', fontWeight: 'bold', marginRight: 10 }}>
                            PVP: ${price}
                          </Text>
                          <Text style={{ fontSize: 11, color: '#6f42c1', fontWeight: 'bold' }}>
                            Margen: {margin}%
                          </Text>
                        </View>

                        <Text style={{ color: '#666', fontSize: 11, marginTop: 4 }}>
                          Stock Sistema: <Text style={{ fontWeight: 'bold', color: '#007bff' }}>{p.stock} {p.unit_type}</Text> | Conteo Físico: {p.last_counted_qty !== null && p.last_counted_qty !== undefined ? `${p.last_counted_qty} ${p.unit_type}` : 'Pendiente'}
                        </Text>
                      </View>

                      <TouchableOpacity style={[styles.buttonPrimary, { padding: 8 }]} onPress={() => { setCurrentTab('ingresos'); handleStartEditProduct(p); }}>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>✏️ Ajustar</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        )}

        {/* INGRESOS */}
        {currentTab === 'ingresos' && (canIngreso || userRole === 'superadmin' || userRole === 'dueno') && (
          <ScrollView contentContainerStyle={styles.scrollPadding} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>📥 Ingreso de Materiales y Costos</Text>
            <View style={styles.card}>
              <Text style={styles.subSectionTitle}>
                {editingProductId ? '✏️ Editar Producto, Costo o Precio' : '➕ Dar de Alta Nuevo Producto'}
              </Text>
              
              <TextInput style={styles.input} placeholder="Nombre del Producto" value={prodName} onChangeText={setProdName} />
              <TextInput style={styles.input} placeholder="Categoría (ej: Fiambres, Quesos, Miel)" value={prodCategory} onChangeText={setProdCategory} />
              
              {(userRole === 'superadmin' || userRole === 'dueno') && (
                <>
                  <TextInput style={styles.input} placeholder="Proveedor (ej: Distribuidora Pepito)" value={prodSupplier} onChangeText={setProdSupplier} />
                  <TextInput style={styles.input} placeholder="Costo de Compra ($) - Confidencial" keyboardType="numeric" value={prodCost} onChangeText={setProdCost} />
                </>
              )}

              <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#555', marginBottom: 6 }}>Unidad de Medida / Venta:</Text>
              <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                <TouchableOpacity 
                  style={[styles.typeBtn, prodUnitType === 'unid' && styles.typeBtnActive]} 
                  onPress={() => setProdUnitType('unid')}
                >
                  <Text style={{ color: prodUnitType === 'unid' ? '#fff' : '#333', fontWeight: 'bold' }}>Unidades (unid)</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.typeBtn, prodUnitType === 'kg' && styles.typeBtnActive, { marginLeft: 10 }]} 
                  onPress={() => setProdUnitType('kg')}
                >
                  <Text style={{ color: prodUnitType === 'kg' ? '#fff' : '#333', fontWeight: 'bold' }}>Kilogramos (kg)</Text>
                </TouchableOpacity>
              </View>

              <TextInput style={styles.input} placeholder={`Precio de Venta PVP por ${prodUnitType} ($)`} keyboardType="numeric" value={prodPrice} onChangeText={setProdPrice} />
              <TextInput style={styles.input} placeholder={`Cantidad Ingresada / Stock (${prodUnitType})`} keyboardType="numeric" value={prodStock} onChangeText={setProdStock} />
              
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Código de Barras / EAN" value={prodBarcode} onChangeText={setProdBarcode} />
                <TouchableOpacity style={[styles.buttonCamera, { marginLeft: 8, marginBottom: 0, padding: 12 }]} onPress={() => toggleCamera('ingreso')}>
                  <Text style={styles.buttonText}>📷 Capturar</Text>
                </TouchableOpacity>
              </View>

              {showCamera && cameraTarget === 'ingreso' && permission?.granted && (
                <View style={[styles.cameraContainer, { marginTop: 10 }]}>
                  <CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={scanned ? undefined : handleBarcodeScanned} />
                </View>
              )}

              <TouchableOpacity style={[styles.buttonPrimary, { marginTop: 15 }]} onPress={handleSaveProduct} disabled={loading}>
                <Text style={styles.buttonText}>
                  {editingProductId ? '💾 Guardar Cambios' : '+ Guardar / Ingresar Producto'}
                </Text>
              </TouchableOpacity>

              {editingProductId && (
                <TouchableOpacity style={[styles.buttonDanger, { marginTop: 8, backgroundColor: '#6c757d' }]} onPress={handleCancelEditProduct}>
                  <Text style={styles.buttonText}>Cancelar Edición</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.subSectionTitle}>Catálogo General Registrado</Text>
            {products.length === 0 ? <Text style={styles.emptyText}>No hay productos cargados en el sistema.</Text> : (
              products.map(p => (
                <View key={p.id} style={styles.productCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: 'bold', fontSize: 15 }}>{p.name}</Text>
                    <Text style={{ color: '#28a745', fontWeight: '600' }}>PVP: ${p.price_per_unit} / {p.unit_type}</Text>
                    {(userRole === 'superadmin' || userRole === 'dueno') && (
                      <Text style={{ color: '#dc3545', fontSize: 11 }}>Costo: ${p.cost_price || 0} | Proveedor: {p.supplier || 'N/A'}</Text>
                    )}
                    <Text style={{ color: '#666', fontSize: 12 }}>Stock Actual: {p.stock} {p.unit_type} | EAN: {p.barcode || 'Sin EAN'}</Text>
                  </View>
                  <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity style={[styles.buttonPrimary, { padding: 8, marginRight: 6 }]} onPress={() => handleStartEditProduct(p)}>
                      <Text style={styles.buttonText}>✏️ Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.buttonDanger} onPress={() => handleDeleteProduct(p.id)}>
                      <Text style={styles.buttonText}>Borrar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}

        {/* PERMISOS */}
        {currentTab === 'usuarios' && (userRole === 'superadmin' || userRole === 'dueno') && (
          <ScrollView contentContainerStyle={styles.scrollPadding} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>👥 Permisos por Módulo</Text>
            <View style={styles.card}>
              <Text style={styles.subSectionTitle}>Registrar Nuevo Empleado</Text>
              <TextInput style={styles.input} placeholder="Nombre Completo" value={newUserName} onChangeText={setNewUserName} />
              <TextInput style={styles.input} placeholder="Correo Electrónico" value={newUserEmail} onChangeText={setNewUserEmail} autoCapitalize="none" />
              <TextInput style={styles.input} placeholder="Contraseña" secureTextEntry value={newUserPass} onChangeText={setNewUserPass} />
              <TouchableOpacity style={styles.buttonPrimary} onPress={handleCreateUser} disabled={loading}>
                <Text style={styles.buttonText}>+ Guardar Empleado</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.subSectionTitle}>Acceso a Funciones del Sistema</Text>
            {usersList.map(u => (
              <View key={u.id} style={[styles.card, { marginBottom: 12 }]}>
                <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{u.name}</Text>
                <Text style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>{u.email}</Text>

                {u.role !== 'superadmin' && (
                  <View style={{ borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 8 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                      <TouchableOpacity 
                        style={[styles.badgeBtn, u.can_preventa && styles.badgeBtnActive, { width: '48%', marginBottom: 6 }]} 
                        onPress={() => handleTogglePermission(u, 'can_preventa')}
                      >
                        <Text style={{ color: u.can_preventa ? '#fff' : '#333', fontSize: 11, fontWeight: 'bold' }}>
                          🛒 Pre-venta {u.can_preventa ? '✓' : '✗'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={[styles.badgeBtn, u.can_caja && styles.badgeBtnActive, { width: '48%', marginBottom: 6 }]} 
                        onPress={() => handleTogglePermission(u, 'can_caja')}
                      >
                        <Text style={{ color: u.can_caja ? '#fff' : '#333', fontSize: 11, fontWeight: 'bold' }}>
                          💳 Caja {u.can_caja ? '✓' : '✗'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={[styles.badgeBtn, u.can_stock && styles.badgeBtnActive, { width: '48%' }]} 
                        onPress={() => handleTogglePermission(u, 'can_stock')}
                      >
                        <Text style={{ color: u.can_stock ? '#fff' : '#333', fontSize: 11, fontWeight: 'bold' }}>
                          📦 Inventario {u.can_stock ? '✓' : '✗'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={[styles.badgeBtn, u.can_ingreso && styles.badgeBtnActive, { width: '48%' }]} 
                        onPress={() => handleTogglePermission(u, 'can_ingreso')}
                      >
                        <Text style={{ color: u.can_ingreso ? '#fff' : '#333', fontSize: 11, fontWeight: 'bold' }}>
                          📥 Ingresos {u.can_ingreso ? '✓' : '✗'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* NAVBAR */}
      <View style={styles.navbar}>
        {(canPreventa || userRole === 'superadmin') && (
          <TouchableOpacity style={[styles.navBtn, currentTab === 'preventa' && styles.navActive]} onPress={() => handleTabChange('preventa')}>
            <Text style={styles.navText}>🛒 Ventas</Text>
          </TouchableOpacity>
        )}

        {(canCaja || userRole === 'superadmin') && (
          <TouchableOpacity style={[styles.navBtn, currentTab === 'caja' && styles.navActive]} onPress={() => handleTabChange('caja')}>
            <Text style={styles.navText}>💳 Caja</Text>
          </TouchableOpacity>
        )}

        {(userRole === 'superadmin' || userRole === 'dueno') && (
          <TouchableOpacity style={[styles.navBtn, currentTab === 'rrhh' && styles.navActive]} onPress={() => handleTabChange('rrhh')}>
            <Text style={styles.navText}>👨‍💼 RRHH</Text>
          </TouchableOpacity>
        )}

        {(userRole === 'superadmin' || userRole === 'dueno') && (
          <TouchableOpacity style={[styles.navBtn, currentTab === 'mrp' && styles.navActive]} onPress={() => handleTabChange('mrp')}>
            <Text style={styles.navText}>📊 MRP</Text>
          </TouchableOpacity>
        )}

        {(userRole === 'superadmin' || userRole === 'dueno') && (
          <TouchableOpacity style={[styles.navBtn, currentTab === 'verificacion' && styles.navActive]} onPress={() => handleTabChange('verificacion')}>
            <Text style={styles.navText}>🔍 Arqueo</Text>
          </TouchableOpacity>
        )}

        {(canStock || userRole === 'superadmin') && (
          <TouchableOpacity style={[styles.navBtn, currentTab === 'inventario' && styles.navActive]} onPress={() => handleTabChange('inventario')}>
            <Text style={styles.navText}>📦 Stock</Text>
          </TouchableOpacity>
        )}

        {(canIngreso || userRole === 'superadmin' || userRole === 'dueno') && (
          <TouchableOpacity style={[styles.navBtn, currentTab === 'ingresos' && styles.navActive]} onPress={() => handleTabChange('ingresos')}>
            <Text style={styles.navText}>📥 Ingresos</Text>
          </TouchableOpacity>
        )}

        {(userRole === 'superadmin' || userRole === 'dueno') && (
          <TouchableOpacity style={[styles.navBtn, currentTab === 'usuarios' && styles.navActive]} onPress={() => handleTabChange('usuarios')}>
            <Text style={styles.navText}>👥 Permisos</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#1a1a1a', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 25 : 0 },
  header: { backgroundColor: '#1a1a1a', padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  body: { flex: 1, backgroundColor: '#f4f6f8' },
  scrollPadding: { padding: 15, paddingBottom: 40 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  subSectionTitle: { fontSize: 14, fontWeight: 'bold', marginTop: 12, marginBottom: 8, color: '#444' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, marginBottom: 10 },
  searchInput: { backgroundColor: '#fff', borderWidth: 2, borderColor: '#007bff', padding: 12, borderRadius: 8, fontSize: 15, fontWeight: 'bold' },
  dropdownContainer: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#007bff', borderRadius: 8, marginTop: 4, marginBottom: 10, maxHeight: 200 },
  dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  inputHighlight: { backgroundColor: '#fff', borderWidth: 2, borderColor: '#007bff', padding: 12, borderRadius: 8, fontSize: 16, fontWeight: 'bold', color: '#007bff' },
  inputSmall: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc', padding: 6, borderRadius: 6, width: 65, textAlign: 'center', fontWeight: 'bold' },
  typeBtn: { flex: 1, padding: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, alignItems: 'center', backgroundColor: '#e9ecef' },
  typeBtnActive: { backgroundColor: '#007bff', borderColor: '#0056b3' },
  badgeBtn: { padding: 8, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, alignItems: 'center', backgroundColor: '#f8f9fa' },
  badgeBtnActive: { backgroundColor: '#28a745', borderColor: '#1e7e34' },
  buttonPrimary: { backgroundColor: '#007bff', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  buttonCamera: { backgroundColor: '#6f42c1', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  buttonSuccess: { backgroundColor: '#28a745', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  buttonDanger: { backgroundColor: '#dc3545', padding: 8, borderRadius: 6, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  cameraContainer: { height: 200, borderRadius: 10, overflow: 'hidden', marginBottom: 15 },
  cartRow: { backgroundColor: '#fff', padding: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  totalBox: { backgroundColor: '#fff', padding: 15, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 2, borderTopColor: '#28a745', marginTop: 10 },
  preSaleBadge: { backgroundColor: '#e9ecef', padding: 12, borderRadius: 8, marginRight: 8, borderWidth: 1, borderColor: '#ccc' },
  preSaleBadgeActive: { backgroundColor: '#007bff', borderColor: '#0056b3' },
  qtyBtn: { backgroundColor: '#007bff', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  payBtn: { flex: 0.31, padding: 10, backgroundColor: '#6c757d', borderRadius: 8, alignItems: 'center' },
  payBtnActive: { backgroundColor: '#007bff' },
  card: { backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 15 },
  changeCard: { backgroundColor: '#e8f4f8', padding: 15, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#b8daff' },
  changeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#bee5eb' },
  productCard: { backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  emptyText: { color: '#888', fontStyle: 'italic' },
  loginCard: { backgroundColor: '#fff', margin: 20, padding: 20, borderRadius: 10 },
  appTitle: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 15 },
  navbar: { 
    flexDirection: 'row', 
    backgroundColor: '#fff', 
    borderTopWidth: 1, 
    borderTopColor: '#ddd', 
    paddingTop: 8,
    paddingBottom: Platform.OS === 'android' ? 28 : 12
  },
  navBtn: { flex: 1, padding: 4, alignItems: 'center' },
  navActive: { borderTopWidth: 3, borderTopColor: '#007bff' },
  navText: { color: '#444', fontWeight: 'bold', fontSize: 8 }
});
