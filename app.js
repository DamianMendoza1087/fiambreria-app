import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator, Platform, StatusBar } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { loginUser, fetchProducts, createProduct, deleteProduct, fetchUsers, createUser, activateCashier, processSale } from './api';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState('superadmin');
  const [currentTab, setCurrentTab] = useState('caja'); 
  const [email, setEmail] = useState('admin@fiambreria.com');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);

  // Estados de Inventario y Caja
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('Efectivo');
  
  // Estados de Cámara Permisos Android / Web
  const [permission, requestPermission] = useCameraPermissions();
  const [showCamera, setShowCamera] = useState(false);
  const [scanned, setScanned] = useState(false);

  // Estados Formulario Producto
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Fiambres');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [barcode, setBarcode] = useState('');

  // Estados Usuarios
  const [usersList, setUsersList] = useState([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPass, setNewUserPass] = useState('');
  const [newUserRole, setNewUserRole] = useState('cajero');

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const prods = await fetchProducts();
      setProducts(prods);
      const users = await fetchUsers();
      setUsersList(users);
    } catch (error) {
      alert('Error al sincronizar datos: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    try {
      setLoading(true);
      const res = await loginUser(email, password);
      setIsLoggedIn(true);
      if (res.role) setUserRole(res.role);
      await loadInitialData();
    } catch (error) {
      alert('Error de Inicio de Sesión: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleCamera = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        alert('Se requieren permisos de cámara para escanear.');
        return;
      }
    }
    setShowCamera(!showCamera);
  };

  const handleBarcodeScanned = ({ data }) => {
    setScanned(true);
    setShowCamera(false);
    const foundProduct = products.find(p => p.barcode === data);
    
    if (foundProduct) {
      addToCart(foundProduct);
      alert(`Producto agregado: ${foundProduct.name}`);
    } else {
      alert(`Código ${data} no encontrado.`);
    }
    setTimeout(() => setScanned(false), 2000);
  };

  const addToCart = (product) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      setCart(cart.map(item => item.id === product.id ? { ...item, qty: item.qty + 0.25 } : item));
    } else {
      setCart([...cart, { ...product, qty: 1 }]);
    }
  };

  const removeFromCart = (id) => setCart(cart.filter(item => item.id !== id));
  const getTotalPrice = () => cart.reduce((total, item) => total + (item.price_per_unit * item.qty), 0).toFixed(2);

  const handleCheckout = async () => {
    if (cart.length === 0) return alert('El carrito está vacío');
    try {
      setLoading(true);
      const salePayload = {
        total_amount: parseFloat(getTotalPrice()),
        payment_method: paymentMethod,
        items: cart.map(i => ({ product_id: i.id, quantity: i.qty }))
      };
      await processSale(salePayload);
      alert(`¡Venta Registrada con Éxito!\nTotal: $${getTotalPrice()}\nPago: ${paymentMethod}`);
      setCart([]);
      await loadInitialData();
    } catch (error) {
      alert('Error al procesar cobro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProduct = async () => {
    if (!name || !price || !stock) return alert('Completá nombre, precio y stock');
    try {
      setLoading(true);
      await createProduct({
        name,
        category,
        price_per_unit: parseFloat(price),
        unit_type: 'kg',
        stock: parseFloat(stock),
        barcode: barcode || null,
        is_active: true,
      });
      setName(''); setPrice(''); setStock(''); setBarcode('');
      await loadInitialData();
      alert('Producto guardado');
    } catch (error) {
      alert('Error al guardar producto');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (id) => {
    try {
      setLoading(true);
      await deleteProduct(id);
      await loadInitialData();
    } catch (error) {
      alert('Error al eliminar');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserName || !newUserEmail || !newUserPass) return alert('Completá los datos');
    try {
      setLoading(true);
      await createUser({ name: newUserName, email: newUserEmail, password: newUserPass, role: newUserRole });
      setNewUserName(''); setNewUserEmail(''); setNewUserPass('');
      await loadInitialData();
      alert('Usuario creado');
    } catch (error) {
      alert('Error al crear usuario');
    } finally {
      setLoading(false);
    }
  };

  const handleSetCashier = async (userId) => {
    try {
      setLoading(true);
      await activateCashier(userId);
      await loadInitialData();
      alert('Caja asignada');
    } catch (error) {
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
          <Text style={styles.subtitle}>Iniciar Sesión</Text>
          <TextInput style={styles.input} placeholder="Correo electrónico" value={email} onChangeText={setEmail} autoCapitalize="none" />
          <TextInput style={styles.input} placeholder="Contraseña" secureTextEntry value={password} onChangeText={setPassword} />
          <TouchableOpacity style={styles.buttonPrimary} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Ingresar al Sistema</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🍖 Fiambrería POS</Text>
        <TouchableOpacity onPress={loadInitialData}>
          <Text style={styles.refreshText}>🔄 Recargar</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {currentTab === 'caja' && (
          <ScrollView contentContainerStyle={styles.scrollPadding} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>🛒 Punto de Venta (Caja)</Text>

            <TouchableOpacity style={styles.buttonCamera} onPress={toggleCamera}>
              <Text style={styles.buttonText}>{showCamera ? '📷 Cerrar Cámara' : '📷 Escanear con Cámara'}</Text>
            </TouchableOpacity>

            {showCamera && permission?.granted && (
              <View style={styles.cameraContainer}>
                <CameraView
                  style={StyleSheet.absoluteFillObject}
                  facing="back"
                  onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                />
              </View>
            )}

            <Text style={styles.subSectionTitle}>Productos Disponibles:</Text>
            <View style={styles.gridContainer}>
              {products.map(item => (
                <TouchableOpacity key={item.id} style={styles.gridCard} onPress={() => addToCart(item)}>
                  <Text style={styles.gridTitle}>{item.name}</Text>
                  <Text style={styles.gridPrice}>${item.price_per_unit} / {item.unit_type}</Text>
                  <Text style={styles.gridAdd}>+ Agregar</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.subSectionTitle}>Ticket Actual:</Text>
            {cart.length === 0 ? (
              <Text style={styles.emptyText}>Carrito vacío.</Text>
            ) : (
              cart.map(item => (
                <View key={item.id} style={styles.cartRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cartName}>{item.name}</Text>
                    <Text style={styles.cartDetail}>{item.qty} {item.unit_type} x ${item.price_per_unit}</Text>
                  </View>
                  <Text style={styles.cartSubtotal}>${(item.price_per_unit * item.qty).toFixed(2)}</Text>
                  <TouchableOpacity onPress={() => removeFromCart(item.id)}>
                    <Text style={{ color: 'red', fontWeight: 'bold' }}>X</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}

            <Text style={styles.subSectionTitle}>Método de Pago:</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
              <TouchableOpacity style={[styles.payMethodBtn, paymentMethod === 'Efectivo' && styles.payMethodActive]} onPress={() => setPaymentMethod('Efectivo')}>
                <Text style={styles.buttonText}>💵 Efectivo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.payMethodBtn, paymentMethod === 'Mercado Pago' && styles.payMethodActive]} onPress={() => setPaymentMethod('Mercado Pago')}>
                <Text style={styles.buttonText}>📱 Mercado Pago</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.totalBox}>
              <Text style={styles.totalLabel}>TOTAL:</Text>
              <Text style={styles.totalAmount}>${getTotalPrice()}</Text>
            </View>
            <TouchableOpacity style={styles.buttonSuccess} onPress={handleCheckout} disabled={loading}>
              <Text style={styles.buttonText}>💳 Confirmar y Cobrar Venta</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {currentTab === 'inventario' && (
          <ScrollView contentContainerStyle={styles.scrollPadding} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>📦 Control de Inventario</Text>
            <View style={styles.card}>
              <Text style={styles.subSectionTitle}>Nuevo Producto</Text>
              <TextInput style={styles.input} placeholder="Nombre del Producto" value={name} onChangeText={setName} />
              <TextInput style={styles.input} placeholder="Categoría" value={category} onChangeText={setCategory} />
              <TextInput style={styles.input} placeholder="Precio x kg/un" keyboardType="numeric" value={price} onChangeText={setPrice} />
              <TextInput style={styles.input} placeholder="Stock" keyboardType="numeric" value={stock} onChangeText={setStock} />
              <TextInput style={styles.input} placeholder="Código de Barras (opcional)" value={barcode} onChangeText={setBarcode} />
              <TouchableOpacity style={styles.buttonPrimary} onPress={handleCreateProduct}>
                <Text style={styles.buttonText}>+ Guardar Producto</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.subSectionTitle}>Catálogo Registrado</Text>
            {products.map((item) => (
              <View key={item.id} style={styles.productCard}>
                <View>
                  <Text style={styles.productName}>{item.name}</Text>
                  <Text style={styles.productDetail}>${item.price_per_unit} - Stock: {item.stock} {item.unit_type}</Text>
                </View>
                <TouchableOpacity style={styles.buttonDanger} onPress={() => handleDeleteProduct(item.id)}>
                  <Text style={styles.buttonText}>Eliminar</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {currentTab === 'usuarios' && (
          <ScrollView contentContainerStyle={styles.scrollPadding} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>👥 Gestión de Personal</Text>
            <View style={styles.card}>
              <Text style={styles.subSectionTitle}>Registrar Empleado</Text>
              <TextInput style={styles.input} placeholder="Nombre Completo" value={newUserName} onChangeText={setNewUserName} />
              <TextInput style={styles.input} placeholder="Correo electrónico" value={newUserEmail} onChangeText={setNewUserEmail} autoCapitalize="none" />
              <TextInput style={styles.input} placeholder="Contraseña" secureTextEntry value={newUserPass} onChangeText={setNewUserPass} />
              <TextInput style={styles.input} placeholder="Rol (dueno, encargado, vendedor, cajero, auditor)" value={newUserRole} onChangeText={setNewUserRole} />
              <TouchableOpacity style={styles.buttonPrimary} onPress={handleCreateUser}>
                <Text style={styles.buttonText}>+ Guardar Empleado</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.subSectionTitle}>Personal y Asignación de Turno de Caja</Text>
            {usersList.map(u => (
              <View key={u.id} style={styles.productCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName}>{u.name} ({u.role})</Text>
                  <Text style={styles.productDetail}>{u.email}</Text>
                  <Text style={{ color: u.is_cashier_active ? '#28a745' : '#666', fontWeight: 'bold', marginTop: 4 }}>
                    {u.is_cashier_active ? '🟢 CAJERO DE TURNO' : '⚪ Sin Caja'}
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

      {/* Menú de Navegación Inferior corregido con margen para botones Android */}
      <View style={styles.navbar}>
        <TouchableOpacity style={[styles.navButton, currentTab === 'caja' && styles.navActive]} onPress={() => setCurrentTab('caja')}>
          <Text style={[styles.navText, currentTab === 'caja' && styles.navActiveText]}>🛒 Caja</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.navButton, currentTab === 'inventario' && styles.navActive]} onPress={() => setCurrentTab('inventario')}>
          <Text style={[styles.navText, currentTab === 'inventario' && styles.navActiveText]}>📦 Inventario</Text>
        </TouchableOpacity>
        {(userRole === 'superadmin' || userRole === 'dueno') && (
          <TouchableOpacity style={[styles.navButton, currentTab === 'usuarios' && styles.navActive]} onPress={() => setCurrentTab('usuarios')}>
            <Text style={[styles.navText, currentTab === 'usuarios' && styles.navActiveText]}>👥 Usuarios</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { 
    flex: 1, 
    backgroundColor: '#1a1a1a', 
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 25 : 0 
  },
  container: { flex: 1, backgroundColor: '#f4f6f8' },
  loginCard: { backgroundColor: '#fff', margin: 20, padding: 25, borderRadius: 12, elevation: 3 },
  appTitle: { fontSize: 26, fontWeight: 'bold', textAlign: 'center', color: '#333', marginBottom: 10 },
  subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 15, color: '#666' },
  header: { backgroundColor: '#1a1a1a', padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  refreshText: { color: '#007bff', fontSize: 14 },
  body: { flex: 1, backgroundColor: '#f4f6f8' },
  scrollPadding: { padding: 15, paddingBottom: 30 },
  sectionTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 15, color: '#222' },
  subSectionTitle: { fontSize: 16, fontWeight: 'bold', marginTop: 15, marginBottom: 10, color: '#555' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, marginBottom: 10 },
  buttonPrimary: { backgroundColor: '#007bff', padding: 14, borderRadius: 8, alignItems: 'center' },
  buttonCamera: { backgroundColor: '#6f42c1', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  buttonSuccess: { backgroundColor: '#28a745', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 5 },
  buttonDanger: { backgroundColor: '#dc3545', padding: 8, borderRadius: 6 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  cameraContainer: { height: 200, borderRadius: 10, overflow: 'hidden', marginBottom: 15 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridCard: { backgroundColor: '#fff', width: '48%', padding: 12, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  gridTitle: { fontWeight: 'bold', fontSize: 14 },
  gridPrice: { color: '#28a745', fontSize: 13, marginVertical: 4 },
  gridAdd: { color: '#007bff', fontSize: 12, fontWeight: '600' },
  cartRow: { backgroundColor: '#fff', padding: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  cartName: { fontWeight: 'bold', fontSize: 14 },
  cartDetail: { color: '#666', fontSize: 12 },
  cartSubtotal: { fontWeight: 'bold', fontSize: 14, marginRight: 10 },
  totalBox: { backgroundColor: '#fff', padding: 15, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, borderTopWidth: 2, borderTopColor: '#28a745' },
  totalLabel: { fontSize: 18, fontWeight: 'bold' },
  totalAmount: { fontSize: 22, fontWeight: 'bold', color: '#28a745' },
  payMethodBtn: { flex: 0.48, padding: 12, backgroundColor: '#6c757d', borderRadius: 8, alignItems: 'center' },
  payMethodActive: { backgroundColor: '#007bff' },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 15 },
  productCard: { backgroundColor: '#fff', padding: 12, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  productName: { fontWeight: 'bold', fontSize: 15 },
  productDetail: { color: '#666', fontSize: 13 },
  emptyText: { color: '#888', fontStyle: 'italic', marginVertical: 10 },
  navbar: { 
    flexDirection: 'row', 
    backgroundColor: '#fff', 
    borderTopWidth: 1, 
    borderTopColor: '#ddd',
    paddingBottom: Platform.OS === 'android' ? 24 : 10, 
    paddingTop: 8 
  },
  navButton: { flex: 1, padding: 8, alignItems: 'center' },
  navActive: { borderTopWidth: 3, borderTopColor: '#007bff' },
  navText: { color: '#666', fontWeight: '600', fontSize: 12 },
  navActiveText: { color: '#007bff', fontWeight: 'bold' }
});
