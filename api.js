const API_URL = "https://fiambreria-backend.onrender.com";

let userToken = null;

export const setAuthToken = (token) => {
  userToken = token;
};

// Login
export const loginUser = async (email, password) => {
  const formData = new URLSearchParams();
  formData.append("username", email);
  formData.append("password", password);

  const response = await fetch(`${API_URL}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || "Error al iniciar sesión");
  }

  const data = await response.json();
  setAuthToken(data.access_token);
  return data;
};

// Obtener productos
export const fetchProducts = async () => {
  const response = await fetch(`${API_URL}/products`);
  if (!response.ok) throw new Error("Error al obtener productos");
  return await response.json();
};

// Crear producto
export const createProduct = async (productData) => {
  const response = await fetch(`${API_URL}/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify(productData),
  });

  if (!response.ok) throw new Error("Error al crear producto");
  return await response.json();
};

// Eliminar producto
export const deleteProduct = async (id) => {
  const response = await fetch(`${API_URL}/products/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${userToken}`,
    },
  });

  if (!response.ok) throw new Error("Error al eliminar producto");
  return await response.json();
};
