const API_URL = "https://fiambreria-backend.onrender.com";

export const loginUser = async (email, password) => {
  const formData = new URLSearchParams();
  formData.append("username", email);
  formData.append("password", password);
  const response = await fetch(`${API_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });
  if (!response.ok) throw new Error("Credenciales incorrectas");
  return await response.json();
};

export const fetchProducts = async () => {
  const res = await fetch(`${API_URL}/products`);
  if (!res.ok) throw new Error("Error al obtener productos");
  return await res.json();
};

export const createProduct = async (productData) => {
  const res = await fetch(`${API_URL}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(productData),
  });
  if (!res.ok) throw new Error("Error al guardar producto");
  return await res.json();
};

export const updateProduct = async (productId, productData) => {
  const res = await fetch(`${API_URL}/products/${productId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(productData),
  });
  if (!res.ok) throw new Error("Error al actualizar producto");
  return await res.json();
};

export const deleteProduct = async (id) => {
  const res = await fetch(`${API_URL}/products/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Error al eliminar producto");
  return await res.json();
};

export const fetchUsers = async () => {
  const res = await fetch(`${API_URL}/users`);
  if (!res.ok) throw new Error("Error al obtener usuarios");
  return await res.json();
};

export const createUser = async (userData) => {
  const res = await fetch(`${API_URL}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(userData),
  });
  if (!res.ok) throw new Error("Error al crear usuario");
  return await res.json();
};

export const activateCashier = async (userId) => {
  const res = await fetch(`${API_URL}/users/${userId}/activate-cashier`, { method: "PATCH" });
  if (!res.ok) throw new Error("Error al asignar caja");
  return await res.json();
};

export const createPreSale = async (items) => {
  const res = await fetch(`${API_URL}/presales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error("Error al generar pre-venta");
  return await res.json();
};

export const fetchPendingPreSales = async () => {
  const res = await fetch(`${API_URL}/presales/pending`);
  if (!res.ok) throw new Error("Error al obtener pre-ventas pendientes");
  return await res.json();
};

export const finalizeSale = async (saleData) => {
  const res = await fetch(`${API_URL}/sales/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(saleData),
  });
  if (!res.ok) throw new Error("Error al procesar cobro");
  return await res.json();
};
