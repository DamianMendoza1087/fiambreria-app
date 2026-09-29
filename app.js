let mockProducts = [
  { id: 1, name: 'Jamón Cocido', category: 'Fiambres', price_per_unit: 8500, unit_type: 'kg', stock: 10.5, barcode: '7791234567890', is_active: true },
  { id: 2, name: 'Queso Tybo', category: 'Quesos', price_per_unit: 7200, unit_type: 'kg', stock: 15.0, barcode: '7799876543210', is_active: true },
  { id: 3, name: 'Crema Spa para Piernas', category: 'Cosmética', price_per_unit: 4500, unit_type: 'unid', stock: 12, barcode: '7791112223334', is_active: true }
];

let mockUsers = [
  { id: 1, name: 'Admin Principal', email: 'admin@fiambreria.com', role: 'superadmin', is_cashier_active: true }
];

let mockPreSales = [];
let nextPreSaleId = 100;

export const loginUser = async (email, password) => {
  const user = mockUsers.find(u => u.email === email) || { id: Date.now(), name: 'Usuario', role: 'cajero', is_cashier_active: true };
  return { id: user.id, name: user.name, role: user.role, token: 'mock-jwt-token' };
};

export const fetchProducts = async () => {
  return [...mockProducts];
};

export const createProduct = async (productData) => {
  const newProduct = {
    id: Date.now(),
    name: productData.name,
    category: productData.category || 'Varios',
    price_per_unit: parseFloat(productData.price_per_unit),
    unit_type: productData.unit_type || 'unid',
    stock: parseFloat(productData.stock),
    barcode: productData.barcode || null,
    is_active: true
  };
  mockProducts.push(newProduct);
  return newProduct;
};

export const deleteProduct = async (id) => {
  mockProducts = mockProducts.filter(p => p.id !== id);
  return { success: true };
};

export const fetchUsers = async () => {
  return [...mockUsers];
};

export const createUser = async (userData) => {
  const newUser = { id: Date.now(), ...userData, is_cashier_active: false };
  mockUsers.push(newUser);
  return newUser;
};

export const activateCashier = async (userId) => {
  mockUsers = mockUsers.map(u => ({ ...u, is_cashier_active: u.id === userId }));
  return { success: true };
};

export const createPreSale = async (items) => {
  const preSale = {
    id: nextPreSaleId++,
    created_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    items: items.map(item => {
      const prod = mockProducts.find(p => p.id === item.product_id);
      return {
        product_id: item.product_id,
        name: prod ? prod.name : 'Producto',
        price_per_unit: prod ? prod.price_per_unit : 0,
        unit_type: prod ? prod.unit_type : 'unid',
        qty: item.quantity
      };
    }),
    total: items.reduce((acc, item) => {
      const prod = mockProducts.find(p => p.id === item.product_id);
      return acc + ((prod ? prod.price_per_unit : 0) * item.quantity);
    }, 0)
  };
  mockPreSales.push(preSale);
  return { presale_id: preSale.id };
};

export const fetchPendingPreSales = async () => {
  return [...mockPreSales];
};

export const finalizeSale = async (saleData) => {
  saleData.items.forEach(item => {
    const prodIndex = mockProducts.findIndex(p => p.id === item.product_id);
    if (prodIndex !== -1) {
      mockProducts[prodIndex].stock = Math.max(0, mockProducts[prodIndex].stock - item.quantity);
    }
  });

  if (saleData.presale_id) {
    mockPreSales = mockPreSales.filter(ps => ps.id !== saleData.presale_id);
  }

  return { success: true };
};
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

        {/* CAJA */}
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

            {paymentMethod === 'Mixto' && (
              <View style={styles.card}>
                <TextInput style={styles.input} placeholder="Monto en Efectivo ($)" keyboardType="numeric" value={amountCash} onChangeText={setAmountCash} />
                <TextInput style={styles.input} placeholder="Monto en Mercado Pago ($)" keyboardType="numeric" value={amountMP} onChangeText={setAmountMP} />
              </View>
            )}

            <View style={styles.totalBox}>
              <Text style={{ fontSize: 18, fontWeight: 'bold' }}>TOTAL:</Text>
              <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#28a745' }}>${getCashierTotal()}</Text>
            </View>

            <TouchableOpacity style={styles.buttonSuccess} onPress={handleFinalizeSale} disabled={loading}>
              <Text style={styles.buttonText}>💳 Concretar Venta y Cobrar</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* INVENTARIO COMPLETO */}
        {currentTab === 'inventario' && (
          <ScrollView contentContainerStyle={styles.scrollPadding} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>📦 Control de Inventario</Text>
            <View style={styles.card}>
              <Text style={styles.subSectionTitle}>Nuevo Producto</Text>
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

              <TouchableOpacity style={[styles.buttonPrimary, { marginTop: 15 }]} onPress={handleCreateProduct} disabled={loading}>
                <Text style={styles.buttonText}>+ Guardar Producto</Text>
              </TouchableOpacity>
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
                  <TouchableOpacity style={styles.buttonDanger} onPress={() => handleDeleteProduct(p.id)}>
                    <Text style={styles.buttonText}>Eliminar</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        )}

        {/* USUARIOS COMPLETO */}
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
  inputSmall: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc', padding: 6, borderRadius: 6, width: 50, textAlign: 'center', fontWeight: 'bold' },
  typeBtn: { flex: 1, padding: 10, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, alignItems: 'center', backgroundColor: '#e9ecef' },
  typeBtnActive: { backgroundColor: '#007bff', borderColor: '#0056b3' },
  buttonPrimary: { backgroundColor: '#007bff', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 10 },
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
  productCard: { backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  emptyText: { color: '#888', fontStyle: 'italic' },
  loginCard: { backgroundColor: '#fff', margin: 20, padding: 20, borderRadius: 10 },
  appTitle: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 15 },
  navbar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#ddd', paddingBottom: Platform.OS === 'android' ? 24 : 10, paddingTop: 8 },
  navBtn: { flex: 1, padding: 8, alignItems: 'center' },
  navActive: { borderTopWidth: 3, borderTopColor: '#007bff' },
  navText: { color: '#444', fontWeight: 'bold', fontSize: 11 }
});
