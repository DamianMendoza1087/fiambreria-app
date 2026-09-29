import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator, Platform, StatusBar } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { loginUser, fetchProducts, createProduct, updateProduct, deleteProduct, fetchUsers, createUser, activateCashier, createPreSale, fetchPendingPreSales, finalizeSale } from './api';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState('superadmin');
  const [currentTab, setCurrentTab] = useState('preventa');
  const [email, setEmail] = useState('admin@fiambreria.com');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);

  // Inventario & Edición
  const [products, setProducts] = useState([]);
  const [editingProductId, setEditingProductId] = useState(null);
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState('Varios');
  const [prodPrice, setProdPrice] = useState('');
  const [prodStock, setProdStock] = useState('');
  const [prodUnitType, setProdUnitType] = useState('unid');
  const [prodBarcode, setProdBarcode] = useState('');

  // Cámara / Escáner
  const [permission, requestPermission] = useCameraPermissions();
  const [showCamera, setShowCamera] = useState(false);
  const [cameraTarget, setCameraTarget] = useState(null);
  const [scanned, setScanned] = useState(false);

  // Pre-venta & Caja
  const [vendorCart, setVendorCart] = useState([]);
  const [pendingPreSales, setPendingPreSales] = useState([]);
  const [selectedPreSaleId, setSelectedPreSaleId] = useState(null);
  const [cashierCart, setCashierCart] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('Efectivo');
  const [amountCash, setAmountCash] = useState('');
  const [amountMP, setAmountMP] = useState('');
  const [cashTendered, setCashTendered] = useState(''); // Dinero entregado por el cliente

  // Usuarios
  const [usersList, setUsersList] = useState([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPass, setNewUserPass] = useState('');
  const [newUserRole, setNewUserRole] = useState('cajero');

  const loadInitialData = async () => {
    try {
      setProducts(await fetchProducts());
      setUsersList(await fetchUsers());
      setPendingPreSales(await fetchPendingPreSales());
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
    await loadInitialData();
  };

  const handleLogin = async () => {
    try {
      setLoading(true);
      const res = await loginUser(email, password);
      setIsLoggedIn(true);
      if (res.role) setUserRole(res.role);
      await loadInitialData();
    } catch (e) {
      alert('Login Error: ' + e.message);
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

    if (cameraTarget === 'inventario') {
      setProdBarcode(data);
      alert(`✅ Código EAN capturado: ${data}`);
    } else if (cameraTarget === 'preventa') {
      const found = products.find(p => p.barcode === data);
      if (found) {
        addToVendorCart(found);
        alert(`✅ Agregado a Pre-venta: ${found.name}`);
      } else {
        alert(`⚠️ Código EAN ${data} no encontrado en el catálogo.`);
      }
    } else if (cameraTarget === 'caja') {
      const found = products.find(p => p.barcode === data);
      if (found) {
        addToCashierCart(found);
        alert(`✅ Agregado a Caja: ${found.name}`);
      } else {
        alert(`⚠️ Código EAN ${data} no encontrado en el catálogo.`);
      }
    }

    setTimeout(() => setScanned(false), 2000);
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
    const val = parseFloat(valString) || 0;
    const prod = products.find(p => p.id === id);
    const maxStock = prod ? prod.stock : 999;

    setVendorCart(vendorCart.map(item => {
      if (item.id === id) {
        if (val > maxStock) {
          alert(`⚠️ Supera el stock disponible (${maxStock} ${item.unit_type}).`);
        }
        return { ...item, qty: Math.min(val, maxStock) };
      }
      return item;
    }));
  };

  const handleGeneratePreSale = async () => {
    if (vendorCart.length === 0) return alert('El carrito de pre-venta está vacío');
    try {
      setLoading(true);
      const items = vendorCart.map(i => ({ product_id: i.id, quantity: i.qty }));
      const res = await createPreSale(items);
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
    setCashTendered('');
  };

  const updateCashierCartQty = (id, delta) => {
    setCashierCart(cashierCart.map(item => {
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

  const updateCashierCartDirectQty = (id, valString) => {
    const val = parseFloat(valString) || 0;
    const prod = products.find(p => p.id === id);
    const maxStock = prod ? prod.stock : 999;

    setCashierCart(cashierCart.map(item => {
      if (item.id === id) {
        if (val > maxStock) {
          alert(`⚠️ Supera el stock disponible (${maxStock} ${item.unit_type}).`);
        }
        return { ...item, qty: Math.min(val, maxStock) };
      }
      return item;
    }));
  };

  const addToCashierCart = (prod) => {
    const existing = cashierCart.find(i => i.id === prod.id);
    const step = prod.unit_type === 'kg' ? 0.25 : 1;
    const currentQty = existing ? existing.qty : 0;
    const newQty = currentQty + step;

    if (newQty > prod.stock) {
      return alert(`⚠️ Stock insuficiente. Solo quedan ${prod.stock} ${prod.unit_type} disponibles.`);
    }

    if (existing) {
      setCashierCart(cashierCart.map(i => i.id === prod.id ? { ...i, qty: newQty } : i));
    } else {
      setCashierCart([...cashierCart, { ...prod, qty: step, price_per_unit: prod.price_per_unit }]);
    }
  };

  const getCashierTotal = () => cashierCart.reduce((acc, i) => acc + (i.price_per_unit * i.qty), 0).toFixed(2);

  // Cálculo automático del vuelto en Efectivo o Pago Mixto
  const getExpectedCashAmount = () => {
    const total = parseFloat(getCashierTotal()) || 0;
    if (paymentMethod === 'Efectivo') return total;
    if (paymentMethod === 'Mixto') return parseFloat(amountCash) || 0;
    return 0;
  };

  const getChangeDue = () => {
    const cashRequired = getExpectedCashAmount();
    const tendered = parseFloat(cashTendered) || 0;
    const change = tendered - cashRequired;
    return change > 0 ? change.toFixed(2) : '0.00';
  };

  const handleFinalizeSale = async () => {
    if (cashierCart.length === 0) return alert('No hay productos en el ticket de caja');
    const total = parseFloat(getCashierTotal());
    let cash = 0, mp = 0;

    if (paymentMethod === 'Efectivo') {
      cash = total;
      const tendered = parseFloat(cashTendered) || 0;
      if (tendered < total) {
        return alert(`⚠️ El dinero ingresado ($${tendered}) es menor que el total a pagar en efectivo ($${total})`);
      }
    } else if (paymentMethod === 'Mercado Pago') {
      mp = total;
    } else {
      cash = parseFloat(amountCash) || 0;
      mp = parseFloat(amountMP) || 0;
      if ((cash + mp).toFixed(2) !== total.toFixed(2)) {
        return alert(`La suma de Efectivo ($${cash}) y MP ($${mp}) debe ser igual al Total ($${total})`);
      }
      const tendered = parseFloat(cashTendered) || 0;
      if (cash > 0 && tendered < cash) {
        return alert(`⚠️️ El dinero ingresado ($${tendered}) es menor que la parte a cobrar en efectivo ($${cash})`);
      }
    }

    try {
      setLoading(true);
      await finalizeSale({
        presale_id: selectedPreSaleId,
        items: cashierCart.map(i => ({ product_id: i.id, quantity: i.qty })),
        total_amount: total,
        amount_cash: cash,
        amount_mp: mp,
        payment_method: paymentMethod
      });
      alert(`💳 Venta cobrada con éxito!\nVuelto a entregar: $${getChangeDue()}`);
      setSelectedPreSaleId(null);
      setCashierCart([]);
      setAmountCash(''); setAmountMP(''); setCashTendered('');
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
    setProdPrice(String(prod.price_per_unit));
    setProdStock(String(prod.stock));
    setProdUnitType(prod.unit_type || 'unid');
    setProdBarcode(prod.barcode || '');
  };

  const handleCancelEditProduct = () => {
    setEditingProductId(null);
    setProdName(''); setProdPrice(''); setProdStock(''); setProdBarcode(''); setProdUnitType('unid');
  };

  const handleSaveProduct = async () => {
    if (!prodName || !prodPrice || !prodStock) return alert('Completá nombre, precio y stock');
    try {
      setLoading(true);
      const payload = {
        name: prodName,
        category: prodCategory,
        price_per_unit: parseFloat(prodPrice),
        unit_type: prodUnitType,
        stock: parseFloat(prodStock),
        barcode: prodBarcode || null,
        is_active: true
      };

      if (editingProductId) {
        await updateProduct(editingProductId, payload);
        alert('✅ Producto actualizado correctamente');
      } else {
        await createProduct(payload);
        alert('✅ Producto guardado en el catálogo');
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
      await createUser({ name: newUserName, email: newUserEmail, password: newUserPass, role: newUserRole });
      setNewUserName(''); setNewUserEmail(''); setNewUserPass('');
      await loadInitialData();
      alert('Usuario creado con éxito');
    } catch (e) {
      alert('Error al registrar usuario');
    } finally {
      setLoading(false);
    }
  };

  const handleSetCashier = async (userId) => {
    try {
      setLoading(true);
      await activateCashier(userId);
      await loadInitialData();
      alert('Caja asignada correctamente');
    } catch (e) {
      alert('Error al asignar caja');
    } finally {
      setLoading(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loginCard}>
          <Text style={styles.appTitle}>🍖 Fiambrería Admin</Text>
          <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
          <TextInput style={styles.input} placeholder="Contraseña" secureTextEntry value={password} onChangeText={setPassword} />
          <TouchableOpacity style={styles.buttonPrimary} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Ingresar</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🍖 Fiambrería POS</Text>
        <TouchableOpacity onPress={loadInitialData}><Text style={styles.refreshText}>🔄 Recargar</Text></TouchableOpacity>
      </View>

      <View style={styles.body}>
        {/* PRE-VENTA */}
        {currentTab === 'preventa' && (
          <ScrollView contentContainerStyle={styles.scrollPadding} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>🛒 Armar Pre-venta (Mostrador)</Text>
            
            <TouchableOpacity style={styles.buttonCamera} onPress={() => toggleCamera('preventa')}>
              <Text style={styles.buttonText}>{showCamera && cameraTarget === 'preventa' ? '📷 Cerrar Escáner EAN' : '📷 Escanear EAN / Código de Barras'}</Text>
            </TouchableOpacity>

            {showCamera && cameraTarget === 'preventa' && permission?.granted && (
              <View style={styles.cameraContainer}>
                <CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={scanned ? undefined : handleBarcodeScanned} />
              </View>
            )}

            <Text style={styles.subSectionTitle}>Productos Disponibles:</Text>
            <View style={styles.gridContainer}>
              {products.map(p => (
                <TouchableOpacity key={p.id} style={styles.gridCard} onPress={() => addToVendorCart(p)}>
                  <Text style={styles.gridTitle}>{p.name}</Text>
                  <Text style={styles.gridPrice}>${p.price_per_unit} / {p.unit_type}</Text>
                  <Text style={{ fontSize: 11, color: '#666' }}>Stock: {p.stock} {p.unit_type}</Text>
                  <Text style={styles.gridAdd}>+ Agregar</Text>
                </TouchableOpacity>
              ))}
            </View>

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

                  <Text style={{ fontWeight: 'bold' }}>${(i.price_per_unit * i.qty).toFixed(2)}</Text>
                </View>
              ))
            )}
            
            <TouchableOpacity style={styles.buttonPrimary} onPress={handleGeneratePreSale} disabled={loading}>
              <Text style={styles.buttonText}>📝 Enviar Pre-venta a Caja</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* CAJA Y COBRO CON CÁLCULO DE VUELTO */}
        {currentTab === 'caja' && (
          <ScrollView contentContainerStyle={styles.scrollPadding} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>💳 Caja y Cobro</Text>

            <Text style={styles.subSectionTitle}>Pre-ventas Pendientes:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }}>
              {pendingPreSales.length === 0 ? <Text style={styles.emptyText}>No hay pre-ventas pendientes.</Text> : (
                pendingPreSales.map(ps => (
                  <TouchableOpacity 
                    key={ps.id} 
                    style={[styles.preSaleBadge, selectedPreSaleId === ps.id && styles.preSaleBadgeActive]} 
                    onPress={() => handleSelectPreSale(ps)}
                  >
                    <Text style={{ fontWeight: 'bold', color: selectedPreSaleId === ps.id ? '#fff' : '#007bff' }}>
                      Ticket #{ps.id} ({ps.created_at})
                    </Text>
                    <Text style={{ color: selectedPreSaleId === ps.id ? '#fff' : '#333' }}>${ps.total.toFixed(2)}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            <TouchableOpacity style={styles.buttonCamera} onPress={() => toggleCamera('caja')}>
              <Text style={styles.buttonText}>{showCamera && cameraTarget === 'caja' ? '📷 Cerrar Escáner EAN' : '📷 Agregar Producto con Escáner EAN'}</Text>
            </TouchableOpacity>

            {showCamera && cameraTarget === 'caja' && permission?.granted && (
              <View style={styles.cameraContainer}>
                <CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={scanned ? undefined : handleBarcodeScanned} />
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

                  <Text style={{ fontWeight: 'bold' }}>${(i.price_per_unit * i.qty).toFixed(2)}</Text>
                </View>
              ))
            )}

            <Text style={styles.subSectionTitle}>Método de Pago:</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
              <TouchableOpacity style={[styles.payBtn, paymentMethod === 'Efectivo' && styles.payBtnActive]} onPress={() => setPaymentMethod('Efectivo')}><Text style={styles.buttonText}>Efectivo</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.payBtn, paymentMethod === 'Mercado Pago' && styles.payBtnActive]} onPress={() => setPaymentMethod('Mercado Pago')}><Text style={styles.buttonText}>Mercado Pago</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.payBtn, paymentMethod === 'Mixto' && styles.payBtnActive]} onPress={() => setPaymentMethod('Mixto')}><Text style={styles.buttonText}>Mixto</Text></TouchableOpacity>
            </View>

            {/* SECCIÓN PAGO MIXTO */}
            {paymentMethod === 'Mixto' && (
              <View style={styles.card}>
                <TextInput style={styles.input} placeholder="Monto en Efectivo a Cobrar ($)" keyboardType="numeric" value={amountCash} onChangeText={setAmountCash} />
                <TextInput style={styles.input} placeholder="Monto en Mercado Pago ($)" keyboardType="numeric" value={amountMP} onChangeText={setAmountMP} />
              </View>
            )}

            {/* SECCIÓN CÁLCULO DE VUELTO (EFECTIVO O MIXTO) */}
            {(paymentMethod === 'Efectivo' || (paymentMethod === 'Mixto' && (parseFloat(amountCash) > 0))) && (
              <View style={styles.changeCard}>
                <Text style={{ fontWeight: 'bold', fontSize: 13, color: '#333', marginBottom: 6 }}>
                  💵 Paga con Billete/Efectivo:
                </Text>
                <TextInput
                  style={styles.inputHighlight}
                  placeholder={`Ej: ${paymentMethod === 'Efectivo' ? getCashierTotal() : (amountCash || '0')}`}
                  keyboardType="numeric"
                  value={cashTendered}
                  onChangeText={setCashTendered}
                />
                
                <View style={styles.changeRow}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#155724' }}>💰 Vuelto a Entregar:</Text>
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
          </ScrollView>
        )}

        {/* INVENTARIO */}
        {currentTab === 'inventario' && (
          <ScrollView contentContainerStyle={styles.scrollPadding} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>📦 Control de Inventario</Text>
            <View style={styles.card}>
              <Text style={styles.subSectionTitle}>
                {editingProductId ? '✏️ Editar Producto' : '➕ Nuevo Producto'}
              </Text>
              <TextInput style={styles.input} placeholder="Nombre del Producto" value={prodName} onChangeText={setProdName} />
              <TextInput style={styles.input} placeholder="Categoría (ej: Fiambres, Quesos, Cosmética)" value={prodCategory} onChangeText={setProdCategory} />
              
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

              <TextInput style={styles.input} placeholder={`Precio por ${prodUnitType} ($)`} keyboardType="numeric" value={prodPrice} onChangeText={setProdPrice} />
              <TextInput style={styles.input} placeholder={`Stock Inicial (${prodUnitType})`} keyboardType="numeric" value={prodStock} onChangeText={setProdStock} />
              
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Código de Barras / EAN" value={prodBarcode} onChangeText={setProdBarcode} />
                <TouchableOpacity style={[styles.buttonCamera, { marginLeft: 8, marginBottom: 0, padding: 12 }]} onPress={() => toggleCamera('inventario')}>
                  <Text style={styles.buttonText}>📷 Capturar</Text>
                </TouchableOpacity>
              </View>

              {showCamera && cameraTarget === 'inventario' && permission?.granted && (
                <View style={[styles.cameraContainer, { marginTop: 10 }]}>
                  <CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={scanned ? undefined : handleBarcodeScanned} />
                </View>
              )}

              <TouchableOpacity style={[styles.buttonPrimary, { marginTop: 15 }]} onPress={handleSaveProduct} disabled={loading}>
                <Text style={styles.buttonText}>
                  {editingProductId ? '💾 Guardar Cambios' : '+ Guardar Producto'}
                </Text>
              </TouchableOpacity>

              {editingProductId && (
                <TouchableOpacity style={[styles.buttonDanger, { marginTop: 8, backgroundColor: '#6c757d' }]} onPress={handleCancelEditProduct}>
                  <Text style={styles.buttonText}>Cancelar Edición</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.subSectionTitle}>Catálogo Registrado</Text>
            {products.length === 0 ? <Text style={styles.emptyText}>No hay productos en el inventario.</Text> : (
              products.map(p => (
                <View key={p.id} style={styles.productCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: 'bold', fontSize: 15 }}>{p.name}</Text>
                    <Text style={{ color: '#28a745', fontWeight: '600' }}>${p.price_per_unit} / {p.unit_type}</Text>
                    <Text style={{ color: '#666', fontSize: 12 }}>Stock: {p.stock} {p.unit_type} | EAN: {p.barcode || 'Sin EAN'}</Text>
                  </View>
                  <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity style={[styles.buttonPrimary, { padding: 8, marginRight: 6 }]} onPress={() => handleStartEditProduct(p)}>
                      <Text style={styles.buttonText}>✏️ Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.buttonDanger} onPress={() => handleDeleteProduct(p.id)}>
                      <Text style={styles.buttonText}>Eliminar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}

        {/* USUARIOS */}
        {currentTab === 'usuarios' && (
          <ScrollView contentContainerStyle={styles.scrollPadding} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>👥 Gestión de Personal</Text>
            <View style={styles.card}>
              <Text style={styles.subSectionTitle}>Registrar Nuevo Empleado</Text>
              <TextInput style={styles.input} placeholder="Nombre Completo" value={newUserName} onChangeText={setNewUserName} />
              <TextInput style={styles.input} placeholder="Correo Electrónico" value={newUserEmail} onChangeText={setNewUserEmail} autoCapitalize="none" />
              <TextInput style={styles.input} placeholder="Contraseña" secureTextEntry value={newUserPass} onChangeText={setNewUserPass} />
              <TextInput style={styles.input} placeholder="Rol (dueno, encargado, vendedor, cajero, auditor)" value={newUserRole} onChangeText={setNewUserRole} />
              <TouchableOpacity style={styles.buttonPrimary} onPress={handleCreateUser} disabled={loading}>
                <Text style={styles.buttonText}>+ Guardar Empleado</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.subSectionTitle}>Personal y Asignación de Caja</Text>
            {usersList.map(u => (
              <View key={u.id} style={styles.productCard}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: 'bold' }}>{u.name} ({u.role})</Text>
                  <Text style={{ color: '#666', fontSize: 12 }}>{u.email}</Text>
                  <Text style={{ color: u.is_cashier_active ? '#28a745' : '#666', fontWeight: 'bold', marginTop: 4 }}>
                    {u.is_cashier_active ? '🟢 CAJERO DE TURNO' : '⚪ Fuera de Caja'}
                  </Text>
                </View>
                {!u.is_cashier_active && (
                  <TouchableOpacity style={styles.buttonSuccess} onPress={() => handleSetCashier(u.id)}>
                    <Text style={styles.buttonText}>Asignar Caja</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* NAVBAR */}
      <View style={styles.navbar}>
        <TouchableOpacity style={[styles.navBtn, currentTab === 'preventa' && styles.navActive]} onPress={() => handleTabChange('preventa')}><Text style={styles.navText}>🛒 Pre-venta</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.navBtn, currentTab === 'caja' && styles.navActive]} onPress={() => handleTabChange('caja')}><Text style={styles.navText}>💳 Caja</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.navBtn, currentTab === 'inventario' && styles.navActive]} onPress={() => handleTabChange('inventario')}><Text style={styles.navText}>📦 Stock</Text></TouchableOpacity>
        {(userRole === 'superadmin' || userRole === 'dueno') && (
          <TouchableOpacity style={[styles.navBtn, currentTab === 'usuarios' && styles.navActive]} onPress={() => handleTabChange('usuarios')}><Text style={styles.navText}>👥 Usuarios</Text></TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#1a1a1a', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 25 : 0 },
  header: { backgroundColor: '#1a1a1a', padding: 15, flexDirection: 'row', justifyContent: 'space-between' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  refreshText: { color: '#007bff' },
  body: { flex: 1, backgroundColor: '#f4f6f8' },
  scrollPadding: { padding: 15, paddingBottom: 30 },
  sectionTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  subSectionTitle: { fontSize: 15, fontWeight: 'bold', marginTop: 15, marginBottom: 8, color: '#444' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, marginBottom: 10 },
  inputHighlight: { backgroundColor: '#fff', borderWidth: 2, borderColor: '#007bff', padding: 12, borderRadius: 8, fontSize: 16, fontWeight: 'bold', color: '#007bff' },
  inputSmall: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc', padding: 6, borderRadius: 6, width: 50, textAlign: 'center', fontWeight: 'bold' },
  typeBtn: { flex: 1, padding: 10, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, alignItems: 'center', backgroundColor: '#e9ecef' },
  typeBtnActive: { backgroundColor: '#007bff', borderColor: '#0056b3' },
  buttonPrimary: { backgroundColor: '#007bff', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  buttonCamera: { backgroundColor: '#6f42c1', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  buttonSuccess: { backgroundColor: '#28a745', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  buttonDanger: { backgroundColor: '#dc3545', padding: 8, borderRadius: 6 },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  cameraContainer: { height: 200, borderRadius: 10, overflow: 'hidden', marginBottom: 15 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridCard: { backgroundColor: '#fff', width: '48%', padding: 10, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#ddd' },
  gridTitle: { fontWeight: 'bold', fontSize: 13 },
  gridPrice: { color: '#28a745', fontSize: 12 },
  gridAdd: { color: '#007bff', fontSize: 11, fontWeight: 'bold', marginTop: 4 },
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
  navbar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#ddd', paddingBottom: Platform.OS === 'android' ? 24 : 10, paddingTop: 8 },
  navBtn: { flex: 1, padding: 8, alignItems: 'center' },
  navActive: { borderTopWidth: 3, borderTopColor: '#007bff' },
  navText: { color: '#444', fontWeight: 'bold', fontSize: 11 }
});
