const API_URL = "https://fiambreria-backend.onrender.com";

// ... [loginUser, fetchProducts, createProduct, updateProduct, deleteProduct, etc.]

export const fetchKPIsDashboard = async () => {
  const res = await fetch(`${API_URL}/kpis/dashboard`);
  if (!res.ok) throw new Error("Error al obtener indicadores KPI");
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
