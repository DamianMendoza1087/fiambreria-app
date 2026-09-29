import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Alert, SafeAreaView, ScrollView } from 'react-native';
import { loginUser, fetchProducts, createProduct, deleteProduct } from './api';

export default function App() {
  // Estados de la app
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('admin@fiambreria.com');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);

  // Estados de productos
  const [products, setProducts] = useState([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Fiambres');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');

  // Cargar productos al iniciar sesión
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

  // Manejar Crear Producto
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

  // Manejar Eliminar Producto
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

  // PANTALLA DE LOGIN
  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>🍖 Fiambrería Admin</Text>
          <Text style={styles.subtitle}>Iniciar Sesión</Text>
          
          <TextInput
            style={styles.input}
            placeholder="Correo electrónico"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Contraseña"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          
          <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Ingresar</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // PANTALLA PRINCIPAL DE PRODUCTOS
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>🧀 Panel de Productos</Text>

        {/* Formulario de Alta */}
        <View style={styles.card}>
          <Text style={styles.subtitle}>Nuevo Producto</Text>
          <TextInput style={styles.input} placeholder="Nombre (ej: Jamón Cocido)" value={name} onChangeText={setName} />
          <TextInput style={styles.input} placeholder="Categoría (ej: Fiambres, Quesos)" value={category} onChangeText={setCategory} />
          <TextInput style={styles.input} placeholder="Precio x kg/Unidad ($)" keyboardType="numeric" value={price} onChangeText={setPrice} />
          <TextInput style={styles.input} placeholder="Stock inicial" keyboardType="numeric" value={stock} onChangeText={setStock} />

          <TouchableOpacity style={styles.buttonSuccess} onPress={handleCreateProduct} disabled={loading}>
            <Text style={styles.buttonText}>+ Guardar Producto</Text>
          </TouchableOpacity>
        </View>

        {/* Listado de Productos */}
        <Text style={styles.subtitle}>Catálogo Actual</Text>
        {loading && <ActivityIndicator size="large" color="#007bff" />}

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
    </SafeAreaView>
  );
}

// Estilos limpios y modernos
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f8' },
  scrollContent: { padding: 20 },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 12, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginVertical: 15, color: '#333' },
  subtitle: { fontSize: 18, fontWeight: '600', marginBottom: 15, color: '#555' },
  input: { backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#e0e0e0', padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 16 },
  button: { backgroundColor: '#007bff', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  buttonSuccess: { backgroundColor: '#28a745', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  buttonDanger: { backgroundColor: '#dc3545', padding: 10, borderRadius: 6 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  productCard: { backgroundColor: '#fff', padding: 15, borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#eee' },
  productName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  productDetail: { fontSize: 14, color: '#666', marginTop: 2 },
  productStock: { fontSize: 12, color: '#888', marginTop: 2 },
});
