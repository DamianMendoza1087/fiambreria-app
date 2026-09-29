const API_URL = "https://fiambreria-backend.onrender.com";

let userToken = null;
export const setAuthToken = (t) => { userToken = t; };

export const loginUser = async (email, password) => {
  const formData = new URLSearchParams();
  formData.append("username", email);
  formData.append("password", password);
  const response = await fetch(`${API_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });
  if (!response.ok) throw new Error("Error al iniciar sesión");
  const data = await response.json();
  setAuthToken(data.access_token);
  return data;
};

export const fetchProducts = async () => (await fetch(`${API_URL}/products`)).json();
export const createProduct = async (data) => (await fetch(`${API_URL}/products`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })).json();
export const deleteProduct = async (id) => (await fetch(`${API_URL}/products/${id}`, { method: "DELETE" })).json();

export const fetchUsers = async () => (await fetch(`${API_URL}/users`)).json();
export const createUser = async (data) => (await fetch(`${API_URL}/users`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })).json();
export const activateCashier = async (id) => (await fetch(`${API_URL}/users/${id}/activate-cashier`, { method: "PATCH" })).json();

// Pre-ventas y Cobros
export const createPreSale = async (items) => (await fetch(`${API_URL}/presales`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) })).json();
export const fetchPendingPreSales = async () => (await fetch(`${API_URL}/presales/pending`)).json();
export const finalizeSale = async (payload) => (await fetch(`${API_URL}/sales/finalize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })).json();
