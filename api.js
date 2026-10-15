const API_URL = "https://fiambreria-backend.onrender.com";

const getApiErrorMessage = async (res, fallback) => {
  try {
    const data = await res.json();

    if (typeof data?.detail === 'string') {
      return data.detail;
    }

    if (Array.isArray(data?.detail)) {
      const messages = data.detail
        .map(item => {
          if (typeof item === 'string') return item;
          if (typeof item?.msg === 'string') return item.msg;
          return null;
        })
        .filter(Boolean);

      if (messages.length) return messages.join('\n');
    }

    if (typeof data?.message === 'string') {
      return data.message;
    }
  } catch (_) {}

  return fallback;
};

export const loginUser = async (email, password) => {
  const formData = new URLSearchParams();
  formData.append("username", email);
  formData.append("password", password);
  const response = await fetch(`${API_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });
  if (!response.ok) throw new Error(await getApiErrorMessage(response, "Credenciales incorrectas"));
  return await response.json();
};

export const fetchProducts = async (branchId = 1) => {
  const res = await fetch(`${API_URL}/products?branch_id=${branchId}`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al obtener productos"));
  return await res.json();
};

export const createProduct = async (productData) => {
  const res = await fetch(`${API_URL}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(productData),
  });
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al guardar producto"));
  return await res.json();
};

export const updateProduct = async (productId, productData) => {
  const res = await fetch(`${API_URL}/products/${productId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(productData),
  });
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al actualizar producto"));
  return await res.json();
};

export const deleteProduct = async (id) => {
  const res = await fetch(`${API_URL}/products/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al eliminar producto"));
  return await res.json();
};

export const fetchUsers = async () => {
  const res = await fetch(`${API_URL}/users`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al obtener usuarios"));
  return await res.json();
};

export const createUser = async (userData) => {
  const res = await fetch(`${API_URL}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(userData),
  });
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al crear usuario"));
  return await res.json();
};

export const updateUserPermissions = async (userId, permissions) => {
  const res = await fetch(`${API_URL}/users/${userId}/permissions`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(permissions),
  });
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al actualizar permisos"));
  return await res.json();
};

export const fetchLatestProductAudit = async (productId, branchId = 1) => {
  const res = await fetch(
    `${API_URL}/products/${productId}/audit/latest?branch_id=${branchId}`
  );

  if (!res.ok) {
    throw new Error(await getApiErrorMessage(res, "Error al consultar el último control físico"));
  }

  return await res.json();
};

export const submitStockAudit = async (productId, countedQty, reportedBy, branchId = 1) => {
  const res = await fetch(`${API_URL}/products/${productId}/audit?branch_id=${branchId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ counted_qty: countedQty, reported_by: reportedBy }),
  });
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al enviar el conteo físico"));
  return await res.json();
};

export const createPreSale = async (items, branchId = 1, createdBy = "Anonimo") => {
  const res = await fetch(`${API_URL}/presales?branch_id=${branchId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, created_by: createdBy }),
  });
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al generar pre-venta"));
  return await res.json();
};

export const fetchPendingPreSales = async (branchId = 1) => {
  const res = await fetch(`${API_URL}/presales/pending?branch_id=${branchId}`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al obtener pre-ventas pendientes"));
  return await res.json();
};

export const deletePreSale = async (presaleId, branchId = 1) => {
  const res = await fetch(`${API_URL}/presales/${presaleId}?branch_id=${branchId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al cancelar pre-venta"));
  return await res.json();
};

export const finalizeSale = async (saleData, branchId = 1) => {
  const res = await fetch(`${API_URL}/sales/finalize?branch_id=${branchId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(saleData),
  });
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al procesar cobro"));
  return await res.json();
};

export const fetchSalesHistory = async (
  branchId = 1,
  {
    dateFrom = null,
    dateTo = null,
    search = null,
    limit = 100
  } = {}
) => {
  const q = new URLSearchParams();
  q.set("branch_id", String(branchId));
  if (dateFrom) q.set("date_from", dateFrom);
  if (dateTo) q.set("date_to", dateTo);
  if (search) q.set("search", search);
  q.set("limit", String(limit));

  const res = await fetch(`${API_URL}/sales/history?${q.toString()}`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al obtener historial de ventas"));
  return await res.json();
};

export const fetchSaleDetail = async (saleId, branchId = 1) => {
  const res = await fetch(`${API_URL}/sales/${saleId}?branch_id=${branchId}`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al obtener comprobante de venta"));
  return await res.json();
};

export const fetchCashSessionStatus = async (branchId = 1) => {
  const res = await fetch(`${API_URL}/cash/status?branch_id=${branchId}`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al consultar estado de caja"));
  return await res.json();
};

export const openCashSession = async (initialAmount, openedBy, branchId = 1) => {
  const res = await fetch(`${API_URL}/cash/open?branch_id=${branchId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initial_amount: initialAmount, opened_by: openedBy }),
  });
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al abrir caja"));
  return await res.json();
};

export const closeCashSession = async (reportedCash, closedBy, attemptNumber, branchId = 1) => {
  const res = await fetch(`${API_URL}/cash/close?branch_id=${branchId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reported_cash: reportedCash, closed_by: closedBy, attempt_number: attemptNumber }),
  });
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al procesar el arqueo de caja"));
  return await res.json();
};

export const fetchCashAuditsByDate = async (dateStr, branchId = 1) => {
  const res = await fetch(`${API_URL}/cash/audits?date=${dateStr}&branch_id=${branchId}`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al consultar arqueos de caja"));
  return await res.json();
};

export const fetchWorkLogs = async () => {
  const res = await fetch(`${API_URL}/hr/worklogs`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al obtener fichajes de empleados"));
  return await res.json();
};

export const fetchEmployeePerformance = async (userEmail, days = 30) => {
  const res = await fetch(`${API_URL}/hr/performance?email=${userEmail}&days=${days}`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al consultar desempeño del empleado"));
  return await res.json();
};

export const compareEmployeesMetrics = async (email1, email2, days = 30) => {
  const res = await fetch(`${API_URL}/hr/compare?email1=${email1}&email2=${email2}&days=${days}`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al procesar comparativa de empleados"));
  return await res.json();
};

export const fetchMRPStats = async (days = 7, targetDays = 3, branchId = 1) => {
  const res = await fetch(`${API_URL}/mrp/suggestions?days=${days}&target_days=${targetDays}&branch_id=${branchId}`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al calcular sugerencias de compras MRP"));
  return await res.json();
};

export const fetchSystemAlerts = async (branchId = 1) => {
  const res = await fetch(`${API_URL}/alerts?branch_id=${branchId}`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al consultar alertas del sistema"));
  return await res.json();
};

export const fetchProductLots = async (productId, branchId = 1) => {
  const res = await fetch(`${API_URL}/products/${productId}/lots?branch_id=${branchId}`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al consultar lotes del producto"));
  return await res.json();
};

export const fetchKPIsDashboard = async (period = "month", branchId = 1) => {
  const res = await fetch(`${API_URL}/kpis/dashboard?period=${encodeURIComponent(period)}&branch_id=${branchId}`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al obtener indicadores KPI"));
  return await res.json();
};
export const fetchProfitability = async (period = "month", branchId = 1) => {
  const res = await fetch(`${API_URL}/kpis/profitability?period=${encodeURIComponent(period)}&branch_id=${branchId}`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al obtener rentabilidad"));
  return await res.json();
};

export const fetchMasterProductByBarcode = async (barcode) => {
  const res = await fetch(
    `${API_URL}/products/master/by-barcode/${encodeURIComponent(barcode)}`
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error buscando EAN maestro"));
  return await res.json();
};

export const fetchProductByBarcode = async (barcode, branchId = 1) => {
  const res = await fetch(`${API_URL}/products/by-barcode/${encodeURIComponent(barcode)}?branch_id=${branchId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error buscando EAN"));
  return await res.json();
};
export const searchProducts = async (q, branchId = 1) => {
  const res = await fetch(`${API_URL}/products/search?q=${encodeURIComponent(q || "")}&branch_id=${branchId}`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error buscando productos"));
  return await res.json();
};
export const createProductMaster = async (data, branchId = 1) => {
  const res = await fetch(`${API_URL}/products/master?branch_id=${branchId}`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error creando producto"));
  return await res.json();
};
export const createIngress = async (data, branchId = 1) => {
  const res = await fetch(`${API_URL}/ingresses?branch_id=${branchId}`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
  if (!res.ok) throw await buildApiError(res, "Error registrando ingreso");
  return await res.json();
};
export const fetchIngresses = async (productId=null, branchId=1) => {
  const q = new URLSearchParams();
  q.set("branch_id", String(branchId));
  if (productId) q.set("product_id", String(productId));
  const res=await fetch(`${API_URL}/ingresses?${q.toString()}`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error consultando ingresos"));
  return await res.json();
};
export const updateIngress = async (ingressId, data, branchId = 1) => {
  const res = await fetch(`${API_URL}/ingresses/${ingressId}?branch_id=${branchId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    throw new Error(await getApiErrorMessage(res, "Error corrigiendo ingreso"));
  }
  return await res.json();
};

export const fetchIngressHistory = async (
  branchId = 1,
  {
    search = null,
    dateFrom = null,
    dateTo = null,
    limit = 100
  } = {}
) => {
  const q = new URLSearchParams();
  q.set("branch_id", String(branchId));
  if (search) q.set("search", search);
  if (dateFrom) q.set("date_from", dateFrom);
  if (dateTo) q.set("date_to", dateTo);
  q.set("limit", String(limit));

  const res = await fetch(`${API_URL}/ingresses/history?${q.toString()}`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al obtener historial de ingresos"));
  return await res.json();
};


export const createCashMovement = async (data, branchId = 1) => {
  const res = await fetch(`${API_URL}/cash/movements?branch_id=${branchId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    throw new Error(await getApiErrorMessage(res, "Error registrando movimiento"));
  }
  return await res.json();
};

export const fetchCashMovements = async (sessionId = null, branchId = 1) => {
  const q = new URLSearchParams();
  q.set("branch_id", String(branchId));
  if (sessionId) q.set("session_id", String(sessionId));
  const res = await fetch(`${API_URL}/cash/movements?${q.toString()}`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error consultando movimientos de caja"));
  return await res.json();
};

export const createStockLoss = async (data, branchId = 1) => {
  const res = await fetch(`${API_URL}/stock/losses?branch_id=${branchId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    throw new Error(await getApiErrorMessage(res, "Error registrando merma"));
  }
  return await res.json();
};

export const startHRShift = async (userId, roleWorked) => {
  const res = await fetch(`${API_URL}/hr/shifts/start`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({user_id:userId,role_worked:roleWorked})});
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error iniciando turno"));
  return await res.json();
};
export const endHRShift = async (userId) => {
  const res = await fetch(`${API_URL}/hr/shifts/end`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({user_id:userId})});
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error cerrando turno"));
  return await res.json();
};
export const fetchActiveHRShifts = async () => {
  const res = await fetch(`${API_URL}/hr/shifts/active`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error consultando turnos activos"));
  return await res.json();
};
export const fetchHRWorkLogs = async (email=null, days=30) => {
  const q = new URLSearchParams();
  if (email) q.set("email", email);
  q.set("days", String(days));
  const res = await fetch(`${API_URL}/hr/worklogs?${q.toString()}`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error consultando fichajes"));
  return await res.json();
};
export const compareHR = async (emails=[], days=30) => {
  const q = new URLSearchParams();
  if (emails.length) q.set("emails", emails.join(","));
  q.set("days", String(days));
  const res = await fetch(`${API_URL}/hr/compare?${q.toString()}`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error comparando empleados"));
  return await res.json();
};
export const setUserEnabled = async (userId, isActive) => {
  const res = await fetch(`${API_URL}/users/${userId}/status`, {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({is_active:isActive})});
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error cambiando estado"));
  return await res.json();
};

export const actOnAlert = async (alertKey, action, actor, note="", snoozeHours=24) => {
  const r=await fetch(`${API_URL}/alerts/${encodeURIComponent(alertKey)}/action`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,actor,note,snooze_hours:snoozeHours})});
  if(!r.ok) throw new Error(await getApiErrorMessage(r, "Error actualizando alerta"));
  return await r.json();
};
export const fetchAlertHistory = async (limit=100) => {
  const r=await fetch(`${API_URL}/alerts/history?limit=${limit}`);
  if(!r.ok) throw new Error(await getApiErrorMessage(r, "Error consultando historial de alertas"));
  return await r.json();
};
export const updateReplenishmentPolicy = async (productId,policy,actor,reason="") => {
  const r=await fetch(`${API_URL}/products/${productId}/replenishment-policy`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({policy,actor,reason})});
  if(!r.ok) throw new Error(await getApiErrorMessage(r, "Error cambiando política MRP"));
  return await r.json();
};

// ===== PROMOCIONES =====

export const fetchPromotions = async (branchId = 1) => {
  const res = await fetch(`${API_URL}/promotions?branch_id=${branchId}`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al obtener promociones"));
  return await res.json();
};

export const fetchPromotionDetail = async (promotionId, branchId = 1) => {
  const res = await fetch(`${API_URL}/promotions/${promotionId}?branch_id=${branchId}`);
  if (!res.ok) throw new Error(await getApiErrorMessage(res, "Error al obtener promoción"));
  return await res.json();
};

export const createPromotion = async (data) => {
  const res = await fetch(`${API_URL}/promotions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(await getApiErrorMessage(res, "Error al crear promoción"));
  }
  return await res.json();
};

export const updatePromotion = async (promotionId, data) => {
  const res = await fetch(`${API_URL}/promotions/${promotionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(await getApiErrorMessage(res, "Error al actualizar promoción"));
  }
  return await res.json();
};

export const deletePromotion = async (promotionId) => {
  const res = await fetch(`${API_URL}/promotions/${promotionId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(await getApiErrorMessage(res, "Error al eliminar promoción"));
  }
  return await res.json();
};

export const calculatePromotion = async (promotionId, items, branchId = 1) => {
  const res = await fetch(`${API_URL}/promotions/${promotionId}/calculate?branch_id=${branchId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: items.map(i => ({
        product_id: i.product_id,
        actual_qty: i.actual_qty
      }))
    }),
  });
  if (!res.ok) {
    throw new Error(await getApiErrorMessage(res, "Error al calcular promoción"));
  }
  return await res.json();
};

// ===== ADMINISTRACION MULTILOCAL / FERIA =====

export const fetchBranchProductsAdmin = async (branchId) => {
  const res = await fetch(`${API_URL}/branches/${branchId}/products`);
  if (!res.ok) {
    throw new Error(await getApiErrorMessage(res, "Error obteniendo productos de sucursal"));
  }
  return await res.json();
};

export const configureBranchProduct = async (branchId, productId, data) => {
  const res = await fetch(`${API_URL}/branches/${branchId}/products/${productId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(await getApiErrorMessage(res, "Error configurando producto de sucursal"));
  }

  return await res.json();
};

// Error con el código del header X-Error-Code (p. ej. RETIRE_REQUIRES_CONFIRMATION) y el status HTTP,
// para que la pantalla pueda pedir confirmación en lugar de solo mostrar el mensaje.
const buildApiError = async (res, fallback) => {
  const error = new Error(await getApiErrorMessage(res, fallback));
  error.status = res.status;
  error.code = res.headers?.get?.("X-Error-Code") || null;
  return error;
};

export const fetchRetirePreview = async (branchId, productId) => {
  const res = await fetch(`${API_URL}/branches/${branchId}/products/${productId}/retire-preview`);
  if (!res.ok) throw await buildApiError(res, "Error consultando el stock del producto en la sucursal");
  return await res.json();
};

export const removeBranchProduct = async (branchId, productId, options = {}) => {
  const q = new URLSearchParams();
  if (options.confirmStock) q.set("confirm_stock", "true");
  if (options.actor) q.set("actor", options.actor);
  if (options.reason) q.set("reason", options.reason);
  const query = q.toString();
  const res = await fetch(`${API_URL}/branches/${branchId}/products/${productId}${query ? `?${query}` : ""}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    throw await buildApiError(res, "Error retirando producto de sucursal");
  }

  return await res.json();
};

export const reactivateBranchProduct = async (branchId, productId, actor = null, reason = null) => {
  const res = await fetch(`${API_URL}/branches/${branchId}/products/${productId}/reactivate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor, reason }),
  });
  if (!res.ok) throw await buildApiError(res, "Error reactivando producto en la sucursal");
  return await res.json();
};

// ===== OBJETIVO DE JORNADA — FERIA (branch_id=2) =====

const fairJsonRequest = async (path, method, data, fallback) => {
  const options = { method, headers: { "Content-Type": "application/json" } };
  if (data !== undefined) options.body = JSON.stringify(data);
  const res = await fetch(`${API_URL}${path}`, options);
  // Propaga el mensaje real del backend (incluidos los 422 de validación).
  if (!res.ok) throw new Error(await getApiErrorMessage(res, fallback));
  return await res.json();
};

export const fetchFairConfig = (branchId = 2) =>
  fairJsonRequest(`/branches/${branchId}/fair-config`, "GET", undefined, "Error al obtener la configuración de Feria");

export const updateFairConfig = (data, branchId = 2) =>
  fairJsonRequest(`/branches/${branchId}/fair-config`, "PUT", data, "Error al guardar la configuración de Feria");

export const previewFairDayPlan = (data) =>
  fairJsonRequest(`/day-plans/preview`, "POST", data, "Error al analizar la jornada");

export const createFairDayPlan = (data) =>
  fairJsonRequest(`/day-plans`, "POST", data, "Error al guardar el plan");

export const fetchFairDayPlans = (branchId = 2) =>
  fairJsonRequest(`/day-plans?branch_id=${branchId}`, "GET", undefined, "Error al obtener los planes");

export const fetchFairDayPlan = (id) =>
  fairJsonRequest(`/day-plans/${id}`, "GET", undefined, "Error al obtener el plan");

export const updateFairDayPlan = (id, data) =>
  fairJsonRequest(`/day-plans/${id}`, "PUT", data, "Error al actualizar el plan");

export const recalculateFairDayPlan = (id, actor = null) =>
  fairJsonRequest(`/day-plans/${id}/recalculate`, "POST", { actor }, "Error al recalcular el plan");

export const updateFairDayPlanStatus = (id, status, actor = null, reason = null) =>
  fairJsonRequest(`/day-plans/${id}/status`, "PATCH", { status, actor, reason }, "Error al cambiar el estado del plan");

// ===== JORNADA DE FERIA EN VIVO (branch_id=2) =====
// El backend calcula todo; actor = email del usuario (validación de coherencia, no autenticación).

export const fetchOpenFairDayPlan = (branchId = 2) =>
  fairJsonRequest(`/day-plans/open?branch_id=${branchId}`, "GET", undefined, "Error al consultar la jornada en curso");

export const openFairDayPlan = (id, actor) =>
  fairJsonRequest(`/day-plans/${id}/open`, "POST", { actor }, "Error al iniciar la jornada");

export const fetchFairDayPlanLive = (id) =>
  fairJsonRequest(`/day-plans/${id}/live`, "GET", undefined, "Error al obtener la jornada");

export const closeFairDayPlan = (id, actor) =>
  fairJsonRequest(`/day-plans/${id}/close`, "POST", { actor }, "Error al cerrar la jornada");
