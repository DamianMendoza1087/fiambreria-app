// Obtener lista de usuarios
export const fetchUsers = async () => {
  const response = await fetch(`${API_URL}/users`, {
    headers: { Authorization: `Bearer ${userToken}` }
  });
  if (!response.ok) throw new Error("Error al obtener usuarios");
  return await response.json();
};

// Crear nuevo usuario con rol
export const createUser = async (userData) => {
  const response = await fetch(`${API_URL}/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify(userData),
  });
  if (!response.ok) throw new Error("Error al crear usuario");
  return await response.json();
};

// Activar cajero único de turno
export const activateCashier = async (userId) => {
  const response = await fetch(`${API_URL}/users/${userId}/activate-cashier`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${userToken}` }
  });
  if (!response.ok) throw new Error("Error al asignar cajero de turno");
  return await response.json();
};
