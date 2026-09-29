// Mock / Simulador de API Backend
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
  return { id: 1, name: 'Admin Principal', role: 'superadmin', token: 'mock-jwt-token' };
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
    unit_type: productData.unit_type || 'unid', // 'unid' o 'kg'
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
  // Descontar stock de los productos vendidos
  saleData.items.forEach(item => {
    const prodIndex = mockProducts.findIndex(p => p.id === item.product_id);
    if (prodIndex !== -1) {
      mockProducts[prodIndex].stock = Math.max(0, mockProducts[prodIndex].stock - item.quantity);
    }
  });

  // Si vino de una pre-venta, eliminarla de las pendientes
  if (saleData.presale_id) {
    mockPreSales = mockPreSales.filter(ps => ps.id !== saleData.presale_id);
  }

  return { success: true };
};
