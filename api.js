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

export const updateUserPermissions = async (userId, permissions) => {
  const res = await fetch(`${API_URL}/users/${userId}/permissions`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(permissions),
  });
  if (!res.ok) throw new Error("Error al actualizar permisos");
  return await res.json();
};

export const submitStockAudit = async (productId, countedQty, reportedBy) => {
  const res = await fetch(`${API_URL}/products/${productId}/audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ counted_qty: countedQty, reported_by: reportedBy }),
  });
  if (!res.ok) throw new Error("Error al enviar el conteo físico");
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

export const deletePreSale = async (presaleId) => {
  const res = await fetch(`${API_URL}/presales/${presaleId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Error al cancelar pre-venta");
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

export const fetchCashSessionStatus = async () => {
  const res = await fetch(`${API_URL}/cash/status`);
  if (!res.ok) throw new Error("Error al consultar estado de caja");
  return await res.json();
};

export const openCashSession = async (initialAmount, openedBy) => {
  const res = await fetch(`${API_URL}/cash/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initial_amount: initialAmount, opened_by: openedBy }),
  });
  if (!res.ok) throw new Error("Error al abrir caja");
  return await res.json();
};

export const closeCashSession = async (reportedCash, closedBy, attemptNumber) => {
  const res = await fetch(`${API_URL}/cash/close`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reported_cash: reportedCash, closed_by: closedBy, attempt_number: attemptNumber }),
  });
  if (!res.ok) throw new Error("Error al procesar el arqueo de caja");
  return await res.json();
};

export const fetchCashAuditsByDate = async (dateStr) => {
  const res = await fetch(`${API_URL}/cash/audits?date=${dateStr}`);
  if (!res.ok) throw new Error("Error al consultar arqueos de caja");
  return await res.json();
};

export const fetchWorkLogs = async () => {
  const res = await fetch(`${API_URL}/hr/worklogs`);
  if (!res.ok) throw new Error("Error al obtener fichajes de empleados");
  return await res.json();
};

export const fetchEmployeePerformance = async (userEmail, days = 30) => {
  const res = await fetch(`${API_URL}/hr/performance?email=${userEmail}&days=${days}`);
  if (!res.ok) throw new Error("Error al consultar desempeño del empleado");
  return await res.json();
};

export const compareEmployeesMetrics = async (email1, email2, days = 30) => {
  const res = await fetch(`${API_URL}/hr/compare?email1=${email1}&email2=${email2}&days=${days}`);
  if (!res.ok) throw new Error("Error al procesar comparativa de empleados");
  return await res.json();
};

export const fetchMRPStats = async (days = 7, targetDays = 3) => {
  const res = await fetch(`${API_URL}/mrp/suggestions?days=${days}&target_days=${targetDays}`);
  if (!res.ok) throw new Error("Error al calcular sugerencias de compras MRP");
  return await res.json();
};

export const fetchSystemAlerts = async () => {
  const res = await fetch(`${API_URL}/alerts`);
  if (!res.ok) throw new Error("Error al consultar alertas del sistema");
  return await res.json();
};

export const fetchProductLots = async (productId) => {
  const res = await fetch(`${API_URL}/products/${productId}/lots`);
  if (!res.ok) throw new Error("Error al consultar lotes del producto");
  return await res.json();
};

export const fetchKPIsDashboard = async () => {
  const res = await fetch(`${API_URL}/kpis/dashboard`);
  if (!res.ok) throw new Error("Error al obtener indicadores KPI");
  return await res.json();
};
