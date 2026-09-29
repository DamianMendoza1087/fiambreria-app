import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, ActivityIndicator, SafeAreaView, ScrollView, Alert } from 'react-native';
import { loginUser, fetchProducts, createProduct, deleteProduct } from './api';

export default function App() {
  // Estado de Sesión y Navegación
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentTab, setCurrentTab] = useState('caja'); // 'caja' | 'inventario'
  const [email, setEmail] = useState('admin@fiambreria.com');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);

  // Estado de Productos e Inventario
  const [products, setProducts] = useState([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Fiambres');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');

  // Estado de la Caja / Venta Actual
  const [cart, setCart] = useState([]);

  // Cargar productos
  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await fetchProducts();
      setProducts(data);
    } catch (error) {
      alert('Error al cargar productos');
    } finally {
      setLoading(false);
    }
  };

  // Manejar Login
  const handleLogin = async () => {
    try {
      setLoading(true);
      await loginUser(email, password);
      setIsLoggedIn(true);
      await loadProducts();
    } catch (error) {
      alert('Error de Login: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Lógica del Punto de Venta (Caja)
  const addToCart = (product) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      setCart(cart.map(item => item.id === product.id ? { ...item, qty: item.qty + 0.25 } : item));
    } else {
      setCart([...cart, { ...product, qty: 1 }]);
    }
  };

  const removeFromCart = (id) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const getTotalPrice = () => {
    return cart.reduce((total, item) => total + (item.price_per_unit * item.qty), 0).toFixed(2);
  };

  const handleCheckout = () => {
    if (cart.length === 0) {
      alert('El carrito está vacío');
      return;
    }
    alert(`¡Venta Registrada con éxito!\nTotal cobrado: $${getTotalPrice()}`);
    setCart([]);
  };

  // Lógica de Inventario
  const handleCreateProduct = async () => {
    if (!name || !price || !stock) {
      alert('Por favor completá nombre, precio y stock');
      return;
    }
    try {
      setLoading(true);
      await createProduct({
        name,
        category,
        price_per_unit: parseFloat(price),
        unit_type: 'kg',
        stock: parseFloat(stock),
        is_active: true,
      });
      setName('');
      setPrice('');
      setStock('');
      await loadProducts();
      alert('Producto agregado con éxito');
    } catch (error) {
      alert('Error al crear producto');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (id) => {
    try {
      setLoading(true);
      await deleteProduct(id);
      await loadProducts();
    } catch (error) {
      alert('Error al eliminar producto');
    } finally {
      setLoading(false);
    }
  };

  // --- PANTALLA DE LOGIN ---
  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.container}>
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

  // --- PANTALLA PRINCIPAL DE LA APP ---
  return (
    <SafeAreaView style={styles.container}>
      {/* Encabezado */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🍖 Fiambrería POS</Text>
        <TouchableOpacity onPress={loadProducts}>
          <Text style={styles.refreshText}>🔄 Recargar</Text>
        </TouchableOpacity>
      </View>

      {/* Contenido según la Pestaña Activa */}
      <View style={styles.body}>
        {currentTab === 'caja' ? (
          // VISTA DE CAJA / PUNTO DE VENTA
          <ScrollView contentContainerStyle={styles.scrollPadding}>
            <Text style={styles.sectionTitle}>🛒 Punto de Venta (Caja)</Text>
            
            {/* Lista de selección rápida */}
            <Text style={styles.subSectionTitle}>Seleccionar Productos:</Text>
            <View style={styles.gridContainer}>
              {products.map(item => (
                <TouchableOpacity key={item.id} style={styles.gridCard} onPress={() => addToCart(item)}>
                  <Text style={styles.gridTitle}>{item.name}</Text>
                  <Text style={styles.gridPrice}>${item.price_per_unit} / {item.unit_type}</Text>
                  <Text style={styles.gridAdd}>+ Agregar</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Carrito / Ticket actual */}
            <Text style={styles.subSectionTitle}>Ticket de Venta Actual:</Text>
            {cart.length === 0 ? (
              <Text style={styles.emptyText}>No hay productos seleccionados.</Text>
            ) : (
              cart.map(item => (
                <View key={item.id} style={styles.cartRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cartName}>{item.name}</Text>
                    <Text style={styles.cartDetail}>{item.qty} {item.unit_type} x ${item.price_per_unit}</Text>
                  </View>
                  <Text style={styles.cartSubtotal}>${(item.price_per_unit * item.qty).toFixed(2)}</Text>
                  <TouchableOpacity onPress={() => removeFromCart(item.id)} style={styles.removeBtn}>
                    <Text style={{ color: 'red', fontWeight: 'bold' }}>X</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}

            {/* Total y Cobrar */}
            <View style={styles.totalBox}>
              <Text style={styles.totalLabel}>TOTAL:</Text>
              <Text style={styles.totalAmount}>${getTotalPrice()}</Text>
            </View>
            <TouchableOpacity style={styles.buttonSuccess} onPress={handleCheckout}>
              <Text style={styles.buttonText}>💳 Cobrar y Registrar Venta</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : (
          // VISTA DE INVENTARIO
          <ScrollView contentContainerStyle={styles.scrollPadding}>
            <Text style={styles.sectionTitle}>📦 Gestión de Inventario</Text>
            <View style={styles.card}>
              <Text style={styles.subSectionTitle}>Nuevo Producto</Text>
              <TextInput style={styles.input} placeholder="Nombre (ej: Queso Tybo)" value={name} onChangeText={setName} />
              <TextInput style={styles.input} placeholder="Categoría" value={category} onChangeText={setCategory} />
              <TextInput style={styles.input} placeholder="Precio x kg/Unidad ($)" keyboardType="numeric" value={price} onChangeText={setPrice} />
              <TextInput style={styles.input} placeholder="Stock inicial" keyboardType="numeric" value={stock} onChangeText={setStock} />
              <TouchableOpacity style={styles.buttonPrimary} onPress={handleCreateProduct} disabled={loading}>
                <Text style={styles.buttonText}>+ Guardar en Inventario</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.subSectionTitle}>Catálogo Activo</Text>
            {products.map((item) => (
              <View key={item.id} style={styles.productCard}>
                <View>
                  <Text style={styles.productName}>{item.name}</Text>
                  <Text style={styles.productDetail}>{item.category} - ${item.price_per_unit} / {item.unit_type}</Text>
                  <Text style={styles.productStock}>Stock: {item.stock} {item.unit_type}</Text>
                </View>
                <TouchableOpacity style={styles.buttonDanger} onPress={() => handleDeleteProduct(item.id)}>
                  <Text style={styles.buttonText}>Eliminar</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Menú de Navegación Inferior */}
      <View style={styles.navbar}>
        <TouchableOpacity style={[styles.navButton, currentTab === 'caja' && styles.navActive]} onPress={() => setCurrentTab('caja')}>
          <Text style={[styles.navText, currentTab === 'caja' && styles.navActiveText]}>🛒 Caja / Venta</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.navButton, currentTab === 'inventario' && styles.navActive]} onPress={() => setCurrentTab('inventario')}>
          <Text style={[styles.navText, currentTab === 'inventario' && styles.navActiveText]}>📦 Inventario</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// Estilos
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f8' },
  loginCard: { backgroundColor: '#fff', margin: 20, padding: 25, borderRadius: 12, elevation: 3 },
  appTitle: { fontSize: 26, fontWeight: 'bold', textAlign: 'center', color: '#333', marginBottom: 10 },
  header: { backgroundColor: '#1a1a1a', padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  refreshText: { color: '#007bff', fontSize: 14 },
  body: { flex: 1 },
  scrollPadding: { padding: 15 },
  sectionTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 15, color: '#222' },
  subSectionTitle: { fontSize: 16, fontWeight: 'bold', marginTop: 15, marginBottom: 10, color: '#555' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, marginBottom: 10 },
  buttonPrimary: { backgroundColor: '#007bff', padding: 14, borderRadius: 8, alignItems: 'center' },
  buttonSuccess: { backgroundColor: '#28a745', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  buttonDanger: { backgroundColor: '#dc3545', padding: 8, borderRadius: 6 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
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
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 15 },
  productCard: { backgroundColor: '#fff', padding: 12, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  productName: { fontWeight: 'bold', fontSize: 15 },
  productDetail: { color: '#666', fontSize: 13 },
  productStock: { color: '#888', fontSize: 11 },
  emptyText: { color: '#888', fontStyle: 'italic', marginVertical: 10 },
  navbar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#ddd' },
  navButton: { flex: 1, padding: 15, alignItems: 'center' },
  navActive: { borderTopWidth: 3, borderTopColor: '#007bff' },
  navText: { color: '#666', fontWeight: '600' },
  navActiveText: { color: '#007bff', fontWeight: 'bold' }
});
