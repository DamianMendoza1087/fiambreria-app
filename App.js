import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator, Platform, StatusBar, Alert, useWindowDimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';
import FairDayPlanner from './FairDayPlanner';
import PosterMaker from './PosterMaker';
import { loginUser, fetchProducts, createProduct, updateProduct, deleteProduct, fetchUsers, createUser, updateUserPermissions, submitStockAudit, createPreSale, fetchPendingPreSales, deletePreSale, finalizeSale, fetchCashSessionStatus, openCashSession, closeCashSession, fetchCashAuditsByDate, fetchWorkLogs, compareEmployeesMetrics, fetchMRPStats, fetchSystemAlerts, fetchProductLots, fetchKPIsDashboard, fetchProfitability, fetchMasterProductByBarcode, fetchProductByBarcode, searchProducts, createProductMaster, createIngress, fetchIngresses, updateIngress, createCashMovement, fetchCashMovements, createStockLoss, startHRShift, endHRShift, fetchActiveHRShifts, fetchHRWorkLogs, compareHR, setUserEnabled, actOnAlert, fetchAlertHistory, updateReplenishmentPolicy, fetchBranchProductsAdmin, configureBranchProduct, removeBranchProduct, fetchRetirePreview, reactivateBranchProduct, fetchLatestProductAudit, fetchSalesHistory, fetchSaleDetail, fetchPromotions, fetchPromotionDetail, createPromotion, updatePromotion, deletePromotion, calculatePromotion, fetchIngressHistory } from './api';

// Presentaciones visuales del producto (Ingresos y edición desde Stock).
const VISUAL_PRESENTATION_OPTIONS = [
  ['horma_redonda', 'Horma redonda'],
  ['horma_rectangular', 'Horma rectangular'],
  ['barra', 'Barra'],
  ['embutido_entero', 'Embutido entero'],
  ['jamon_entero', 'Jamón entero'],
  ['botella', 'Botella'],
  ['paquete', 'Paquete'],
  ['unidad', 'Unidad / pieza'],
  ['otro', 'Otro']
];

export default function App() {
  const loadBranchAdminProducts = async () => {
    if (!branchId) return;
    try {
      setLoading(true);
      const data = await fetchBranchProductsAdmin(branchId);
      setBranchAdminProducts(data);
      const drafts = {};
      const minStockDrafts = {};
      data.forEach(x => {
        drafts[x.product_id] = String(x.branch_price ?? x.base_price ?? '');
        minStockDrafts[x.product_id] = x.minimum_stock != null ? String(x.minimum_stock) : '';
      });
      setBranchPriceDrafts(drafts);
      setBranchMinStockDrafts(minStockDrafts);
    } catch (e) {
      alert(e.message || 'No se pudo cargar el catálogo de sucursal');
    } finally {
      setLoading(false);
    }
  };

  const saveBranchProductConfig = async (item, changes = {}) => {
    try {
      setLoading(true);

      const rawPrice = branchPriceDrafts[item.product_id];
      const price = Number(String(rawPrice ?? item.branch_price ?? item.base_price).replace(',', '.'));

      if (!Number.isFinite(price) || price < 0) {
        alert('Ingresá un precio válido');
        return;
      }

      const rawMinStock = branchMinStockDrafts[item.product_id];
      let minimumStockVal = null;
      if (rawMinStock !== undefined && rawMinStock !== null && String(rawMinStock).trim() !== '') {
        const parsedMin = Number(String(rawMinStock).replace(',', '.'));
        if (!Number.isFinite(parsedMin) || parsedMin < 0) {
          alert('Ingresá un stock mínimo válido (mayor o igual a 0)');
          return;
        }
        minimumStockVal = parsedMin;
      }

      await configureBranchProduct(branchId, item.product_id, {
        price_per_unit: price,
        is_available: changes.is_available ?? item.is_available,
        is_exclusive: changes.is_exclusive ?? item.is_exclusive,
        minimum_stock: minimumStockVal
      });

      await loadBranchAdminProducts();
      const refreshed = await fetchProducts(branchId || 1);
      setProducts(refreshed);
    } catch (e) {
      alert(e.message || 'No se pudo guardar');
    } finally {
      setLoading(false);
    }
  };

  // Confirmación con botones Cancelar / Confirmar (Alert nativo en Android/iOS, confirm en web).
  const confirmAction = (title, message, confirmLabel = 'Confirmar', destructive = false) => new Promise((resolve) => {
    if (Platform.OS === 'web') {
      resolve(typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(`${title}\n\n${message}`) : false);
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) }
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });

  const refreshBranchCatalogs = async () => {
    await loadBranchAdminProducts();
    setProducts(await fetchProducts(branchId || 1));
  };

  // Retirar de sucursal: solo deshabilita el producto en ESTA sucursal (no borra producto, partidas ni historial).
  const disableBranchProduct = async (item) => {
    let preview;
    try {
      setLoading(true);
      preview = await fetchRetirePreview(branchId, item.product_id);
    } catch (e) {
      alert(e.message || 'No se pudo consultar el stock del producto');
      return;
    } finally {
      setLoading(false);
    }

    const unit = preview.unit_type === 'kg' ? 'kg' : 'unid';
    let message = `"${preview.product_name}" dejará de estar disponible para la venta y la cartelería en ${preview.branch_name}.\n\nEl producto, sus partidas y su historial no se borran. Podés reactivarlo cuando quieras.`;
    if (preview.requires_confirmation) {
      const qtyText = Number(preview.stock).toLocaleString('es-AR', { maximumFractionDigits: 3 });
      const valueText = preview.stock_value_at_cost != null
        ? `Valor a costo: ${formatMoney(preview.stock_value_at_cost)}.`
        : 'Valor a costo: no disponible (hay partidas sin costo cargado).';
      message = `⚠️ Todavía hay ${qtyText} ${unit} en stock en ${preview.branch_name}.\n${valueText}\n\nEse stock quedará sin vender mientras el producto esté retirado.\n\n` + message;
    }

    const confirmed = await confirmAction('Retirar de sucursal', message, 'Retirar', true);
    if (!confirmed) return;

    try {
      setLoading(true);
      await removeBranchProduct(branchId, item.product_id, {
        confirmStock: preview.requires_confirmation,
        actor: email || null,
        reason: 'Retirar de sucursal desde Stock'
      });
      await refreshBranchCatalogs();
      alert(`✅ "${preview.product_name}" quedó RETIRADO de ${preview.branch_name}.`);
    } catch (e) {
      alert(e.message || 'No se pudo retirar el producto');
    } finally {
      setLoading(false);
    }
  };

  // Misma regla que el backend: sin precio de sucursal propio > 0 no se reactiva (nunca el precio global).
  const branchPriceMissingMessage = (productName) =>
    `"${productName}" no tiene precio de venta configurado para ${branchName}.\n\nPrimero cargá el precio en "Precio en sucursal" (Stock > Administración por Sucursal), tocá Guardar y después reactivalo.`;

  const reactivateProductInBranch = async (item) => {
    // Aviso anticipado; la validación que manda es la del backend.
    if ('branch_price_configured' in item) {
      const configuredPrice = Number(item.branch_price_configured);
      if (item.branch_price_configured == null || !Number.isFinite(configuredPrice) || configuredPrice <= 0) {
        alert(branchPriceMissingMessage(item.name));
        return;
      }
    }
    const confirmed = await confirmAction(
      'Reactivar en sucursal',
      `"${item.name}" volverá a estar disponible para la venta en ${branchName} a ${formatMoney(item.branch_price_configured ?? item.branch_price)}.`,
      'Reactivar'
    );
    if (!confirmed) return;
    try {
      setLoading(true);
      await reactivateBranchProduct(branchId, item.product_id, email || null, 'Reactivar desde Stock');
      await refreshBranchCatalogs();
      alert(`✅ "${item.name}" está disponible otra vez en ${branchName}.`);
    } catch (e) {
      if (e.code === 'BRANCH_PRICE_REQUIRED_FOR_REACTIVATION') {
        alert(branchPriceMissingMessage(item.name));
        return;
      }
      alert(e.message || 'No se pudo reactivar el producto');
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (value) => {
    const n=Number(value || 0);
    return '$'+n.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
  };

  const formatQuantityVisual = (qty, unitType) => {
    const q = Number(qty || 0);
    if (unitType === 'kg') {
      if (q < 1) {
        return `${Math.round(q * 1000)} g`;
      }
      if (q === 1) {
        return `1 kg`;
      }
      return `${q.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} kg`;
    }
    return `${q} unid`;
  };

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [branchId, setBranchId] = useState(null);
  const [branchSelectorPending, setBranchSelectorPending] = useState(false);

  const branchName = branchId === 2 ? 'Feria Damyale' : 'Fiambrería Local';
  const isAdminLevel = userRole === 'masteradmin' || userRole === 'superadmin';
  const isMasterAdmin = userRole === 'masteradmin';
  // 🎪 ¿Conviene abrir?: solo en Feria Damyale (branch_id=2) y para administración o dueño.
  const canFairPlanner = branchId === 2 && (isAdminLevel || userRole === 'dueno');

  // Permisos dinámicos por módulo y edición
  const [isAccountActive, setIsAccountActive] = useState(false);
  const [canPreventa, setCanPreventa] = useState(true);
  const [canCaja, setCanCaja] = useState(false);
  const [canStock, setCanStock] = useState(false);
  const [canIngreso, setCanIngreso] = useState(false);
  const [canAlertas, setCanAlertas] = useState(false);
  const [canRRHH, setCanRRHH] = useState(false);
  const [canMRP, setCanMRP] = useState(false);
  const [canVerificacion, setCanVerificacion] = useState(false);
  const [canKPIs, setCanKPIs] = useState(false);
  const [canEditRecords, setCanEditRecords] = useState(false);
  const [canCarteleria, setCanCarteleria] = useState(false);

  const [currentTab, setCurrentTab] = useState('preventa');
  // Pantallas angostas (Android): encabezados con botón pasan a dos renglones.
  const { width: windowWidth } = useWindowDimensions();
  const isNarrowScreen = windowWidth < 420;
  // Administración de catálogo por sucursal
  const [branchAdminProducts, setBranchAdminProducts] = useState([]);
  const [branchAdminSearch, setBranchAdminSearch] = useState('');
  const [stockEditForm, setStockEditForm] = useState(null); // edición de datos del producto desde Stock
  const [branchPriceDrafts, setBranchPriceDrafts] = useState({});
  const [branchMinStockDrafts, setBranchMinStockDrafts] = useState({});

  // Estados nuevos para el Listado de Stock y Precios en Inventario
  const [showStockList, setShowStockList] = useState(false);
  const [stockListSearch, setStockListSearch] = useState('');
  const [stockListFilter, setStockListFilter] = useState('todos');
  const [stockListCategory, setStockListCategory] = useState('todas');

  // Estados para Cartelería


  // Login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Productos & Buscadores
  const [products, setProducts] = useState([]);
  const [searchQueryVendor, setSearchQueryVendor] = useState('');
  const [searchQueryCashier, setSearchQueryCashier] = useState('');
  const [searchQueryStock, setSearchQueryStock] = useState('');

  // Auditoría y Lotes
  const [selectedAuditProd, setSelectedAuditProd] = useState(null);
  const [countedQtyInput, setCountedQtyInput] = useState('');
  const [selectedProdLots, setSelectedProdLots] = useState([]);
  const [latestStockAudit, setLatestStockAudit] = useState(null);

  // Ingreso / Edición de Producto
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState('');
  const [prodCost, setProdCost] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodSupplier, setProdSupplier] = useState('');
  const [prodStock, setProdStock] = useState('');
  const [prodUnitType, setProdUnitType] = useState('unid');
  const [prodBarcode, setProdBarcode] = useState('');
  const [prodExpirationDate, setProdExpirationDate] = useState('');
  const [ingressProductId, setIngressProductId] = useState(null);
  const [prodBrand, setProdBrand] = useState('');
  const [prodLotNumber, setProdLotNumber] = useState('');
  const [prodRequiresExpiration, setProdRequiresExpiration] = useState(false);
  const [prodVisualPresentation, setProdVisualPresentation] = useState('unidad');
  const [ingressSearch, setIngressSearch] = useState('');
  const [ingressMatches, setIngressMatches] = useState([]);

  // Promociones
  const [salesMode, setSalesMode] = useState('normal'); // 'normal' | 'promotions'
  const [promotions, setPromotions] = useState([]);
  const [selectedPromotion, setSelectedPromotion] = useState(null);
  const [promotionItems, setPromotionItems] = useState([]);
  const [promotionCalculation, setPromotionCalculation] = useState(null);
  const [promotionLoading, setPromotionLoading] = useState(false);

  // Administración de Promociones
  const [showPromotionAdmin, setShowPromotionAdmin] = useState(false);
  const [promoAdminMode, setPromoAdminMode] = useState('list'); // 'list' | 'form'
  const [adminPromotions, setAdminPromotions] = useState([]);
  const [promoAdminLoading, setPromoAdminLoading] = useState(false);
  const [editingPromotionId, setEditingPromotionId] = useState(null);
  const [promoFormName, setPromoFormName] = useState('');
  const [promoFormDesc, setPromoFormDesc] = useState('');
  const [promoFormEnabled, setPromoFormEnabled] = useState(true);
  const [promoFormItems, setPromoFormItems] = useState([]);
  const [promoFormPriceB1, setPromoFormPriceB1] = useState('');
  const [promoFormEnabledB1, setPromoFormEnabledB1] = useState(true);
  const [promoFormPriceB2, setPromoFormPriceB2] = useState('');
  const [promoFormEnabledB2, setPromoFormEnabledB2] = useState(true);
  const [promoItemProductId, setPromoItemProductId] = useState('');
  const [promoItemQty, setPromoItemQty] = useState('');

  // Escáner
  const [permission, requestPermission] = useCameraPermissions();
  const [showCamera, setShowCamera] = useState(false);
  const [cameraTarget, setCameraTarget] = useState(null);
  const [scanned, setScanned] = useState(false);

  // Carritos & Cobro
  const [vendorCart, setVendorCart] = useState([]);
  const [pendingPreSales, setPendingPreSales] = useState([]);
  const [selectedPreSaleId, setSelectedPreSaleId] = useState(null);
  const [cashierCart, setCashierCart] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('Efectivo');
  const [amountMP, setAmountMP] = useState('');
  const [cashTendered, setCashTendered] = useState('');
  const [activePromotionSale, setActivePromotionSale] = useState(null); // { promotion, calculation, items }

  // TICKET / COMPROBANTE & HISTORIAL DE VENTAS
  const [lastTicket, setLastTicket] = useState(null);
  const [viewingTicket, setViewingTicket] = useState(null);
  const [showSalesHistoryModal, setShowSalesHistoryModal] = useState(false);
  const [salesHistoryList, setSalesHistoryList] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');

  // CAJA
  const [cashStatus, setCashStatus] = useState({ is_open: false });
  const [initialCashInput, setInitialCashInput] = useState('');
  const [closeCashInput, setCloseCashInput] = useState('');
  const [closeAttempt, setCloseAttempt] = useState(1);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [cashMovements, setCashMovements] = useState([]);
  const [cashMovementCategory, setCashMovementCategory] = useState('OPERATIVO');
  const [cashMovementAmount, setCashMovementAmount] = useState('');
  const [cashMovementConcept, setCashMovementConcept] = useState('');
  const [cashMovementSupplier, setCashMovementSupplier] = useState('');
  const [cashMovementEmployee, setCashMovementEmployee] = useState('');
  const [lossProductId, setLossProductId] = useState(null);
  const [lossSearch, setLossSearch] = useState('');
  const [lossQty, setLossQty] = useState('');
  const [lossReason, setLossReason] = useState('MERMA_CORTE');
  const [lossLotId, setLossLotId] = useState(null);
  const [lossLots, setLossLots] = useState([]);

  // VERIFICACIÓN & RRHH
  const [selectedAuditDate, setSelectedAuditDate] = useState(new Date().toISOString().split('T')[0]);
  const [cashAuditsList, setCashAuditsList] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [workLogs, setWorkLogs] = useState([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPass, setNewUserPass] = useState('');

  const [empCompare1, setEmpCompare1] = useState('');
  const [empCompare2, setEmpCompare2] = useState('');
  const [comparisonResult, setComparisonResult] = useState(null);
  const [activeHRShifts, setActiveHRShifts] = useState([]);
  const [hrSelectedEmails, setHRSelectedEmails] = useState([]);
  const [hrDays, setHRDays] = useState('30');
  const [hrIndividualEmail, setHRIndividualEmail] = useState('');
  const [hrIndividualLogs, setHRIndividualLogs] = useState([]);

  // MRP, ALERTAS Y KPIS
  const [mrpSuggestions, setMrpSuggestions] = useState([]);
  const [mrpDays, setMrpDays] = useState('7');
  const [mrpTargetDays, setMrpTargetDays] = useState('3');
  const [systemAlerts, setSystemAlerts] = useState([]);
  const [alertHistory, setAlertHistory] = useState([]);
  const [showAlertHistory, setShowAlertHistory] = useState(false);
  const [kpiData, setKpiData] = useState(null);
  const [kpiPeriod, setKpiPeriod] = useState('month');
  const [profitabilityData, setProfitabilityData] = useState(null);
  const [ingressHistory, setIngressHistory] = useState([]);
  const [editingIngress, setEditingIngress] = useState(null);
  const [editIngressQty, setEditIngressQty] = useState("");
  const [editIngressCost, setEditIngressCost] = useState("");
  const [editIngressSupplier, setEditIngressSupplier] = useState("");
  const [editIngressLot, setEditIngressLot] = useState("");
  const [editIngressExpiration, setEditIngressExpiration] = useState("");
  const [editIngressReason, setEditIngressReason] = useState("");

  // Estados específicos para Historial de Ingresos
  const [showIngressHistory, setShowIngressHistory] = useState(false);
  const [ingressHistorySearch, setIngressHistorySearch] = useState('');
  const [ingressHistoryDateFrom, setIngressHistoryDateFrom] = useState('');
  const [ingressHistoryDateTo, setIngressHistoryDateTo] = useState('');
  const [ingressHistoryLoading, setIngressHistoryLoading] = useState(false);

  // Estados para Edición Ampliada en Corrección de Ingreso
  const [editProdName, setEditProdName] = useState("");
  const [editProdBrand, setEditProdBrand] = useState("");
  const [editProdCategory, setEditProdCategory] = useState("");
  const [editProdBarcode, setEditProdBarcode] = useState("");
  const [editProdUnitType, setEditProdUnitType] = useState("unid");
  const [editProdRequiresExpiration, setEditProdRequiresExpiration] = useState(false);
  const [editBranchPrice, setEditBranchPrice] = useState("");


  const loadPromotions = async () => {
    try {
      const data = await fetchPromotions(branchId || 1);
      setPromotions(data || []);
    } catch (e) {
      console.log('Error cargando promociones:', e.message);
    }
  };

  const loadInitialData = async () => {
    try {
      setProducts(await fetchProducts(branchId || 1));
      await loadPromotions();
      const users = await fetchUsers();
      setUsersList(users);
      if (users.length > 1) {
        setEmpCompare1(users[0].email);
        setEmpCompare2(users[1].email);
      }
      setPendingPreSales(await fetchPendingPreSales(branchId || 1));
      const activeBranch = branchId || 1;
      const cs=await fetchCashSessionStatus(activeBranch);
      setCashStatus(cs);
      if (cs.is_open && cs.session_id) setCashMovements(await fetchCashMovements(cs.session_id, activeBranch));
      else setCashMovements([]);
      setSystemAlerts(await fetchSystemAlerts(branchId || 1));
      setActiveHRShifts(await fetchActiveHRShifts());

      const currentUser = users.find(u => u.email === email);
      if (currentUser) {
        setIsAccountActive(currentUser.is_active);
        setUserRole(currentUser.role);
        setCanPreventa(currentUser.can_preventa);
        setCanCaja(currentUser.can_caja);
        setCanStock(currentUser.can_stock);
        setCanIngreso(currentUser.can_ingreso);
        setCanAlertas(currentUser.can_alertas);
        setCanRRHH(currentUser.can_rrhh);
        setCanMRP(currentUser.can_mrp);
        setCanVerificacion(currentUser.can_verificacion);
        setCanKPIs(currentUser.can_kpis);
        setCanEditRecords(currentUser.can_edit_records);
        setCanCarteleria(currentUser.can_carteleria);
      }
    } catch (e) {
      console.log('Error de sincronización:', e.message);
    }
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    loadInitialData();
    const interval = setInterval(() => { loadInitialData(); }, 5000);
    return () => clearInterval(interval);
  }, [isLoggedIn, branchId]);

  useEffect(() => {
    if (currentTab === 'feria' && !canFairPlanner) setCurrentTab('preventa');
  }, [currentTab, canFairPlanner]);

  const handleTabChange = async (tabName) => {
    setCurrentTab(tabName);
    if (tabName === 'verificacion') loadCashAudits();
    else if (tabName === 'rrhh') loadHRData();
    else if (tabName === 'mrp') loadMRPData();
    else if (tabName === 'alertas') loadAlertsData();
    else if (tabName === 'kpis') loadKPIData();
    else if (tabName === 'ingresos') {
      setIngressHistory([]);
      setShowIngressHistory(false);
      setEditingIngress(null);
    }
    await loadInitialData();
  };

  const loadCashAudits = async () => {
    try { setLoading(true); setCashAuditsList(await fetchCashAuditsByDate(selectedAuditDate, branchId || 1)); }
    catch (e) { alert('Error cargando arqueos'); }
    finally { setLoading(false); }
  };

  const loadHRData = async () => {
    try { setLoading(true); setWorkLogs(await fetchWorkLogs()); setUsersList(await fetchUsers()); }
    catch (e) { alert('Error en RRHH'); }
    finally { setLoading(false); }
  };

  const loadAlertsData = async () => {
    try { setLoading(true); setSystemAlerts(await fetchSystemAlerts(branchId || 1)); }
    catch (e) { alert('Error cargando alertas'); }
    finally { setLoading(false); }
  };

  const loadKPIData = async (period = kpiPeriod) => {
    try {
      setLoading(true);
      const [dashboard, profitability] = await Promise.all([
        fetchKPIsDashboard(period, branchId || 1),
        fetchProfitability(period, branchId || 1)
      ]);
      setKpiData(dashboard); setProfitabilityData(profitability);
    } catch (e) { alert('Error cargando KPIs: ' + e.message); }
    finally { setLoading(false); }
  };
  const changeKPIPeriod = async (period) => {
    setKpiPeriod(period);
    await loadKPIData(period);
  };

  const refreshHR = async () => {
    setActiveHRShifts(await fetchActiveHRShifts());
    if (hrIndividualEmail) setHRIndividualLogs(await fetchHRWorkLogs(hrIndividualEmail, parseInt(hrDays) || 30));
  };
  const handleStartShift = async (u) => {
    try { setLoading(true); await startHRShift(u.id,u.role); await refreshHR(); alert(`Turno iniciado: ${u.name}`); }
    catch(e) { alert(e.message); } finally { setLoading(false); }
  };
  const handleEndShift = async (u) => {
    try { setLoading(true); await endHRShift(u.id); await refreshHR(); alert(`Turno finalizado: ${u.name}`); }
    catch(e) { alert(e.message); } finally { setLoading(false); }
  };
  const handleUserEnabled = async (u) => {
    try { setLoading(true); await setUserEnabled(u.id,!u.is_active); await loadInitialData(); }
    catch(e) { alert(e.message); } finally { setLoading(false); }
  };
  const toggleHRCompare = (mail) => setHRSelectedEmails(prev => prev.includes(mail) ? prev.filter(x=>x!==mail) : [...prev,mail]);
  const handleHRCompareV2 = async (all=false) => {
    const emails = all ? usersList.filter(u=>u.role!=='superadmin').map(u=>u.email) : hrSelectedEmails;
    if (!all && emails.length < 2) return alert('Seleccioná al menos 2 empleados.');
    try { setLoading(true); setComparisonResult(await compareHR(emails, parseInt(hrDays)||30)); }
    catch(e) { alert(e.message); } finally { setLoading(false); }
  };
  const handleIndividualHR = async (mail) => {
    setHRIndividualEmail(mail);
    try { setHRIndividualLogs(await fetchHRWorkLogs(mail, parseInt(hrDays)||30)); }
    catch(e) { alert(e.message); }
  };

  const handleCompareEmployees = async () => {
    if (!empCompare1 || !empCompare2) return alert('Seleccioná dos empleados');
    if (empCompare1 === empCompare2) return alert('Seleccioná empleados distintos');
    try {
      setLoading(true);
      setComparisonResult(await compareEmployeesMetrics(empCompare1, empCompare2, 30));
    } catch (e) { alert('Error en comparativa'); }
    finally { setLoading(false); }
  };

  const refreshAlertsV2 = async () => {
    setSystemAlerts(await fetchSystemAlerts(branchId || 1));
    if (showAlertHistory) setAlertHistory(await fetchAlertHistory());
  };
  const handleAlertAction = async (item, action) => {
    try {
      setLoading(true);
      await actOnAlert(item.id, action, email || 'superadmin', action === 'SNOOZED' ? 'Pospuesta 24 horas' : 'Acción desde app', 24);
      await refreshAlertsV2();
    } catch(e) { alert(e.message); } finally { setLoading(false); }
  };
  const handleAlertHistory = async () => {
    try {
      const next=!showAlertHistory; setShowAlertHistory(next);
      if(next) setAlertHistory(await fetchAlertHistory());
    } catch(e) { alert(e.message); }
  };
  const handleReplenishmentPolicy = async (productId, policy) => {
    try {
      setLoading(true);
      await updateReplenishmentPolicy(productId, policy, email || 'superadmin', 'Cambio desde módulo MRP');
      const updatedProducts = await fetchProducts(branchId || 1);
      setProducts(updatedProducts);
      setMrpSuggestions(await fetchMRPStats(parseInt(mrpDays,10)||7, parseInt(mrpTargetDays,10)||3, branchId || 1));
      setSystemAlerts(await fetchSystemAlerts(branchId || 1));
      
      const targetProd = updatedProducts.find(p => p.id === productId);
      const prodNameStr = targetProd ? targetProd.name : `Producto #${productId}`;
      const policyLabels = {
        'MRP': '🤖 MRP automático',
        'MANUAL': '✋ Reposición manual',
        'PAUSED': '⏸ No reponer',
        'DISCONTINUED': '⛔ Discontinuado'
      };
      const readablePolicy = policyLabels[policy] || policy;
      alert(`✅ ${prodNameStr}: ${readablePolicy}`);
    } catch(e) { alert(e.message); } finally { setLoading(false); }
  };

  const loadMRPData = async () => {
    try {
      setLoading(true);
      const d = parseInt(mrpDays) || 7;
      const t = parseInt(mrpTargetDays) || 3;
      setMrpSuggestions(await fetchMRPStats(d, t, branchId || 1));
    } catch (e) { alert('Error en MRP'); }
    finally { setLoading(false); }
  };

  const handleLogin = async () => {
    if (!email || !password) return alert('Ingresá email y contraseña.');
    try {
      setLoading(true);
      const res = await loginUser(email, password);
      setIsLoggedIn(true);
      setUserRole(res.role || 'vendedor');
      setIsAccountActive(res.is_active);
      setCanPreventa(res.can_preventa); setCanCaja(res.can_caja); setCanStock(res.can_stock);
      setCanIngreso(res.can_ingreso); setCanAlertas(res.can_alertas); setCanRRHH(res.can_rrhh);
      setCanMRP(res.can_mrp); setCanVerificacion(res.can_verificacion); setCanKPIs(res.can_kpis);
      setCanEditRecords(res.can_edit_records); setCanCarteleria(res.can_carteleria);

      if (['masteradmin', 'superadmin'].includes(res.role || 'vendedor')) {
        setBranchId(null);
        setBranchSelectorPending(true);
      } else {
        setBranchId(Number(res.branch_id || 1));
        setBranchSelectorPending(false);
      }
    } catch (e) { alert('Error: ' + e.message); }
    finally { setLoading(false); }
  };

  const handleLogout = () => {
    setIsLoggedIn(false); setEmail(''); setPassword(''); setUserRole('');
    setBranchId(null); setBranchSelectorPending(false);
  };

  const selectBranch = async (id) => {
    setBranchId(id);
    setBranchSelectorPending(false);
    setCurrentTab('preventa');
    setVendorCart([]);
    setCashierCart([]);
    setSelectedPreSaleId(null);
    setCashMovements([]);
    setLastTicket(null);
    setViewingTicket(null);
    setIngressHistory([]);
    setShowIngressHistory(false);
    setEditingIngress(null);
  };

  const changeBranch = () => {
    if (!isAdminLevel) return;
    setBranchSelectorPending(true);
  };

  const handleOpenCash = async () => {
    if (!initialCashInput) return alert('Ingresá el monto inicial');
    try {
      setLoading(true);
      const val = parseFloat(initialCashInput.replace(',', '.'));
      await openCashSession(val, email, branchId || 1);
      alert('✅ Caja abierta correctamente.'); setInitialCashInput('');
      await loadInitialData();
    } catch (e) { alert('Error al abrir caja'); }
    finally { setLoading(false); }
  };

  const handleCloseCash = async () => {
    if (!closeCashInput) return alert('Ingresá el monto contado');
    try {
      setLoading(true);
      const val = parseFloat(closeCashInput.replace(',', '.'));
      const res = await closeCashSession(val, email, closeAttempt, branchId || 1);

      if (res.status === 'mismatch_first_attempt') {
        alert(res.message); setCloseAttempt(2); setCloseCashInput('');
      } else {
        alert(res.is_correct ? `✅ ${res.message}` : `⚠️ Arqueo finalizado: ${res.message}`);
        setShowCloseModal(false); setCloseCashInput(''); setCloseAttempt(1);
        await loadInitialData();
      }
    } catch (e) { alert('Error al cerrar caja'); }
    finally { setLoading(false); }
  };

  const toggleCamera = async (targetModule) => {
    setScanned(false);
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return alert('Se requieren permisos de cámara.');
    }
    if (showCamera && cameraTarget === targetModule) {
      setShowCamera(false); setCameraTarget(null);
    } else {
      setCameraTarget(targetModule); setShowCamera(true);
    }
  };

  const selectIngressProduct = (p) => {
    setIngressProductId(p.id); setProdName(p.name || ''); setProdCategory(p.category || 'Varios');
    setProdBrand(p.brand || ''); setProdPrice(String(p.price_per_unit || '')); setProdSupplier(p.supplier || '');
    setProdUnitType(p.unit_type || 'unid'); setProdBarcode(p.barcode || '');
    setProdVisualPresentation(p.visual_presentation || 'unidad');
    setProdRequiresExpiration(!!p.requires_expiration); setIngressSearch(''); setIngressMatches([]);
  };
  const lookupIngressEAN = async (code) => {
    const clean=(code || '').trim();
    setProdBarcode(clean);

    if (!clean) {
      setIngressProductId(null);
      return;
    }

    try {
      let found = await fetchProductByBarcode(clean, branchId || 1);

      if (!found) {
        found = await fetchMasterProductByBarcode(clean);

        if (found) {
          selectIngressProduct(found);
          alert(`Producto reconocido: ${found.name}. Hoy no está disponible en ${branchName || 'esta sucursal'}; si estaba retirado, al guardar se te pedirá confirmación para reactivarlo.`);
          return;
        }
      }

      if (found) {
        selectIngressProduct(found);
        alert(`Producto reconocido: ${found.name}`);
      } else {
        setIngressProductId(null);
        alert('EAN nuevo. Completa los datos para crear el producto.');
      }
    } catch(e) {
      alert(e.message);
    }
  };
  const handleIngressSearch = async (q) => {
    setIngressSearch(q);
    if (q.trim().length < 2) return setIngressMatches([]);
    try { setIngressMatches(await searchProducts(q.trim(), branchId || 1)); } catch(e) { setIngressMatches([]); }
  };
  const resetIngressForm = () => {
    setIngressProductId(null); setProdName(''); setProdCategory(''); setProdBrand('');
    setProdCost(''); setProdPrice(''); setProdSupplier(''); setProdStock(''); setProdUnitType('unid');
    setProdBarcode(''); setProdExpirationDate(''); setProdLotNumber(''); setProdRequiresExpiration(false);
    setProdVisualPresentation('unidad');
    setIngressSearch(''); setIngressMatches([]);
  };

  // Función de máscara reutilizable para campos de fecha (DD/MM/AAAA)
  const applyDateMask = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    let formatted = digits;
    if (digits.length > 4) {
      formatted = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
    } else if (digits.length > 2) {
      formatted = digits.slice(0, 2) + '/' + digits.slice(2);
    }
    return formatted;
  };

  // Validación real DD/MM/AAAA
  const validateAndConvertDate = (dateStr) => {
    if (!dateStr || !dateStr.trim()) return { isValid: true, iso: null };
    const clean = dateStr.trim();
    const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    if (!regex.test(clean)) return { isValid: false, error: "Ingresá una fecha válida con formato DD/MM/AAAA." };

    const [, ddStr, mmStr, yyyyStr] = clean.match(regex);
    const dd = Number(ddStr);
    const mm = Number(mmStr);
    const yyyy = Number(yyyyStr);

    if (mm < 1 || mm > 12) return { isValid: false, error: "Ingresá una fecha válida con formato DD/MM/AAAA." };

    const daysInMonth = new Date(yyyy, mm, 0).getDate();
    if (dd < 1 || dd > daysInMonth) return { isValid: false, error: "Ingresá una fecha válida con formato DD/MM/AAAA." };

    const iso = `${yyyyStr}-${mmStr}-${ddStr}`;
    return { isValid: true, iso };
  };

  const loadIngressHistory = async () => {
    let dateFromIso = null;
    let dateToIso = null;

    if (ingressHistoryDateFrom.trim()) {
      const resFrom = validateAndConvertDate(ingressHistoryDateFrom);
      if (!resFrom.isValid) {
        alert(resFrom.error);
        return;
      }
      dateFromIso = resFrom.iso;
    }

    if (ingressHistoryDateTo.trim()) {
      const resTo = validateAndConvertDate(ingressHistoryDateTo);
      if (!resTo.isValid) {
        alert(resTo.error);
        return;
      }
      dateToIso = resTo.iso;
    }

    if (dateFromIso && dateToIso && dateFromIso > dateToIso) {
      alert("La fecha Desde no puede ser posterior a Hasta.");
      return;
    }

    try {
      setIngressHistoryLoading(true);
      const data = await fetchIngressHistory(branchId || 1, {
        search: ingressHistorySearch.trim() || null,
        dateFrom: dateFromIso,
        dateTo: dateToIso,
        limit: 100
      });
      setIngressHistory(data || []);
      setShowIngressHistory(true);
    } catch (e) {
      alert('Error: ' + (e.message || 'No se pudo cargar el historial'));
    } finally {
      setIngressHistoryLoading(false);
    }
  };

  const beginIngressCorrection = async (item) => {
    setEditingIngress(item);
    setEditIngressQty(String(item.quantity ?? ""));
    setEditIngressCost(String(item.unit_cost ?? item.cost_price ?? ""));
    setEditIngressSupplier(item.supplier || "");
    setEditIngressLot(item.lot_code ?? (item.lot_number || ""));
    
    // Convertir de AAAA-MM-DD a DD/MM/AAAA si existe
    let expFormatted = "";
    if (item.expiration_date) {
      const parts = item.expiration_date.split('T')[0].split('-');
      if (parts.length === 3) {
        expFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
      } else {
        expFormatted = item.expiration_date;
      }
    }
    setEditIngressExpiration(expFormatted);
    setEditIngressReason("");

    // Cargar datos actuales del producto para el Bloque A
    const prodId = item.product_id;
    if (prodId) {
      const targetProd = products.find(p => p.id === prodId);
      if (targetProd) {
        setEditProdName(targetProd.name || "");
        setEditProdBrand(targetProd.brand || "");
        setEditProdCategory(targetProd.category || "Varios");
        setEditProdBarcode(targetProd.barcode || "");
        setEditProdUnitType(targetProd.unit_type || "unid");
        setEditProdRequiresExpiration(!!targetProd.requires_expiration);
        setEditBranchPrice(String(targetProd.branch_price ?? targetProd.price_per_unit ?? ""));
      } else {
        setEditProdName(item.product_name || item.name || "");
        setEditProdBrand("");
        setEditProdCategory(item.category || "Varios");
        setEditProdBarcode(item.barcode || "");
        setEditProdUnitType(item.unit_type || "unid");
        setEditProdRequiresExpiration(false);
        setEditBranchPrice("");
      }
    }
  };

  // PUT /products/{id} reemplaza el producto completo (name y price_per_unit son obligatorios y los
  // campos omitidos vuelven a sus valores por defecto). Este helper arma el payload con TODOS los
  // datos actuales: el precio es el GLOBAL (base_price), nunca el de la sucursal, y se conservan
  // proveedor, vencimiento, política MRP, presentación e imagen. No toca stock, lotes ni costos.
  const buildFullProductUpdate = async (productId, changes) => {
    const adminList = await fetchBranchProductsAdmin(branchId || 1);
    const adminRow = (adminList || []).find(x => x.product_id === productId);
    if (!adminRow) throw new Error('No se pudieron leer los datos actuales del producto.');
    let raw = null;
    if (adminRow.barcode) {
      try {
        const master = await fetchMasterProductByBarcode(adminRow.barcode);
        if (master && master.id === productId) raw = master;
      } catch (e) { raw = null; }
    }
    let current = raw || products.find(p => p.id === productId) || null;
    if (!current) {
      // Sin EAN y no habilitado en esta sucursal: se buscan los datos en la otra sucursal.
      for (const otherBranch of [1, 2].filter(b => b !== (branchId || 1))) {
        try {
          current = (await fetchProducts(otherBranch)).find(p => p.id === productId) || null;
        } catch (e) { current = null; }
        if (current) break;
      }
    }
    if (!current) throw new Error('No se pudieron leer los datos actuales del producto (proveedor y vencimiento).');
    const basePrice = Number(adminRow.base_price);
    if (!Number.isFinite(basePrice)) throw new Error('El producto no tiene un precio base válido.');
    const definedChanges = Object.fromEntries(Object.entries(changes || {}).filter(([, v]) => v !== undefined));
    return {
      name: adminRow.name,
      category: adminRow.category,
      brand: adminRow.brand ?? null,
      barcode: adminRow.barcode ?? null,
      price_per_unit: basePrice,
      supplier: current.supplier ?? null,
      unit_type: adminRow.unit_type,
      requires_expiration: current.requires_expiration ?? null,
      replenishment_policy: current.replenishment_policy ?? null,
      visual_presentation: adminRow.visual_presentation ?? null,
      product_image_uri: adminRow.product_image_uri ?? null,
      is_active: current.is_active ?? true,
      received_by: email || 'Anonimo',
      ...definedChanges,
    };
  };

  const saveIngressCorrection = async () => {
    if (!editingIngress) return;
    if (!editIngressReason.trim()) return alert("El motivo de la corrección es obligatorio.");

    const qty = parseFloat(String(editIngressQty).replace(",", "."));
    const cost = parseFloat(String(editIngressCost).replace(",", "."));

    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(cost) || cost < 0) {
      return alert("Cantidad o costo inválido.");
    }

    let expirationIso = null;
    if (editIngressExpiration.trim()) {
      const expRes = validateAndConvertDate(editIngressExpiration);
      if (!expRes.isValid) {
        return alert("Vencimiento inválido. Formato esperado DD/MM/AAAA.");
      }
      expirationIso = expRes.iso;
    }

    const newPrice = parseFloat(String(editBranchPrice).replace(",", "."));
    if (!Number.isFinite(newPrice) || newPrice < 0) {
      return alert("Precio de venta de la sucursal inválido.");
    }

    try {
      setLoading(true);
      const productId = editingIngress.product_id;

      // 1. Actualizar datos maestros del producto si cambiaron
      if (productId) {
        await updateProduct(productId, await buildFullProductUpdate(productId, {
          name: editProdName.trim() || undefined,
          brand: editProdBrand.trim() || null,
          category: editProdCategory.trim() || undefined,
          barcode: editProdBarcode.trim() || null,
          unit_type: editProdUnitType,
          requires_expiration: editProdRequiresExpiration,
          notes: `Corrección de ingreso: ${editIngressReason.trim()}`
        }));
      }

      // 2. Actualizar precio de venta de la sucursal actual preservando is_available, is_exclusive, minimum_stock
      if (productId && branchId) {
        let currentBranchProd = null;
        try {
          const bpList = await fetchBranchProductsAdmin(branchId);
          currentBranchProd = bpList.find(x => x.product_id === productId);
        } catch (errBranch) {
          // fallback
        }

        await configureBranchProduct(branchId, productId, {
          price_per_unit: newPrice,
          is_available: currentBranchProd ? currentBranchProd.is_available : true,
          is_exclusive: currentBranchProd ? currentBranchProd.is_exclusive : false,
          minimum_stock: currentBranchProd ? currentBranchProd.minimum_stock : null
        });
      }

      // 3. Ejecutar updateIngress para corregir el ingreso (CORRECCIÓN 1: No borrar vencimiento automáticamente)
      const targetId = editingIngress.ingress_id ?? editingIngress.id;
      await updateIngress(targetId, {
        quantity: qty,
        cost_price: cost,
        supplier: editIngressSupplier.trim() || null,
        lot_number: editIngressLot.trim() || null,
        expiration_date: expirationIso,
        actor: email,
        reason: editIngressReason.trim()
      }, branchId || 1);

      // 4 a 8. Refrescar productos, historial, salir de edición y mostrar mensaje de éxito único
      alert("✅ Corrección guardada exitosamente.");
      setEditingIngress(null);
      setEditIngressReason("");
      await loadIngressHistory();
      await loadInitialData();
    } catch (e) {
      alert("Error: " + (e.message || "No se pudo completar la operación"));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveIngressV2 = async () => {
    const qty=parseFloat((prodStock || '').replace(',','.')), cost=parseFloat((prodCost || '').replace(',','.')), price=parseFloat((prodPrice || '').replace(',','.'));
    if (!prodName.trim() || !Number.isFinite(qty) || qty<=0 || !Number.isFinite(cost) || cost<0 || !Number.isFinite(price)) return alert('Completá producto, costo, PVP y cantidad.');
    if (!ingressProductId && !prodCategory.trim()) return alert('Seleccioná o escribí una categoría.');
    
    let expirationIso = null;
    if (prodRequiresExpiration) {
      if (!prodExpirationDate.trim()) return alert('Este producto requiere fecha de vencimiento.');
      const valRes = validateAndConvertDate(prodExpirationDate);
      if (!valRes.isValid) return alert('Vencimiento inválido. Usa formato DD/MM/AAAA.');
      expirationIso = valRes.iso;
    }

    try {
      setLoading(true); let productId=ingressProductId;
      if (!productId) {
        const created=await createProductMaster({
          name:prodName.trim(),
          category:prodCategory.trim(),
          brand:prodBrand||null,
          barcode:prodBarcode.trim()||null,
          price_per_unit:price,
          unit_type:prodUnitType,
          requires_expiration:prodRequiresExpiration,
          visual_presentation: prodVisualPresentation,
          replenishment_policy:'MRP',
          is_active:true
        }, branchId || 1);
        productId=created.id;
      }
      const isExistingProduct = !!ingressProductId;
      const ingressPayload = {product_id:productId,supplier:prodSupplier||null,cost_price:cost,quantity:qty,lot_number:prodLotNumber||null,expiration_date:expirationIso,received_by:email,notes:'Ingreso desde App V2'};
      try {
        await createIngress(ingressPayload, branchId || 1);
      } catch (eIngress) {
        // Producto RETIRADO de esta sucursal: nunca se reactiva sin una confirmación explícita.
        if (eIngress.code !== 'PRODUCT_RETIRED_IN_BRANCH') throw eIngress;
        setLoading(false);
        const confirmed = await confirmAction(
          'Producto retirado de la sucursal',
          `${eIngress.message}\n\nSi confirmás, se registra el ingreso y "${prodName.trim()}" vuelve a estar disponible para la venta en ${branchName}.`,
          'Reactivar e ingresar'
        );
        if (!confirmed) {
          alert('Ingreso cancelado. No se registró nada.');
          return;
        }
        setLoading(true);
        try {
          await createIngress({ ...ingressPayload, reactivate_branch_product: true }, branchId || 1);
        } catch (eReactivate) {
          if (eReactivate.code !== 'BRANCH_PRICE_REQUIRED_FOR_REACTIVATION') throw eReactivate;
          // El backend rechazó todo: no se registró el ingreso ni se reactivó el producto.
          alert(`⚠️ No se registró el ingreso.\n\n${branchPriceMissingMessage(prodName.trim())}`);
          return;
        }
      }
      // La presentación visual es solo un dato de cartelería: se actualiza después del ingreso y
      // si falla no afecta el ingreso ya registrado.
      let visualWarning = '';
      if (isExistingProduct) {
        try {
          const currentData = await buildFullProductUpdate(productId, {});
          if ((currentData.visual_presentation || null) !== prodVisualPresentation) {
            await updateProduct(productId, { ...currentData, visual_presentation: prodVisualPresentation, notes: 'Presentación visual desde Ingresos' });
          }
        } catch (eVisual) {
          visualWarning = `\n⚠️ No se pudo actualizar la presentación visual: ${eVisual.message}`;
        }
      }
      alert('Ingreso y lote registrados correctamente' + visualWarning); resetIngressForm(); await loadInitialData();
    } catch(e) { alert('Error: '+e.message); } finally { setLoading(false); }
  };

  const handleBarcodeScanned = ({ data }) => {
    setScanned(true); setShowCamera(false);
    if (cameraTarget === 'ingreso') {
      lookupIngressEAN(data);
    } else if (cameraTarget === 'preventa') {
      const found = products.find(p => p.barcode === data && p.is_active);
      if (found) { addToVendorCart(found); alert(`✅ Agregado: ${found.name}`); }
      else alert(`⚠️ EAN ${data} no encontrado.`);
    } else if (cameraTarget === 'caja') {
      const found = products.find(p => p.barcode === data && p.is_active);
      if (found) { addToCashierCart(found); alert(`✅ Agregado a Caja: ${found.name}`); }
      else alert(`⚠️ EAN ${data} no encontrado.`);
    } else if (cameraTarget === 'stock') {
      const found = products.find(p => p.barcode === data);
      if (found) { handleSelectProductForAudit(found); alert(`🎯 Seleccionado: ${found.name}`); }
      else alert(`⚠️ EAN ${data} no encontrado.`);
    }
    setTimeout(() => setScanned(false), 2000);
  };

  const handleSelectProductForAudit = async (prod) => {
    setSelectedAuditProd(prod);
    setCountedQtyInput('');
    setLatestStockAudit(null);
    try {
      const latest = await fetchLatestProductAudit(prod.id, branchId || 1);
      if (latest && latest.has_count === true) {
        setLatestStockAudit(latest);
      }
    } catch (e) {
      setLatestStockAudit(null);
    }
  };

  const handleSaveAudit = async () => {
    if (!selectedAuditProd) return;
    const cleanQty = (countedQtyInput || '').replace(',', '.');
    const val = parseFloat(cleanQty);
    if (!Number.isFinite(val) || val < 0) {
      return alert('Ingresá una cantidad contada válida (número mayor o igual a 0).');
    }
    try {
      setLoading(true);
      const res = await submitStockAudit(selectedAuditProd.id, val, email, branchId || 1);
      alert(`✅ Conteo guardado\n\nSistema: ${res.system_qty} ${selectedAuditProd.unit_type}\nContado: ${res.counted_qty} ${selectedAuditProd.unit_type}\nDiferencia: ${res.difference > 0 ? '+' : ''}${res.difference} ${selectedAuditProd.unit_type}`);
      setSelectedAuditProd(null);
      setLatestStockAudit(null);
      setCountedQtyInput('');
      setSearchQueryStock('');
      await loadInitialData();
    } catch (e) { alert('Error guardando conteo: ' + e.message); }
    finally { setLoading(false); }
  };

  const addToVendorCart = (prod) => {
    const existing = vendorCart.find(i => i.id === prod.id);
    if (existing) {
      setSearchQueryVendor('');
      return;
    }
    const initialQty = prod.unit_type === 'kg' ? 0 : 1;
    if (initialQty > 0 && initialQty > prod.stock) {
      return alert(`⚠️ Stock insuficiente (${prod.stock} ${prod.unit_type}).`);
    }
    setVendorCart([...vendorCart, { ...prod, qty: initialQty }]);
    setSearchQueryVendor('');
  };

  const updateVendorCartQty = (id, delta) => {
    setVendorCart(vendorCart.map(item => {
      if (item.id === id) {
        if (item.unit_type === 'kg') return item;
        const prod = products.find(p => p.id === id);
        const newQty = item.qty + delta;
        const maxStock = prod ? prod.stock : 999;
        if (newQty > maxStock) { alert(`⚠️ Supera el stock (${maxStock})`); return item; }
        return newQty > 0 ? { ...item, qty: newQty } : null;
      }
      return item;
    }).filter(Boolean));
  };

  const updateVendorCartDirectQty = (id, valString) => {
    const cleanVal = valString.replace(',', '.');
    const val = parseFloat(cleanVal) || 0;
    const prod = products.find(p => p.id === id);
    const maxStock = prod ? prod.stock : 999;

    setVendorCart(vendorCart.map(item => {
      if (item.id === id) {
        if (item.unit_type === 'kg' && val > maxStock) {
          alert(`⚠️ Stock insuficiente. Disponible: ${maxStock} kg`);
          return item;
        }
        return { ...item, qty: cleanVal };
      }
      return item;
    }));
  };

  const handleGeneratePreSale = async () => {
    if (vendorCart.length === 0) return alert('El carrito está vacío');
    for (const item of vendorCart) {
      const qNum = parseFloat(String(item.qty).replace(',', '.')) || 0;
      if (item.unit_type === 'kg') {
        if (qNum <= 0) {
          return alert(`Ingresá el peso de ${item.name}`);
        }
        const prod = products.find(p => p.id === item.id);
        const maxStock = prod ? prod.stock : 999;
        if (qNum > maxStock) {
          return alert(`Stock insuficiente. Disponible: ${maxStock} kg`);
        }
      } else {
        if (qNum <= 0) {
          return alert(`Ingresá la cantidad de ${item.name}`);
        }
        const prod = products.find(p => p.id === item.id);
        const maxStock = prod ? prod.stock : 999;
        if (qNum > maxStock) {
          return alert(`Stock insuficiente. Disponible: ${maxStock}`);
        }
      }
    }
    try {
      setLoading(true);
      const items = vendorCart.map(i => ({
        product_id: i.id,
        quantity: parseFloat(String(i.qty).replace(',', '.')) || 0
      }));
      const res = await createPreSale(items, branchId || 1, email);
      alert(`✅ Pre-venta #${res.presale_id} enviada a caja`);
      setVendorCart([]);
      await loadInitialData();
    } catch (e) { alert('Error en pre-venta'); }
    finally { setLoading(false); }
  };

  const handleSelectPreSale = (ps) => {
    setSelectedPreSaleId(ps.id);
    setCashierCart(ps.items.map(i => {
      const prod = products.find(p => p.id === i.product_id);
      const uType = i.unit_type || (prod ? prod.unit_type : 'unid');
      return {
        id: i.product_id,
        name: i.name,
        price_per_unit: i.price_per_unit,
        unit_type: uType,
        qty: i.qty,
        maxStock: prod ? prod.stock : 999
      };
    }));
    setCashTendered(''); setAmountMP('');
  };

  const handleCancelPreSale = async (psId) => {
    if (!canEditRecords && !isAdminLevel) return alert('⚠️ No tenés permiso para eliminar o cancelar registros.');
    try {
      setLoading(true);
      await deletePreSale(psId, branchId || 1);
      alert(`🗑 Pre-venta #${psId} cancelada`);
      if (selectedPreSaleId === psId) { setSelectedPreSaleId(null); setCashierCart([]); }
      await loadInitialData();
    } catch (e) { alert('Error al cancelar pre-venta'); }
    finally { setLoading(false); }
  };

  const updateCashierCartQty = (id, delta) => {
    setCashierCart(cashierCart.map(item => {
      if (item.id === id) {
        if (item.unit_type === 'kg') return item;
        const prod = products.find(p => p.id === id);
        const currentNum = parseFloat(item.qty) || 0;
        const newQty = currentNum + delta;
        const maxStock = prod ? prod.stock : 999;
        if (newQty > maxStock) { alert(`⚠️ Supera el stock (${maxStock})`); return item; }
        return newQty > 0 ? { ...item, qty: newQty } : null;
      }
      return item;
    }).filter(Boolean));
  };

  const updateCashierCartDirectQty = (id, valString) => {
    const cleanVal = valString.replace(',', '.');
    const val = parseFloat(cleanVal) || 0;
    const prod = products.find(p => p.id === id);
    const maxStock = prod ? prod.stock : 999;

    setCashierCart(cashierCart.map(item => {
      if (item.id === id) {
        if (item.unit_type === 'kg' && val > maxStock) {
          alert(`⚠️ Stock insuficiente. Disponible: ${maxStock} kg`);
          return item;
        }
        return { ...item, qty: cleanVal };
      }
      return item;
    }));
  };

  const addToCashierCart = (prod) => {
    const existing = cashierCart.find(i => i.id === prod.id);
    if (existing) {
      setSearchQueryCashier('');
      return;
    }
    const initialQty = prod.unit_type === 'kg' ? 0 : 1;
    if (initialQty > 0 && initialQty > prod.stock) {
      return alert(`⚠️ Stock insuficiente (${prod.stock} ${prod.unit_type}).`);
    }
    setCashierCart([...cashierCart, { ...prod, qty: initialQty, price_per_unit: prod.price_per_unit }]);
    setSearchQueryCashier('');
  };

  const getCashierTotal = () => {
    if (activePromotionSale && activePromotionSale.calculation) {
      return Number(activePromotionSale.calculation.final_total || 0).toFixed(2);
    }
    return cashierCart.reduce((acc, i) => {
      const qtyVal = parseFloat(String(i.qty).replace(',', '.')) || 0;
      return acc + (i.price_per_unit * qtyVal);
    }, 0).toFixed(2);
  };

  const getRequiredCash = () => {
    const total = parseFloat(getCashierTotal()) || 0;
    if (paymentMethod === 'Efectivo') return total;
    if (paymentMethod === 'Mixto') return Math.max(0, total - (parseFloat(amountMP) || 0));
    return 0;
  };

  const getChangeDue = () => {
    const cashRequired = getRequiredCash();
    const tendered = parseFloat(cashTendered) || 0;
    const change = tendered - cashRequired;
    return change > 0 ? change.toFixed(2) : '0.00';
  };

  const handleSelectPromotionForSale = async (promo) => {
    try {
      setPromotionLoading(true);
      const detail = await fetchPromotionDetail(promo.id, branchId || 1);
      setSelectedPromotion(detail);
      const itemsInit = (detail.items || []).map(i => ({
        product_id: i.product_id,
        name: i.product_name || i.name,
        unit_type: i.unit_type || 'unid',
        included_qty: i.included_qty,
        actual_qty: String(i.included_qty)
      }));
      setPromotionItems(itemsInit);
      setPromotionCalculation(null);
    } catch (e) {
      alert(e.message || 'Error al obtener promoción');
    } finally {
      setPromotionLoading(false);
    }
  };

  const handleCalculatePromotion = async () => {
    if (!selectedPromotion) return alert('Seleccioná una promoción');
    for (const pi of promotionItems) {
      const q = parseFloat(String(pi.actual_qty).replace(',', '.'));
      if (!Number.isFinite(q) || q <= 0) {
        return alert(`Ingresá una cantidad real válida para ${pi.name}`);
      }
    }
    try {
      setPromotionLoading(true);
      const payloadItems = promotionItems.map(i => ({
        product_id: i.product_id,
        actual_qty: parseFloat(String(i.actual_qty).replace(',', '.'))
      }));
      const calc = await calculatePromotion(selectedPromotion.id, payloadItems, branchId || 1);
      setPromotionCalculation(calc);
    } catch (e) {
      alert(e.message || 'Error al calcular promoción');
    } finally {
      setPromotionLoading(false);
    }
  };

  const handlePassPromotionToCash = () => {
    if (!selectedPromotion || !promotionCalculation) return alert('Calculá la promoción primero');
    const promoSaleData = {
      promotion: selectedPromotion,
      calculation: promotionCalculation,
      items: promotionItems
    };
    setActivePromotionSale(promoSaleData);
    setCashierCart([]);
    setSelectedPreSaleId(null);
    setCurrentTab('caja');
  };

  const handleFinalizeSale = async () => {
    if (!cashStatus.is_open) return alert('⚠️ Abrí la caja antes de procesar ventas.');
    
    if (activePromotionSale) {
      const total = parseFloat(activePromotionSale.calculation.final_total);
      let cash = 0, mp = 0;
      let cashReceivedVal = null;
      let changeAmountVal = 0.0;

      if (paymentMethod === 'Efectivo') {
        cash = total;
        const tenderedNum = parseFloat(cashTendered) || 0;
        if (tenderedNum < total) return alert(`⚠️ Dinero insuficiente`);
        cashReceivedVal = tenderedNum;
        changeAmountVal = parseFloat(getChangeDue()) || 0.0;
      } else if (paymentMethod === 'Mercado Pago') {
        mp = total;
        cashReceivedVal = null;
        changeAmountVal = 0.0;
      } else {
        mp = parseFloat(amountMP) || 0;
        if (mp > total) return alert(`⚠️ Monto MP supera el total`);
        cash = total - mp;
        if (cash > 0) {
          const tenderedNum = parseFloat(cashTendered) || 0;
          if (tenderedNum < cash) return alert(`⚠️ Dinero insuficiente en efectivo`);
          cashReceivedVal = tenderedNum;
          changeAmountVal = parseFloat(getChangeDue()) || 0.0;
        } else {
          cashReceivedVal = null;
          changeAmountVal = 0.0;
        }
      }

      const currentPromoSnapshot = activePromotionSale;
      const currentSoldBy = email;
      const currentPaymentMethod = paymentMethod;
      const currentCash = cash;
      const currentMp = mp;

      try {
        setLoading(true);
        const saleDataPayload = {
          presale_id: null,
          items: currentPromoSnapshot.calculation.items.map(i => ({
            product_id: i.product_id,
            quantity: i.actual_qty,
            unit_type: i.unit_type || 'unid'
          })),
          total_amount: total,
          amount_cash: currentCash,
          amount_mp: currentMp,
          payment_method: currentPaymentMethod,
          sold_by: currentSoldBy,
          cash_received: cashReceivedVal,
          change_amount: changeAmountVal,
          is_promotion: true,
          promotion_id: currentPromoSnapshot.promotion.id
        };

        const saleResult = await finalizeSale(saleDataPayload, branchId || 1);

        let fetchedDetail = null;
        if (saleResult && saleResult.sale_id) {
          try {
            fetchedDetail = await fetchSaleDetail(saleResult.sale_id, branchId || 1);
          } catch (eDetail) {
            fetchedDetail = null;
          }
        }

        const finalTicketObj = fetchedDetail || {
          id: saleResult?.sale_id || 'N/A',
          branch_id: branchId || 1,
          created_at: new Date().toISOString(),
          total_amount: total,
          amount_cash: currentCash,
          amount_mp: currentMp,
          payment_method: currentPaymentMethod,
          cash_received: cashReceivedVal,
          change_amount: changeAmountVal,
          sold_by: currentSoldBy,
          is_promotion: true,
          promotion_name: currentPromoSnapshot.promotion.name,
          items: currentPromoSnapshot.calculation.items.map(i => ({
            product_id: i.product_id,
            product_name: i.product_name || i.name,
            quantity: i.actual_qty,
            unit_type: i.unit_type || 'unid',
            unit_price: i.unit_price || 0,
            subtotal: i.subtotal || 0
          }))
        };

        setLastTicket(finalTicketObj);
        setActivePromotionSale(null);
        setSelectedPromotion(null);
        setPromotionItems([]);
        setPromotionCalculation(null);
        setSalesMode('normal');
        setAmountMP('');
        setCashTendered('');
        await loadInitialData();
      } catch (e) {
        alert(e.message || 'Error procesando venta promocional');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (cashierCart.length === 0) return alert('Ticket de caja vacío');
    for (const item of cashierCart) {
      const qNum = parseFloat(String(item.qty).replace(',', '.')) || 0;
      if (item.unit_type === 'kg') {
        if (qNum <= 0) {
          return alert(`Ingresá el peso de ${item.name}`);
        }
        const prod = products.find(p => p.id === item.id);
        const maxStock = prod ? prod.stock : 999;
        if (qNum > maxStock) {
          return alert(`Stock insuficiente. Disponible: ${maxStock} kg`);
        }
      } else {
        if (qNum <= 0) {
          return alert(`Ingresá la cantidad de ${item.name}`);
        }
        const prod = products.find(p => p.id === item.id);
        const maxStock = prod ? prod.stock : 999;
        if (qNum > maxStock) {
          return alert(`Stock insuficiente. Disponible: ${maxStock}`);
        }
      }
    }
    const total = parseFloat(getCashierTotal());
    let cash = 0, mp = 0;
    let cashReceivedVal = null;
    let changeAmountVal = 0.0;

    if (paymentMethod === 'Efectivo') {
      cash = total;
      const tenderedNum = parseFloat(cashTendered) || 0;
      if (tenderedNum < total) return alert(`⚠️ Dinero insuficiente`);
      cashReceivedVal = tenderedNum;
      changeAmountVal = parseFloat(getChangeDue()) || 0.0;
    } else if (paymentMethod === 'Mercado Pago') {
      mp = total;
      cashReceivedVal = null;
      changeAmountVal = 0.0;
    } else {
      mp = parseFloat(amountMP) || 0;
      if (mp > total) return alert(`⚠️ Monto MP supera el total`);
      cash = total - mp;
      if (cash > 0) {
        const tenderedNum = parseFloat(cashTendered) || 0;
        if (tenderedNum < cash) return alert(`⚠️ Dinero insuficiente en efectivo`);
        cashReceivedVal = tenderedNum;
        changeAmountVal = parseFloat(getChangeDue()) || 0.0;
      } else {
        cashReceivedVal = null;
        changeAmountVal = 0.0;
      }
    }

    const currentCartSnapshot = [...cashierCart];
    const currentSoldBy = email;
    const currentPaymentMethod = paymentMethod;
    const currentCash = cash;
    const currentMp = mp;

    try {
      setLoading(true);
      const saleResult = await finalizeSale({
        presale_id: selectedPreSaleId,
        items: cashierCart.map(i => ({
          product_id: i.id,
          quantity: parseFloat(String(i.qty).replace(',', '.')) || 0,
          unit_type: i.unit_type
        })),
        total_amount: total,
        amount_cash: currentCash,
        amount_mp: currentMp,
        payment_method: currentPaymentMethod,
        sold_by: currentSoldBy,
        cash_received: cashReceivedVal,
        change_amount: changeAmountVal
      }, branchId || 1);

      let fetchedDetail = null;
      if (saleResult && saleResult.sale_id) {
        try {
          fetchedDetail = await fetchSaleDetail(saleResult.sale_id, branchId || 1);
        } catch (eDetail) {
          fetchedDetail = null;
        }
      }

      const finalTicketObj = fetchedDetail || {
        id: saleResult?.sale_id || 'N/A',
        branch_id: branchId || 1,
        created_at: new Date().toISOString(),
        total_amount: total,
        amount_cash: currentCash,
        amount_mp: currentMp,
        payment_method: currentPaymentMethod,
        cash_received: cashReceivedVal,
        change_amount: changeAmountVal,
        sold_by: currentSoldBy,
        items: currentCartSnapshot.map(i => ({
          product_id: i.id,
          product_name: i.name,
          quantity: parseFloat(String(i.qty).replace(',', '.')) || 0,
          unit_type: i.unit_type,
          unit_price: i.price_per_unit,
          subtotal: i.price_per_unit * (parseFloat(String(i.qty).replace(',', '.')) || 0)
        }))
      };

      setLastTicket(finalTicketObj);
      setSelectedPreSaleId(null);
      setCashierCart([]);
      setAmountMP('');
      setCashTendered('');
      await loadInitialData();
    } catch (e) {
      alert('Error procesando venta');
    } finally {
      setLoading(false);
    }
  };

  const generateTicketHtml = (ticket) => {
    if (!ticket) return '';
    const bizName = ticket.branch_id === 2 ? 'Feria Damyale' : 'Fiambrería Local';
    const dateStr = ticket.created_at ? new Date(ticket.created_at).toLocaleString('es-AR') : '';
    const isPromo = ticket.is_promotion;
    const promoTitleHtml = isPromo ? `<div class="subtitle" style="color: #6f42c1;">PROMOCIÓN: ${ticket.promotion_name || 'Especial'}</div>` : '';

    const itemsHtml = (ticket.items || []).map(item => {
      const qNum = Number(item.quantity || 0);
      const isKg = item.unit_type === 'kg';
      const qFormatted = isKg ? `${qNum.toFixed(3).replace('.', ',')} kg` : `${qNum} unid`;
      const sub = Number(item.subtotal ?? ((item.unit_price || 0) * qNum));
      return `
        <div class="item-row">
          <div class="item-name">${item.product_name || item.name || 'Producto'}</div>
          <div class="item-details">
            <span>${qFormatted}${item.unit_price > 0 ? ` x ${formatMoney(item.unit_price)}` : ''}</span>
            <span style="font-weight: bold;">${formatMoney(sub)}</span>
          </div>
        </div>
      `;
    }).join('');

    let paymentHtml = `<div class="p-method">Forma de pago: ${ticket.payment_method || 'Efectivo'}</div>`;
    if (ticket.payment_method === 'Efectivo') {
      paymentHtml += `
        <div class="pay-detail">Pagado en efectivo: ${formatMoney(ticket.amount_cash || ticket.total_amount)}</div>
        ${ticket.cash_received != null ? `<div class="pay-detail">Efectivo recibido: ${formatMoney(ticket.cash_received)}</div>` : ''}
        ${ticket.change_amount != null && ticket.change_amount > 0 ? `<div class="pay-detail">Vuelto: ${formatMoney(ticket.change_amount)}</div>` : ''}
      `;
    } else if (ticket.payment_method === 'Mercado Pago') {
      paymentHtml += `<div class="pay-detail">Mercado Pago: ${formatMoney(ticket.amount_mp || ticket.total_amount)}</div>`;
    } else if (ticket.payment_method === 'Mixto') {
      paymentHtml += `
        <div class="pay-detail">Mercado Pago: ${formatMoney(ticket.amount_mp)}</div>
        <div class="pay-detail">Efectivo: ${formatMoney(ticket.amount_cash)}</div>
        ${ticket.cash_received != null ? `<div class="pay-detail">Efectivo recibido: ${formatMoney(ticket.cash_received)}</div>` : ''}
        ${ticket.change_amount != null && ticket.change_amount > 0 ? `<div class="pay-detail">Vuelto: ${formatMoney(ticket.change_amount)}</div>` : ''}
      `;
    }

    return `
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Courier New', Courier, monospace; width: 100%; margin: 0; padding: 10px; color: #000; font-size: 12px; }
            .center { text-align: center; }
            .title { font-size: 16px; font-weight: bold; margin-bottom: 4px; }
            .subtitle { font-size: 13px; font-weight: bold; margin-bottom: 8px; }
            .info { margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 8px; }
            .item-row { margin-bottom: 6px; }
            .item-name { font-weight: bold; }
            .item-details { display: flex; justify-content: space-between; font-size: 11px; }
            .total-section { border-top: 1px dashed #000; margin-top: 10px; padding-top: 6px; font-size: 14px; font-weight: bold; display: flex; justify-content: space-between; }
            .payment-section { margin-top: 8px; border-top: 1px dashed #000; padding-top: 6px; font-size: 11px; }
            .p-method { font-weight: bold; margin-bottom: 2px; }
            .pay-detail { margin-left: 6px; }
            .footer { text-align: center; margin-top: 15px; font-size: 11px; border-top: 1px dashed #000; padding-top: 8px; }
          </style>
        </head>
        <body>
          <div class="center">
            <div class="title">${bizName}</div>
            <div class="subtitle">COMPROBANTE DE VENTA</div>
            ${promoTitleHtml}
          </div>
          <div class="info">
            <div>Venta N°: ${ticket.id}</div>
            <div>Fecha: ${dateStr}</div>
            <div>Sucursal: ${bizName}</div>
            <div>Vendedor: ${ticket.sold_by || 'Mostrador'}</div>
          </div>
          <div class="items-list">
            ${itemsHtml}
          </div>
          <div class="total-section">
            <span>TOTAL:</span>
            <span>${formatMoney(ticket.total_amount)}</span>
          </div>
          <div class="payment-section">
            ${paymentHtml}
          </div>
          <div class="footer">
            <div>Comprobante de venta - No válido como factura fiscal</div>
            <div style="margin-top: 4px; font-weight: bold;">Gracias por su compra</div>
          </div>
        </body>
      </html>
    `;
  };

  const handleShareTicketPdf = async (ticketToShare) => {
    if (!ticketToShare) return;
    try {
      setLoading(true);
      const html = generateTicketHtml(ticketToShare);
      const { uri } = await Print.printToFileAsync({ html });
      const filename = `ticket_venta_${ticketToShare.id}.pdf`;
      const newUri = FileSystem.documentDirectory + filename;
      await FileSystem.moveAsync({ from: uri, to: newUri });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(newUri, { mimeType: 'application/pdf', dialogTitle: `Comprobante Venta #${ticketToShare.id}` });
      } else {
        alert('La función de compartir no está disponible en este dispositivo.');
      }
    } catch (e) {
      alert('No se pudo compartir el comprobante');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintTicketPdf = async (ticketToPrint) => {
    if (!ticketToPrint) return;
    try {
      setLoading(true);
      const html = generateTicketHtml(ticketToPrint);
      await Print.printAsync({ html });
    } catch (e) {
      alert('No se pudo imprimir el comprobante');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSalesHistory = async () => {
    setShowSalesHistoryModal(true);
    await searchSalesHistory();
  };

  const searchSalesHistory = async () => {
    try {
      setLoading(true);
      const options = {
        limit: 100
      };
      if (historyDateFrom.trim()) options.dateFrom = historyDateFrom.trim();
      if (historyDateTo.trim()) options.dateTo = historyDateTo.trim();
      if (historySearch.trim()) options.search = historySearch.trim();

      const res = await fetchSalesHistory(branchId || 1, options);
      setSalesHistoryList(res || []);
    } catch (e) {
      alert('No se pudo cargar el historial de ventas');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectHistoricalSale = async (saleSummary) => {
    try {
      setLoading(true);
      const detail = await fetchSaleDetail(saleSummary.id, branchId || 1);
      setViewingTicket(detail);
      setShowSalesHistoryModal(false);
    } catch (e) {
      alert('No se pudo cargar el comprobante');
    } finally {
      setLoading(false);
    }
  };

  const handleNewSale = () => {
    setLastTicket(null);
    setViewingTicket(null);
    setSelectedPreSaleId(null);
    setCashierCart([]);
    setActivePromotionSale(null);
  };

  const handleCashMovement = async () => {
    if (!cashStatus.is_open) return alert('Abrí la caja antes de registrar movimientos.');
    const amount=parseFloat((cashMovementAmount||'').replace(',','.'));
    if (!Number.isFinite(amount) || amount<=0 || !cashMovementConcept.trim()) return alert('Ingresá monto y concepto.');
    try {
      setLoading(true);
      await createCashMovement({movement_type:'OUT',category:cashMovementCategory,amount,concept:cashMovementConcept.trim(),actor:email,supplier:cashMovementSupplier||null,employee_email:cashMovementEmployee||null,notes:'Caja chica App V2'}, branchId || 1);
      setCashMovementAmount(''); setCashMovementConcept(''); setCashMovementSupplier(''); setCashMovementEmployee('');
      alert('Egreso registrado correctamente'); await loadInitialData();
    } catch(e) { alert('Error: '+e.message); } finally { setLoading(false); }
  };

  const selectLossProduct = async (p) => {
    setLossProductId(p.id); setLossSearch(p.name); setLossLotId(null);
    try { setLossLots(await fetchProductLots(p.id, branchId || 1)); } catch(e) { setLossLots([]); }
  };

  const handleStockLoss = async () => {
    const qty=parseFloat((lossQty||'').replace(',','.'));
    if (!lossProductId || !Number.isFinite(qty) || qty<=0) return alert('Seleccioná producto e ingresá una cantidad válida.');
    try {
      setLoading(true);
      const res=await createStockLoss({product_id:lossProductId,quantity:qty,reason:lossReason,actor:email,lot_id:lossLotId}, branchId || 1);
      alert(`Merma registrada. Pérdida económica: ${formatMoney(res.economic_loss)}`);
      setLossProductId(null); setLossSearch(''); setLossQty(''); setLossLotId(null); setLossLots([]);
      await loadInitialData();
    } catch(e) { alert('Error: '+e.message); } finally { setLoading(false); }
  };

  // Edición de DATOS del producto desde Stock (nombre, marca, categoría, EAN, presentación).
  // No edita precios: el precio de la sucursal se guarda con "Precio en sucursal" (configureBranchProduct)
  // y el precio base/global no se toca. Tampoco toca stock, lotes ni costos.
  const handleStartEditProduct = (item) => {
    if (!canEditRecords && !isAdminLevel) return alert('⚠️ No tenés permiso para editar registros.');
    setStockEditForm({
      product_id: item.product_id,
      name: item.name || '',
      brand: item.brand || '',
      category: item.category || '',
      barcode: item.barcode || '',
      visual_presentation: item.visual_presentation || null,
      base_price: item.base_price,
    });
  };

  const handleCancelEditProduct = () => setStockEditForm(null);

  const handleSaveProduct = async () => {
    const f = stockEditForm;
    if (!f) return;
    if (!f.name.trim()) return alert('El nombre es obligatorio.');
    if (!f.category.trim()) return alert('La categoría es obligatoria.');
    try {
      setLoading(true);
      await updateProduct(f.product_id, await buildFullProductUpdate(f.product_id, {
        name: f.name.trim(),
        brand: f.brand.trim() || null,
        category: f.category.trim(),
        barcode: f.barcode.trim() || null,
        visual_presentation: f.visual_presentation,
        notes: 'Edición de datos desde Stock'
      }));
      alert('✅ Datos del producto actualizados');
      setStockEditForm(null);
      await loadBranchAdminProducts();
      setProducts(await fetchProducts(branchId || 1));
    } catch (e) {
      alert('Error: ' + (e.message || 'No se pudo guardar el producto'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserName || !newUserEmail || !newUserPass) return alert('Completá los datos del usuario');
    try {
      setLoading(true);
      await createUser({ name: newUserName, email: newUserEmail, password: newUserPass });
      setNewUserName(''); setNewUserEmail(''); setNewUserPass('');
      await loadInitialData();
      alert('Empleado registrado.');
    } catch (e) { alert('Error creando usuario'); }
    finally { setLoading(false); }
  };

  const handleToggleModulePermission = async (user, permKey) => {
    try {
      setLoading(true);
      const updatedValue = !user[permKey];
      await updateUserPermissions(user.id, { [permKey]: updatedValue });
      await loadInitialData();
    } catch (e) { alert('Error actualizando permiso'); }
    finally { setLoading(false); }
  };

  const handleUserBranchChange = async (user, newBranchId) => {
    if (user.email?.toLowerCase() === 'admin@fiambreria.com') {
      return alert('El Admin Maestro trabaja con ambas sucursales.');
    }
    try {
      setLoading(true);
      await updateUserPermissions(user.id, { branch_id: newBranchId });
      await loadInitialData();
      alert(`Sucursal de ${user.name} actualizada.`);
    } catch (e) {
      alert('Error cambiando sucursal');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (user, newRole) => {
    if (user.email?.toLowerCase() === 'admin@fiambreria.com') {
      return alert('SolidSnake es el Admin Maestro y no puede ser degradado.');
    }
    try {
      setLoading(true);
      await updateUserPermissions(user.id, { role: newRole });
      await loadInitialData();
      alert(`Rol de ${user.name} cambiado a ${newRole.toUpperCase()}`);
    } catch (e) { alert('Error cambiando rol'); }
    finally { setLoading(false); }
  };

  // Funciones para gestión de promociones en admin
  const PROMO_BRANCH_IDS = [1, 2];

  const parsePromoNumber = (v) => parseFloat(String(v ?? '').replace(',', '.'));

  // Listado administrativo: une lo que devuelve el backend para ambas sucursales (incluye inactivas)
  const loadAdminPromotions = async () => {
    try {
      setPromoAdminLoading(true);
      const lists = await Promise.all(PROMO_BRANCH_IDS.map(b => fetchPromotions(b).catch(() => null)));
      const failedBranches = PROMO_BRANCH_IDS.filter((b, idx) => lists[idx] === null);
      if (failedBranches.length === PROMO_BRANCH_IDS.length) {
        throw new Error('No se pudieron obtener las promociones');
      }

      const byId = new Map();
      lists.forEach((list, idx) => {
        const bId = PROMO_BRANCH_IDS[idx];
        (list || []).forEach(p => {
          const entry = byId.get(p.id) || { ...p, branches: {} };
          entry.branches[bId] = { enabled: p.enabled === true, promo_price: p.promo_price };
          if (p.active === true) entry.active = true;
          byId.set(p.id, entry);
        });
      });

      setAdminPromotions(prev => {
        // Si el backend no lista una promoción dada de baja, se conserva visible como inactiva
        prev.forEach(p => {
          if (!byId.has(p.id) && p.active !== true) byId.set(p.id, p);
        });
        // Solo para mostrar: nunca se usa como fuente para guardar configuración de sucursales
        return Array.from(byId.values())
          .sort((a, b) => (Number(b.active === true) - Number(a.active === true)) || String(a.name || '').localeCompare(String(b.name || '')));
      });

      if (failedBranches.length > 0) {
        alert(`⚠️ No se pudieron cargar las promociones de la sucursal ${failedBranches.join(', ')}. Su configuración puede verse incompleta.`);
      }
    } catch (e) {
      alert(e.message || 'Error al obtener promociones');
    } finally {
      setPromoAdminLoading(false);
    }
  };

  const openPromotionAdmin = () => {
    setPromoAdminMode('list');
    setShowPromotionAdmin(true);
    loadAdminPromotions();
  };

  const openCreatePromotionModal = () => {
    setEditingPromotionId(null);
    setPromoFormName('');
    setPromoFormDesc('');
    setPromoFormEnabled(true);
    setPromoFormItems([]);
    setPromoFormPriceB1('');
    setPromoFormEnabledB1(true);
    setPromoFormPriceB2('');
    setPromoFormEnabledB2(true);
    setPromoItemProductId('');
    setPromoItemQty('');
    setPromoAdminMode('form');
    setShowPromotionAdmin(true);
  };

  // Resuelve de forma inequívoca la configuración de AMBAS sucursales desde fetchPromotionDetail.
  // Si alguna no puede resolverse, se cancela: nunca se completa con enabled=false / promo_price=0.
  const parseBranchEnabled = (v) => {
    if (v === true || v === 1) return true;
    if (v === false || v === 0) return false;
    return null;
  };

  const fetchPromotionFullConfig = async (promo) => {
    const results = await Promise.all(PROMO_BRANCH_IDS.map(b =>
      fetchPromotionDetail(promo.id, b).then(d => ({ ok: true, d }), e => ({ ok: false, e }))
    ));

    const branches = {};
    for (let idx = 0; idx < PROMO_BRANCH_IDS.length; idx++) {
      const bId = PROMO_BRANCH_IDS[idx];
      const r = results[idx];
      const cancelMsg = `No se pudo obtener la configuración completa de la sucursal ${bId}. Operación cancelada para no sobrescribirla.`;
      if (!r.ok || !r.d) throw new Error(`${cancelMsg}${r.e?.message ? `\n(${r.e.message})` : ''}`);
      const d = r.d;
      if (d.id != null && Number(d.id) !== Number(promo.id)) throw new Error(cancelMsg);
      if (d.branch_id != null && Number(d.branch_id) !== bId) throw new Error(cancelMsg);
      const enabled = parseBranchEnabled(d.enabled);
      const rawPrice = d.promo_price;
      const price = (rawPrice === null || rawPrice === undefined || rawPrice === '') ? NaN : Number(rawPrice);
      if (enabled === null || !Number.isFinite(price) || price < 0) throw new Error(cancelMsg);
      branches[bId] = { branch_id: bId, enabled, promo_price: price };
    }

    const base = results[0].d;
    const items = (base.items || []).map(i => {
      const prod = products.find(p => p.id === i.product_id);
      return {
        product_id: i.product_id,
        name: i.product_name || i.name || prod?.name || `Producto #${i.product_id}`,
        unit_type: i.unit_type || prod?.unit_type || 'unid',
        included_qty: i.included_qty
      };
    });

    return { base, branches, items };
  };

  const buildPromotionPayload = ({ name, description, active, items, branchCfg }) => ({
    name,
    description,
    active,
    created_by: email,
    items: items.map((i, index) => ({
      product_id: i.product_id,
      included_qty: parsePromoNumber(i.included_qty),
      unit_type: i.unit_type || 'unid',
      sort_order: index
    })),
    branch_configs: PROMO_BRANCH_IDS.map(bId => {
      const cfg = branchCfg[bId];
      const p = cfg ? cfg.promo_price : NaN;
      // Sin configuración resuelta no se envía nada (el llamador valida antes; esto es un resguardo)
      if (!cfg || typeof cfg.enabled !== 'boolean' || !Number.isFinite(p) || p < 0) {
        throw new Error(`Configuración de la sucursal ${bId} incompleta. Operación cancelada.`);
      }
      // Una sucursal deshabilitada conserva su precio: deshabilitada NO significa precio 0
      return { branch_id: bId, promo_price: p, enabled: cfg.enabled };
    })
  });

  const openEditPromotionModal = async (promo) => {
    try {
      setLoading(true);
      const { base, branches, items } = await fetchPromotionFullConfig(promo);

      setEditingPromotionId(promo.id);
      setPromoFormName(base.name || '');
      setPromoFormDesc(base.description || '');
      setPromoFormEnabled(base.active ?? promo.active ?? true);
      setPromoFormItems(items.map(i => ({ ...i, included_qty: String(i.included_qty ?? '') })));

      setPromoFormPriceB1(String(branches[1].promo_price));
      setPromoFormEnabledB1(branches[1].enabled);

      setPromoFormPriceB2(String(branches[2].promo_price));
      setPromoFormEnabledB2(branches[2].enabled);

      setPromoItemProductId('');
      setPromoItemQty('');
      setPromoAdminMode('form');
      setShowPromotionAdmin(true);
    } catch (e) {
      alert(e.message || 'Error al abrir editor de promoción');
    } finally {
      setLoading(false);
    }
  };

  const addPromoItemToDraft = () => {
    if (!promoItemProductId || !promoItemQty) return alert('Seleccioná producto y cantidad');
    const q = parseFloat(String(promoItemQty).replace(',', '.'));
    if (!Number.isFinite(q) || q <= 0) return alert('Cantidad inválida');
    const prod = products.find(p => p.id === Number(promoItemProductId));
    if (!prod) return alert('Producto no encontrado');

    if (promoFormItems.some(i => i.product_id === prod.id)) {
      return alert('El producto ya está agregado en la promoción');
    }

    setPromoFormItems([...promoFormItems, {
      product_id: prod.id,
      name: prod.name,
      unit_type: prod.unit_type || 'unid',
      included_qty: String(q)
    }]);
    setPromoItemProductId('');
    setPromoItemQty('');
  };

  const removePromoItemFromDraft = (productId) => {
    setPromoFormItems(promoFormItems.filter(i => i.product_id !== productId));
  };

  const updatePromoItemQtyInDraft = (productId, value) => {
    setPromoFormItems(promoFormItems.map(i => i.product_id === productId ? { ...i, included_qty: value } : i));
  };

  const handleSavePromotion = async () => {
    if (!promoFormName.trim()) return alert('El nombre es obligatorio');
    if (promoFormItems.length === 0) return alert('Agregá al menos un componente');

    for (const i of promoFormItems) {
      const q = parsePromoNumber(i.included_qty);
      if (!Number.isFinite(q) || q <= 0) return alert(`Cantidad incluida inválida para ${i.name}`);
    }

    if (!promoFormEnabledB1 && !promoFormEnabledB2) {
      return alert('La promoción debe estar habilitada al menos en una sucursal.');
    }

    const p1 = parsePromoNumber(promoFormPriceB1);
    const p2 = parsePromoNumber(promoFormPriceB2);

    if (promoFormEnabledB1 && (!Number.isFinite(p1) || p1 <= 0)) {
      return alert('Precio de promoción inválido para Sucursal 1 habilitada');
    }
    if (promoFormEnabledB2 && (!Number.isFinite(p2) || p2 <= 0)) {
      return alert('Precio de promoción inválido para Sucursal 2 habilitada');
    }
    if (editingPromotionId) {
      // Al editar no se completa ningún precio por defecto: la sucursal deshabilitada conserva el suyo
      if (!Number.isFinite(p1) || p1 < 0) return alert('Precio inválido para Sucursal 1 (deshabilitada). Ingresá el precio a conservar.');
      if (!Number.isFinite(p2) || p2 < 0) return alert('Precio inválido para Sucursal 2 (deshabilitada). Ingresá el precio a conservar.');
    }

    let payload;
    try {
      payload = buildPromotionPayload({
        name: promoFormName.trim(),
        description: promoFormDesc.trim() || null,
        active: promoFormEnabled,
        items: promoFormItems,
        branchCfg: {
          // Alta nueva: una sucursal deshabilitada sin precio se crea con 0 (no hay configuración previa que pisar)
          1: { promo_price: !editingPromotionId && !promoFormEnabledB1 && !Number.isFinite(p1) ? 0 : p1, enabled: promoFormEnabledB1 },
          2: { promo_price: !editingPromotionId && !promoFormEnabledB2 && !Number.isFinite(p2) ? 0 : p2, enabled: promoFormEnabledB2 }
        }
      });
    } catch (e) {
      return alert(e.message);
    }

    try {
      setLoading(true);
      if (editingPromotionId) {
        await updatePromotion(editingPromotionId, payload);
        alert('✅ Promoción actualizada');
      } else {
        await createPromotion(payload);
        alert('✅ Promoción creada');
      }
      setEditingPromotionId(null);
      setPromoAdminMode('list');
      await loadAdminPromotions();
      await loadPromotions();
    } catch (e) {
      alert(e.message || 'Error al guardar promoción');
    } finally {
      setLoading(false);
    }
  };

  const handleReactivatePromotion = async (promo) => {
    try {
      setLoading(true);
      const { base, branches, items } = await fetchPromotionFullConfig(promo);

      if (items.length === 0) {
        return alert('La promoción no tiene componentes. Editala para completarla antes de reactivarla.');
      }
      const hasValidBranch = PROMO_BRANCH_IDS.some(b => branches[b].enabled && branches[b].promo_price > 0);
      if (!hasValidBranch) {
        return alert('Para reactivarla necesita al menos una sucursal habilitada con precio promocional. Usá "Editar" para configurarla.');
      }

      const payload = buildPromotionPayload({
        name: base.name || promo.name,
        description: base.description ?? promo.description ?? null,
        active: true,
        items,
        branchCfg: branches
      });

      await updatePromotion(promo.id, payload);
      alert('✅ Promoción reactivada');
      await loadAdminPromotions();
      await loadPromotions();
    } catch (e) {
      alert(e.message || 'Error al reactivar promoción');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOrDisablePromotion = async (promo) => {
    const doDisable = async () => {
      try {
        setLoading(true);
        await deletePromotion(promo.id);
        setAdminPromotions(prev => prev.map(p => p.id === promo.id ? { ...p, active: false } : p));
        alert('Promoción dada de baja');
        await loadAdminPromotions();
        await loadPromotions();
      } catch (e) {
        alert(e.message || 'Error al dar de baja');
      } finally {
        setLoading(false);
      }
    };

    const question = `¿Dar de baja la promoción "${promo.name}"? Seguirá visible en Administración y podrá reactivarse.`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(question)) await doDisable();
      return;
    }
    Alert.alert('Dar de baja promoción', question, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Dar de baja', style: 'destructive', onPress: doDisable }
    ]);
  };

  // Helper unificado para obtener productos filtrados en el Listado de Stock y Precios
  const getFilteredStockProducts = () => {
    return products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(stockListSearch.toLowerCase()) || (p.barcode && p.barcode.includes(stockListSearch));
      const matchCat = stockListCategory === 'todas' || (p.category || 'Varios') === stockListCategory;
      
      const stk = Number(p.stock || 0);
      const minStk = Number(p.minimum_stock ?? p.min_stock ?? p.critical_stock ?? 0);
      const isCrit = minStk > 0 ? stk <= minStk : false;

      let matchFilter = true;
      if (stockListFilter === 'con_stock') matchFilter = stk > 0;
      else if (stockListFilter === 'sin_stock') matchFilter = stk <= 0;
      else if (stockListFilter === 'critico') matchFilter = isCrit;

      return matchSearch && matchCat && matchFilter;
    });
  };

  const generateStockListHtml = () => {
    const list = getFilteredStockProducts();
    if (list.length === 0) return null;

    const currentBranchLabel = `Sucursal: ${branchName}`;
    const nowStr = new Date().toLocaleString('es-AR');

    const totalProds = products.length;
    const totalConStock = products.filter(p => Number(p.stock || 0) > 0).length;
    const totalSinStock = products.filter(p => Number(p.stock || 0) <= 0).length;
    const totalCriticos = products.filter(p => {
      const stk = Number(p.stock || 0);
      const minStk = Number(p.minimum_stock ?? p.min_stock ?? p.critical_stock ?? 0);
      return minStk > 0 ? stk <= minStk : false;
    }).length;

    const rowsHtml = list.map(item => {
      const priceNum = Number(item.branch_price ?? item.price_per_unit ?? 0);
      const formattedPrice = '$' + priceNum.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `
        <tr>
          <td>${item.name || ''}</td>
          <td>${item.barcode || 'Sin EAN'}</td>
          <td>${item.category || 'Varios'}</td>
          <td>${item.stock ?? 0}</td>
          <td>${item.unit_type || 'unid'}</td>
          <td>${formattedPrice}</td>
        </tr>
      `;
    }).join('');

    return `
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Helvetica, Arial, sans-serif; color: #333; padding: 20px; }
            h1 { font-size: 20px; color: #1a1a1a; margin-bottom: 4px; }
            h2 { font-size: 14px; color: #555; margin-top: 0; margin-bottom: 15px; }
            .info { font-size: 12px; margin-bottom: 15px; color: #444; }
            .summary { background: #f8f9fa; padding: 10px; border-radius: 6px; margin-bottom: 20px; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #007bff; color: white; }
          </style>
        </head>
        <body>
          <h1>FIAMBRERÍA POS & MRP</h1>
          <h2>Listado de Stock y Precios</h2>
          <div class="info">
            <div><strong>${currentBranchLabel}</strong></div>
            <div>Fecha: ${nowStr}</div>
          </div>
          <div class="summary">
            <strong>Resumen:</strong><br/>
            Productos: ${totalProds} | Con stock: ${totalConStock} | Sin stock: ${totalSinStock} | Críticos: ${totalCriticos}
          </div>
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>EAN</th>
                <th>Categoría</th>
                <th>Stock</th>
                <th>Unidad</th>
                <th>Precio de venta</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </body>
      </html>
    `;
  };

  const handleGeneratePdfAndGetUri = async () => {
    const html = generateStockListHtml();
    if (!html) {
      alert('No hay productos para exportar');
      return null;
    }
    try {
      const { uri } = await Print.printToFileAsync({ html });
      return uri;
    } catch (e) {
      alert('No se pudo generar el PDF');
      return null;
    }
  };

  const handleExportPdf = async () => {
    try {
      setLoading(true);
      const uri = await handleGeneratePdfAndGetUri();
      if (!uri) return;

      const sanitizedBranch = (branchName || 'sucursal').replace(/\s+/g, '_');
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `stock_${sanitizedBranch}_${dateStr}.pdf`;
      const newUri = FileSystem.documentDirectory + filename;

      await FileSystem.moveAsync({ from: uri, to: newUri });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(newUri, { mimeType: 'application/pdf', dialogTitle: 'Compartir Listado de Stock' });
      } else {
        alert('La función de compartir no está disponible en este dispositivo.');
      }
    } catch (e) {
      alert('No se pudo compartir el archivo');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintPdf = async () => {
    const html = generateStockListHtml();
    if (!html) {
      alert('No hay productos para exportar');
      return;
    }
    try {
      setLoading(true);
      await Print.printAsync({ html });
    } catch (e) {
      alert('No se pudo generar el PDF');
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    const list = getFilteredStockProducts();
    if (list.length === 0) {
      alert('No hay productos para exportar');
      return;
    }

    try {
      setLoading(true);
      const excelData = list.map(item => ({
        Producto: item.name || '',
        EAN: item.barcode || 'Sin EAN',
        Categoría: item.category || 'Varios',
        Stock: Number(item.stock || 0),
        Unidad: item.unit_type || 'unid',
        'Precio de venta': Number(item.branch_price ?? item.price_per_unit ?? 0)
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock y Precios');

      const wbout = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      const sanitizedBranch = (branchName || 'sucursal').replace(/\s+/g, '_');
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `stock_${sanitizedBranch}_${dateStr}.xlsx`;
      const fileUri = FileSystem.documentDirectory + filename;

      await FileSystem.writeAsStringAsync(fileUri, wbout, { encoding: FileSystem.EncodingType.Base64 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: 'Exportar Excel de Stock' });
      } else {
        alert('La función de compartir no está disponible en este dispositivo.');
      }
    } catch (e) {
      alert('No se pudo generar el Excel');
    } finally {
      setLoading(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loginCard}>
          <Text style={styles.appTitle}>🍖 Fiambrería POS & MRP</Text>
          <TextInput style={styles.input} placeholder="Correo Electrónico" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <TextInput style={styles.input} placeholder="Contraseña" secureTextEntry value={password} onChangeText={setPassword} />
          <TouchableOpacity style={styles.buttonPrimary} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Ingresar</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (branchSelectorPending && isAdminLevel) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.branchSelectScreen}>
          <Text style={styles.branchSelectTitle}>¿Dónde querés trabajar?</Text>
          <Text style={styles.branchSelectSubtitle}>
            Elegí la sucursal. Podés cambiarla después sin cerrar sesión.
          </Text>

          <TouchableOpacity
            style={[styles.branchBigButton, styles.branchLocalButton]}
            onPress={() => selectBranch(1)}
          >
            <Text style={styles.branchBigIcon}>🍖</Text>
            <Text style={styles.branchBigTitle}>Fiambrería Local</Text>
            <Text style={styles.branchBigSubtitle}>Sucursal principal</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.branchBigButton, styles.branchFairButton]}
            onPress={() => selectBranch(2)}
          >
            <Text style={styles.branchBigIcon}>🎪</Text>
            <Text style={styles.branchBigTitle}>Feria Damyale</Text>
            <Text style={styles.branchBigSubtitle}>Puesto de feria</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleLogout} style={{marginTop:20}}>
            <Text style={{color:'#dc3545',fontWeight:'bold'}}>🚪 Cerrar sesión</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAccountActive && !isAdminLevel) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loginCard}>
          <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#dc3545', textAlign: 'center', marginBottom: 10 }}>🔒 Jornada No Habilitada</Text>
          <Text style={{ textAlign: 'center', color: '#555', marginBottom: 20 }}>
            Tu usuario aún no ha sido habilitado para iniciar el turno por el Administrador/Dueño.
          </Text>
          <TouchableOpacity style={styles.buttonDanger} onPress={handleLogout}>
            <Text style={styles.buttonText}>Cerrar Sesión</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const activeProducts = products.filter(p => p.is_active);
  const filteredProductsVendor = searchQueryVendor.trim() === '' ? [] : activeProducts.filter(p => p.name.toLowerCase().includes(searchQueryVendor.toLowerCase()));
  const filteredProductsCashier = searchQueryCashier.trim() === '' ? [] : activeProducts.filter(p => p.name.toLowerCase().includes(searchQueryCashier.toLowerCase()));
  const filteredProductsStock = searchQueryStock.trim() === '' ? [] : products.filter(p => p.name.toLowerCase().includes(searchQueryStock.toLowerCase()) || (p.barcode && p.barcode.includes(searchQueryStock)));
return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>🍖 Fiambrería POS & MRP</Text>
          <Text style={{ color: '#ccc', fontSize: 11 }}>Usuario: {email} ({userRole.toUpperCase()})</Text>
          <Text style={styles.branchHeader}>📍 {branchName}</Text>
        </View>
        <View style={styles.headerRight}>
          {isAdminLevel && (
            <TouchableOpacity onPress={changeBranch} style={styles.changeBranchBtn}>
              <Text style={styles.changeBranchText}>⇄ Cambiar sucursal</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={{ color: '#dc3545', fontWeight: 'bold', fontSize: 12 }}>🚪 Salir</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.body}>
        {/* VISTA DE TICKET RECIÉN VENDIDO O TICKET SELECCIONADO */}
        {(lastTicket || viewingTicket) && (() => {
          const ticketToShow = viewingTicket || lastTicket;
          const isHistorical = !!viewingTicket;
          return (
            <ScrollView contentContainerStyle={styles.scrollPadding}>
              <View style={[styles.card, { borderWidth: 2, borderColor: '#28a745' }]}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#28a745', textAlign: 'center', marginBottom: 4 }}>
                  {isHistorical ? `🧾 Comprobante Histórico #${ticketToShow.id}` : `✅ Venta #${ticketToShow.id} realizada`}
                </Text>
                {ticketToShow.is_promotion && (
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#6f42c1', textAlign: 'center', marginBottom: 4 }}>
                    🎁 PROMOCIÓN: {ticketToShow.promotion_name || 'Especial'}
                  </Text>
                )}
                <Text style={{ fontSize: 11, color: '#666', textAlign: 'center', marginBottom: 12 }}>
                  {ticketToShow.created_at ? new Date(ticketToShow.created_at).toLocaleString('es-AR') : ''} · {ticketToShow.branch_id === 2 ? 'Feria Damyale' : 'Fiambrería Local'}
                </Text>

                <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#eee', paddingVertical: 10, marginBottom: 12 }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 6 }}>Detalle de productos:</Text>
                  {(ticketToShow.items || []).map((item, idx) => {
                    const qNum = Number(item.quantity || 0);
                    const isKg = item.unit_type === 'kg';
                    const qFormatted = isKg ? `${qNum.toFixed(3).replace('.', ',')} kg` : `${qNum} unid`;
                    const sub = Number(item.subtotal ?? ((item.unit_price || 0) * qNum));
                    return (
                      <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={{ fontWeight: 'bold', fontSize: 12 }}>{item.product_name || item.name || 'Producto'}</Text>
                          <Text style={{ fontSize: 11, color: '#555' }}>{qFormatted}{item.unit_price > 0 ? ` x ${formatMoney(item.unit_price)}` : ''}</Text>
                        </View>
                        <Text style={{ fontWeight: 'bold', fontSize: 12 }}>{formatMoney(sub)}</Text>
                      </View>
                    );
                  })}
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ fontWeight: 'bold', fontSize: 15 }}>TOTAL:</Text>
                  <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#28a745' }}>{formatMoney(ticketToShow.total_amount)}</Text>
                </View>

                <View style={{ backgroundColor: '#f8f9fa', padding: 8, borderRadius: 6, marginBottom: 15 }}>
                  <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#333' }}>Forma de pago: {ticketToShow.payment_method || 'Efectivo'}</Text>
                  {ticketToShow.payment_method === 'Efectivo' && (
                    <>
                      {ticketToShow.cash_received != null && <Text style={{ fontSize: 11, color: '#555' }}>Efectivo recibido: {formatMoney(ticketToShow.cash_received)}</Text>}
                      {ticketToShow.change_amount != null && ticketToShow.change_amount > 0 && <Text style={{ fontSize: 11, color: '#28a745' }}>Vuelto: {formatMoney(ticketToShow.change_amount)}</Text>}
                    </>
                  )}
                  {ticketToShow.payment_method === 'Mixto' && (
                    <>
                      <Text style={{ fontSize: 11, color: '#555' }}>Mercado Pago: {formatMoney(ticketToShow.amount_mp)}</Text>
                      <Text style={{ fontSize: 11, color: '#555' }}>Efectivo: {formatMoney(ticketToShow.amount_cash)}</Text>
                      {ticketToShow.cash_received != null && <Text style={{ fontSize: 11, color: '#555' }}>Efectivo recibido: {formatMoney(ticketToShow.cash_received)}</Text>}
                      {ticketToShow.change_amount != null && ticketToShow.change_amount > 0 && <Text style={{ fontSize: 11, color: '#28a745' }}>Vuelto: {formatMoney(ticketToShow.change_amount)}</Text>}
                    </>
                  )}
                  <Text style={{ fontSize: 11, color: '#555' }}>Vendedor: {ticketToShow.sold_by || 'Mostrador'}</Text>
                </View>

                <TouchableOpacity style={[styles.buttonPrimary, { backgroundColor: '#007bff', marginBottom: 8 }]} onPress={() => handleShareTicketPdf(ticketToShow)}>
                  <Text style={styles.buttonText}>📤 Compartir / Descargar PDF</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.buttonPrimary, { backgroundColor: '#6f42c1', marginBottom: 8 }]} onPress={() => handlePrintTicketPdf(ticketToShow)}>
                  <Text style={styles.buttonText}>🖨️ Imprimir ticket</Text>
                </TouchableOpacity>

                {isHistorical ? (
                  <TouchableOpacity style={[styles.buttonPrimary, { backgroundColor: '#6c757d' }]} onPress={() => setViewingTicket(null)}>
                    <Text style={styles.buttonText}>← Volver</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.buttonSuccess, { backgroundColor: '#28a745' }]} onPress={handleNewSale}>
                    <Text style={styles.buttonText}>➕ Nueva venta</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          );
        })()}

        {/* PRE-VENTA / VENTAS & PROMOCIONES */}
        {currentTab === 'preventa' && !lastTicket && !viewingTicket && (canPreventa || isAdminLevel) && (
          <ScrollView contentContainerStyle={styles.scrollPadding} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>🛒 Pre-venta (Mostrador)</Text>

            {/* Alternador de Modo de Venta */}
            <View style={{ flexDirection: 'row', marginBottom: 15, backgroundColor: '#e9ecef', borderRadius: 8, padding: 3 }}>
              <TouchableOpacity 
                style={[{ flex: 1, padding: 10, alignItems: 'center', borderRadius: 6 }, salesMode === 'normal' && { backgroundColor: '#007bff' }]}
                onPress={() => { setSalesMode('normal'); setSelectedPromotion(null); setPromotionCalculation(null); }}
              >
                <Text style={{ fontWeight: 'bold', color: salesMode === 'normal' ? '#fff' : '#333' }}>🛒 Venta normal</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[{ flex: 1, padding: 10, alignItems: 'center', borderRadius: 6 }, salesMode === 'promotions' && { backgroundColor: '#6f42c1' }]}
                onPress={() => { setSalesMode('promotions'); setSelectedPromotion(null); setPromotionCalculation(null); loadPromotions(); }}
              >
                <Text style={{ fontWeight: 'bold', color: salesMode === 'promotions' ? '#fff' : '#333' }}>🎁 Promociones</Text>
              </TouchableOpacity>
            </View>

            {isAdminLevel && (
              <TouchableOpacity style={{ backgroundColor: '#6f42c1', padding: 10, borderRadius: 8, alignItems: 'center', marginBottom: 15 }} onPress={openPromotionAdmin}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>⚙️ Administrar promociones</Text>
              </TouchableOpacity>
            )}

            {salesMode === 'normal' ? (
              <>
                <TouchableOpacity style={styles.buttonCamera} onPress={() => toggleCamera('preventa')}>
                  <Text style={styles.buttonText}>{showCamera && cameraTarget === 'preventa' ? '📷 Cerrar Escáner' : '📷 Escanear EAN con Cámara'}</Text>
                </TouchableOpacity>

                {showCamera && cameraTarget === 'preventa' && permission?.granted && (
                  <View style={styles.cameraContainer}>
                    <CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={scanned ? undefined : handleBarcodeScanned} />
                  </View>
                )}

                <Text style={styles.subSectionTitle}>🔍 Buscar Producto:</Text>
                <TextInput style={styles.searchInput} placeholder="Buscar por nombre..." value={searchQueryVendor} onChangeText={setSearchQueryVendor} />

                {searchQueryVendor.trim() !== '' && (
                  <View style={styles.dropdownContainer}>
                    {filteredProductsVendor.length === 0 ? (
                      <Text style={{ padding: 10, color: '#888' }}>Sin coincidencias.</Text>
                    ) : (
                      filteredProductsVendor.map(p => (
                        <TouchableOpacity key={p.id} style={styles.dropdownItem} onPress={() => addToVendorCart(p)}>
                          <Text style={{ fontWeight: 'bold' }}>{p.name}</Text>
                          <Text style={{ color: '#28a745', fontSize: 12 }}>{formatMoney(p.price_per_unit)} / {p.unit_type} | Stock: {p.stock} {p.unit_type}</Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                )}

                <Text style={styles.subSectionTitle}>Comanda de Pre-venta:</Text>
                {vendorCart.length === 0 ? <Text style={styles.emptyText}>Sin productos seleccionados</Text> : (
                  vendorCart.map(i => {
                    const qtyVal = parseFloat(String(i.qty).replace(',', '.')) || 0;
                    return (
                      <View key={i.id} style={styles.cartRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: 'bold' }}>{i.name}</Text>
                          <Text style={{ fontSize: 11, color: '#666' }}>{formatMoney(i.price_per_unit)} / {i.unit_type}</Text>
                        </View>

                        {i.unit_type === 'kg' ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ alignItems: 'flex-end', marginRight: 6 }}>
                              <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#555' }}>Peso (kg)</Text>
                              <TextInput style={styles.inputSmall} keyboardType="numeric" value={String(i.qty)} onChangeText={(val) => updateVendorCartDirectQty(i.id, val)} />
                            </View>
                            <Text style={{ fontSize: 11, marginRight: 8, color: '#444' }}>kg</Text>
                          </View>
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <TouchableOpacity style={styles.qtyBtn} onPress={() => updateVendorCartQty(i.id, -1)}>
                              <Text style={{ color: '#fff', fontWeight: 'bold' }}>-</Text>
                            </TouchableOpacity>

                            <TextInput style={styles.inputSmall} keyboardType="numeric" value={String(i.qty)} onChangeText={(val) => updateVendorCartDirectQty(i.id, val)} />

                            <TouchableOpacity style={styles.qtyBtn} onPress={() => updateVendorCartQty(i.id, 1)}>
                              <Text style={{ color: '#fff', fontWeight: 'bold' }}>+</Text>
                            </TouchableOpacity>

                            <Text style={{ fontSize: 11, marginLeft: 4, marginRight: 8, color: '#444' }}>{i.unit_type}</Text>
                          </View>
                        )}

                        <Text style={{ fontWeight: 'bold' }}>{formatMoney(i.price_per_unit * qtyVal)}</Text>
                      </View>
                    );
                  })
                )}

                <TouchableOpacity style={styles.buttonPrimary} onPress={handleGeneratePreSale} disabled={loading}>
                  <Text style={styles.buttonText}>📝 Enviar Pre-venta a Caja</Text>
                </TouchableOpacity>
              </>
            ) : (
              /* MODO PROMOCIONES */
              <View>
                {!selectedPromotion ? (
                  <>
                    <Text style={styles.subSectionTitle}>🎁 Promociones activas ({branchName})</Text>
                    {promotions.filter(p => p.active === true && p.enabled === true).length === 0 ? (
                      <Text style={styles.emptyText}>No hay promociones activas en esta sucursal.</Text>
                    ) : (
                      promotions.filter(p => p.active === true && p.enabled === true).map(promo => {
                        const promoPrice = promo.promo_price ?? 0;
                        return (
                          <TouchableOpacity key={promo.id} style={[styles.card, { borderWidth: 1, borderColor: '#6f42c1' }]} onPress={() => handleSelectPromotionForSale(promo)}>
                            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#6f42c1' }}>🎁 {promo.name}</Text>
                            {promo.description ? <Text style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{promo.description}</Text> : null}
                            <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#28a745', marginTop: 6 }}>Precio base: {formatMoney(promoPrice)}</Text>
                            <Text style={{ fontSize: 12, fontWeight: 'bold', marginTop: 8, color: '#333' }}>Componentes:</Text>
                            {(promo.items || []).map((ci, idx) => {
                              const qtyFormatted = formatQuantityVisual(ci.included_qty, ci.unit_type);
                              return (
                                <Text key={idx} style={{ fontSize: 11, color: '#555', marginLeft: 6 }}>• {qtyFormatted} de {ci.product_name || ci.name || `Producto #${ci.product_id}`}</Text>
                              );
                            })}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </>
                ) : (
                  <View style={styles.card}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#6f42c1' }}>🎁 {selectedPromotion.name}</Text>
                      <TouchableOpacity onPress={() => { setSelectedPromotion(null); setPromotionCalculation(null); }}>
                        <Text style={{ color: '#007bff', fontWeight: 'bold' }}>← Volver</Text>
                      </TouchableOpacity>
                    </View>
                    {selectedPromotion.description ? <Text style={{ fontSize: 12, color: '#555', marginBottom: 10 }}>{selectedPromotion.description}</Text> : null}

                    <Text style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 8 }}>Componentes y cantidad REAL entregada:</Text>
                    {promotionItems.map((pi, idx) => {
                      const incFormatted = formatQuantityVisual(pi.included_qty, pi.unit_type);
                      return (
                        <View key={idx} style={{ backgroundColor: '#f8f9fa', padding: 10, borderRadius: 8, marginBottom: 8 }}>
                          <Text style={{ fontWeight: 'bold', fontSize: 13 }}>{pi.name}</Text>
                          <Text style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Incluye: {incFormatted}</Text>
                          <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#444' }}>Peso real ({pi.unit_type === 'kg' ? 'kg' : 'unid'}):</Text>
                          <TextInput 
                            style={styles.inputHighlight} 
                            keyboardType="numeric" 
                            value={String(pi.actual_qty)} 
                            onChangeText={(val) => {
                              const updated = [...promotionItems];
                              updated[idx].actual_qty = val;
                              setPromotionItems(updated);
                            }} 
                          />
                        </View>
                      );
                    })}

                    <TouchableOpacity style={[styles.buttonPrimary, { backgroundColor: '#6f42c1' }]} onPress={handleCalculatePromotion} disabled={promotionLoading}>
                      <Text style={styles.buttonText}>{promotionLoading ? 'Calculando...' : '🧮 Calcular promoción'}</Text>
                    </TouchableOpacity>

                    {promotionCalculation && (
                      <View style={{ marginTop: 15, padding: 12, backgroundColor: '#e8f4f8', borderRadius: 8, borderWidth: 1, borderColor: '#b8daff' }}>
                        {(() => {
                          // regular_actual_total es SOLO informativo; el importe a cobrar es final_total
                          const hasRegular = promotionCalculation.regular_actual_total != null;
                          const regularTotal = Number(promotionCalculation.regular_actual_total || 0);
                          const finalTotal = Number(promotionCalculation.final_total || 0);
                          const savings = Math.max(0, regularTotal - finalTotal);
                          return (
                            <>
                              <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#333' }}>Precio base promo: {formatMoney(promotionCalculation.promo_price)}</Text>
                              {hasRegular && <Text style={{ fontSize: 13, color: '#555' }}>Valor normal de lo entregado: {formatMoney(regularTotal)}</Text>}
                              <Text style={{ fontSize: 14, fontWeight: 'bold', color: promotionCalculation.total_extra > 0 ? '#dc3545' : '#333' }}>Excedentes: {formatMoney(promotionCalculation.total_extra)}</Text>
                              {hasRegular && <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#17a2b8' }}>Ahorro del cliente: {formatMoney(savings)}</Text>}
                              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#28a745', marginTop: 4 }}>TOTAL A COBRAR: {formatMoney(finalTotal)}</Text>
                            </>
                          );
                        })()}

                        {(promotionCalculation.items || []).map((itemRes, rIdx) => {
                          const originalItem = promotionItems.find(p => p.product_id === itemRes.product_id);
                          const includedQty = Number(originalItem?.included_qty || 0);
                          const actualQty = Number(itemRes.actual_qty || 0);
                          const extraQty = Math.max(0, actualQty - includedQty);
                          const incLabel = formatQuantityVisual(includedQty, itemRes.unit_type);
                          const actLabel = formatQuantityVisual(actualQty, itemRes.unit_type);

                          return (
                            <View key={rIdx} style={{ marginTop: 6, borderTopWidth: 1, borderTopColor: '#bee5eb', paddingTop: 6 }}>
                              <Text style={{ fontSize: 12, fontWeight: 'bold' }}>{itemRes.product_name || itemRes.name}:</Text>
                              <Text style={{ fontSize: 11, color: '#555' }}>
                                Incluido {incLabel} — Real {actLabel}{extraQty > 0 ? ` — Excedente ${formatQuantityVisual(extraQty, itemRes.unit_type)}` : ''}
                              </Text>
                              {itemRes.regular_actual_value != null && (
                                <Text style={{ fontSize: 11, color: '#555' }}>Valor normal entregado: {formatMoney(itemRes.regular_actual_value)}</Text>
                              )}
                              {extraQty > 0 && (
                                <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#dc3545' }}>+{formatMoney(itemRes.extra_amount)}</Text>
                              )}
                            </View>
                          );
                        })}

                        <TouchableOpacity style={[styles.buttonSuccess, { marginTop: 12 }]} onPress={handlePassPromotionToCash}>
                          <Text style={styles.buttonText}>💳 Pasar promoción a Caja</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        )}

        {/* 🏷️ CARTELERÍA V2 (PosterMaker.js) */}
        {currentTab === 'carteleria' && (canCarteleria || isAdminLevel) && (
          <PosterMaker
            branchId={branchId}
            branchName={branchName}
            products={products}
            promotions={promotions}
            onRefreshPromotions={loadPromotions}
            formatMoney={formatMoney}
          />
        )}

        {/* CAJA */}
        {currentTab === 'caja' && !lastTicket && !viewingTicket && (canCaja || isAdminLevel) && (
          <ScrollView contentContainerStyle={styles.scrollPadding} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={styles.sectionTitle}>💳 Caja y Cobro</Text>
              <TouchableOpacity style={{ backgroundColor: '#6c757d', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }} onPress={handleOpenSalesHistory}>
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>🧾 Historial / Reimprimir tickets</Text>
              </TouchableOpacity>
            </View>

            {!cashStatus.is_open ? (
              <View style={styles.card}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#dc3545', textAlign: 'center', marginBottom: 10 }}>🔴 Caja Cerrada</Text>
                <TextInput style={styles.inputHighlight} placeholder="Monto Inicial ($)" keyboardType="numeric" value={initialCashInput} onChangeText={setInitialCashInput} />
                <TouchableOpacity style={styles.buttonSuccess} onPress={handleOpenCash} disabled={loading}>
                  <Text style={styles.buttonText}>🔓 Abrir Caja</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.cashOpenHeaderCard}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ fontWeight: 'bold', color: '#155724' }}>🟢 CAJA ABIERTA</Text>
                    <Text style={{ fontSize: 11, color: '#155724' }}>{cashStatus.opened_by} ({cashStatus.opened_at}) | Fondo: {formatMoney(cashStatus.initial_amount)}</Text>
                  </View>
                  <TouchableOpacity style={styles.arqueoBtnStyle} onPress={() => setShowCloseModal(true)}>
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11, textAlign: 'center' }}>🔒 Arqueo / Cierre</Text>
                  </TouchableOpacity>
                </View>

                {showCloseModal && (
                  <View style={{ backgroundColor: '#fff3cd', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#ffeeba', marginBottom: 15 }}>
                    <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#856404', marginBottom: 6 }}>🔒 Arqueo de Caja a Ciegas</Text>
                    <TextInput style={styles.inputHighlight} placeholder="Monto total contado ($)" keyboardType="numeric" value={closeCashInput} onChangeText={setCloseCashInput} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                      <TouchableOpacity style={[styles.buttonPrimary, { flex: 0.48, backgroundColor: '#6c757d' }]} onPress={() => { setShowCloseModal(false); setCloseAttempt(1); }}>
                        <Text style={styles.buttonText}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.buttonDanger, { flex: 0.48 }]} onPress={handleCloseCash} disabled={loading}>
                        <Text style={styles.buttonText}>Confirmar Cierre</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <View style={styles.card}>
                  <Text style={styles.subSectionTitle}>💸 Caja chica / Egresos</Text>
                  <View style={styles.wrapButtonsRow}>
                    {[
                      ['PROVEEDOR', 'Proveedor'],
                      ['SERVICIOS', 'Servicios'],
                      ['EMPLEADO', 'Empleado'],
                      ['COMPRA_MENOR', 'Compra menor'],
                      ['OPERATIVO', 'Operativo'],
                      ['OTRO', 'Otro'],
                      ['RETIRO_DUENO', 'Retiro dueño']
                    ].map(([c, label]) => (
                      <TouchableOpacity 
                        key={c} 
                        style={[styles.wrapBtnItem, cashMovementCategory === c && { backgroundColor: '#dc3545', borderColor: '#bd2130' }]} 
                        onPress={() => setCashMovementCategory(c)}
                      >
                        <Text style={{ fontSize: 11, color: cashMovementCategory === c ? '#fff' : '#333', fontWeight: 'bold', textAlign: 'center' }}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput style={styles.input} placeholder="Concepto / detalle" value={cashMovementConcept} onChangeText={setCashMovementConcept} />
                  <TextInput style={styles.input} placeholder="Monto ($)" keyboardType="decimal-pad" value={cashMovementAmount} onChangeText={setCashMovementAmount} />
                  {cashMovementCategory==='PROVEEDOR' && <TextInput style={styles.input} placeholder="Proveedor" value={cashMovementSupplier} onChangeText={setCashMovementSupplier} />}
                  {cashMovementCategory==='EMPLEADO' && <TextInput style={styles.input} placeholder="Email del empleado" autoCapitalize="none" value={cashMovementEmployee} onChangeText={setCashMovementEmployee} />}
                  <TouchableOpacity style={styles.buttonDanger} onPress={handleCashMovement} disabled={loading}><Text style={styles.buttonText}>Registrar egreso</Text></TouchableOpacity>
                  {cashMovements.slice(0,5).map(m=><Text key={m.id} style={{fontSize:11,color:'#555',marginTop:5}}>{m.category}: {m.concept} — {formatMoney(m.amount)}</Text>)}
                </View>

                <View style={styles.card}>
                  <Text style={styles.subSectionTitle}>⚠️ Mermas y pérdidas</Text>
                  <TextInput style={styles.searchInput} placeholder="Buscar producto..." value={lossSearch} onChangeText={(q)=>{setLossSearch(q);setLossProductId(null);}} />
                  {!lossProductId && lossSearch.trim().length>1 && <View style={styles.dropdownContainer}>{activeProducts.filter(p=>p.name.toLowerCase().includes(lossSearch.toLowerCase())).slice(0,8).map(p=><TouchableOpacity key={p.id} style={styles.dropdownItem} onPress={()=>selectLossProduct(p)}><Text style={{fontWeight:'bold'}}>{p.name}</Text><Text style={{fontSize:11}}>Stock: {p.stock} {p.unit_type}</Text></TouchableOpacity>)}</View>}
                  {lossProductId && <Text style={{fontSize:12,color:'#28a745',marginBottom:8}}>✓ Producto seleccionado</Text>}
                  <TextInput style={styles.input} placeholder="Cantidad perdida (admite 0,100)" keyboardType="decimal-pad" value={lossQty} onChangeText={setLossQty} />
                  <View style={styles.wrapButtonsRow}>
                    {[
                      ['MERMA_CORTE', 'Merma corte'],
                      ['VENCIMIENTO', 'Vencimiento'],
                      ['ROTURA', 'Rotura'],
                      ['DIFERENCIA_INVENTARIO', 'Diferencia inv.'],
                      ['CONSUMO_INTERNO', 'Consumo int.'],
                      ['OTRO', 'Otro']
                    ].map(([r, label]) => (
                      <TouchableOpacity 
                        key={r} 
                        style={[styles.wrapBtnItem, lossReason === r && { backgroundColor: '#ffc107', borderColor: '#d39e00' }]} 
                        onPress={() => setLossReason(r)}
                      >
                        <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#333', textAlign: 'center' }}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {lossLots.length>0 && <><Text style={{fontSize:11,fontWeight:'bold'}}>Lote específico (opcional; vacío = FEFO)</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:8}}><TouchableOpacity style={[styles.typeBtn,{marginRight:6},!lossLotId&&{backgroundColor:'#007bff'}]} onPress={()=>setLossLotId(null)}><Text style={{color:!lossLotId?'#fff':'#333'}}>FEFO</Text></TouchableOpacity>{lossLots.map(l=><TouchableOpacity key={l.id} style={[styles.typeBtn,{marginRight:6},lossLotId===l.id&&{backgroundColor:'#007bff'}]} onPress={()=>setLossLotId(l.id)}><Text style={{color:lossLotId===l.id?'#fff':'#333'}}>{l.lot_number} ({l.current_qty})</Text></TouchableOpacity>)}</ScrollView></>}
                  <TouchableOpacity style={styles.buttonDanger} onPress={handleStockLoss} disabled={loading}><Text style={styles.buttonText}>Registrar merma / pérdida</Text></TouchableOpacity>
                </View>

                {activePromotionSale ? (
                  <View style={[styles.card, { borderWidth: 2, borderColor: '#6f42c1', backgroundColor: '#fdfcfe' }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#6f42c1' }}>🎁 PROMOCIÓN: {activePromotionSale.promotion.name}</Text>
                      <TouchableOpacity onPress={() => setActivePromotionSale(null)}>
                        <Text style={{ color: '#dc3545', fontWeight: 'bold' }}>✕ Cancelar</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>Componentes reales calculados por backend:</Text>
                    {(activePromotionSale.calculation.items || []).map((ci, cIdx) => {
                      const qFormatted = formatQuantityVisual(ci.actual_qty, ci.unit_type);
                      return (
                        <View key={cIdx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                          <Text style={{ fontSize: 12 }}>• {ci.product_name || ci.name}</Text>
                          <Text style={{ fontSize: 12, fontWeight: 'bold' }}>{qFormatted}</Text>
                        </View>
                      );
                    })}
                    <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 6 }}>
                      <Text style={{ fontSize: 12 }}>Precio base: {formatMoney(activePromotionSale.calculation.promo_price)}</Text>
                      <Text style={{ fontSize: 12 }}>Excedentes: {formatMoney(activePromotionSale.calculation.total_extra)}</Text>
                      <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#28a745', marginTop: 2 }}>TOTAL: {formatMoney(activePromotionSale.calculation.final_total)}</Text>
                    </View>
                  </View>
                ) : (
                  <>
                    <Text style={styles.subSectionTitle}>Pre-ventas Pendientes:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }}>
                      {pendingPreSales.length === 0 ? <Text style={styles.emptyText}>Sin pre-ventas pendientes.</Text> : (
                        pendingPreSales.map(ps => (
                          <View key={ps.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <TouchableOpacity style={[styles.preSaleBadge, selectedPreSaleId === ps.id && styles.preSaleBadgeActive]} onPress={() => handleSelectPreSale(ps)}>
                              <Text style={{ fontWeight: 'bold', color: selectedPreSaleId === ps.id ? '#fff' : '#007bff' }}>
                                Ticket #{ps.id} ({ps.created_at})
                              </Text>
                              <Text style={{ color: selectedPreSaleId === ps.id ? '#fff' : '#333' }}>{formatMoney(ps.total)}</Text>
                            </TouchableOpacity>

                            {(canEditRecords || isAdminLevel) && (
                              <TouchableOpacity style={{ backgroundColor: '#dc3545', padding: 8, borderRadius: 6, marginRight: 12 }} onPress={() => handleCancelPreSale(ps.id)}>
                                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>❌ Borrar</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        ))
                      )}
                    </ScrollView>

                    <TouchableOpacity style={styles.buttonCamera} onPress={() => toggleCamera('caja')}>
                      <Text style={styles.buttonText}>{showCamera && cameraTarget === 'caja' ? '📷 Cerrar Escáner' : '📷 Escanear Producto EAN'}</Text>
                    </TouchableOpacity>

                    {showCamera && cameraTarget === 'caja' && permission?.granted && (
                      <View style={styles.cameraContainer}>
                        <CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={scanned ? undefined : handleBarcodeScanned} />
                      </View>
                    )}

                    <Text style={styles.subSectionTitle}>🔍 Buscar Producto Adicional:</Text>
                    <TextInput style={styles.searchInput} placeholder="Buscar..." value={searchQueryCashier} onChangeText={setSearchQueryCashier} />

                    {searchQueryCashier.trim() !== '' && (
                      <View style={styles.dropdownContainer}>
                        {filteredProductsCashier.map(p => (
                          <TouchableOpacity key={p.id} style={styles.dropdownItem} onPress={() => addToCashierCart(p)}>
                            <Text style={{ fontWeight: 'bold' }}>{p.name}</Text>
                            <Text style={{ color: '#28a745', fontSize: 12 }}>{formatMoney(p.price_per_unit)} / {p.unit_type} | Stock: {p.stock} {p.unit_type}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <Text style={styles.subSectionTitle}>Edición de Ticket:</Text>
                    {cashierCart.map(i => {
                      const qtyVal = parseFloat(String(i.qty).replace(',', '.')) || 0;
                      return (
                        <View key={i.id} style={styles.cartRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: 'bold' }}>{i.name}</Text>
                            <Text style={{ fontSize: 11, color: '#666' }}>{formatMoney(i.price_per_unit)} / {i.unit_type}</Text>
                          </View>

                          {i.unit_type === 'kg' ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <View style={{ alignItems: 'flex-end', marginRight: 6 }}>
                                <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#555' }}>Peso (kg)</Text>
                                <TextInput style={styles.inputSmall} keyboardType="numeric" value={String(i.qty)} onChangeText={(val) => updateCashierCartDirectQty(i.id, val)} />
                              </View>
                              <Text style={{ fontSize: 11, marginRight: 8 }}>kg</Text>
                            </View>
                          ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <TouchableOpacity style={styles.qtyBtn} onPress={() => updateCashierCartQty(i.id, -1)}><Text style={{ color: '#fff', fontWeight: 'bold' }}>-</Text></TouchableOpacity>
                              <TextInput style={styles.inputSmall} keyboardType="numeric" value={String(i.qty)} onChangeText={(val) => updateCashierCartDirectQty(i.id, val)} />
                              <TouchableOpacity style={styles.qtyBtn} onPress={() => updateCashierCartQty(i.id, 1)}><Text style={{ color: '#fff', fontWeight: 'bold' }}>+</Text></TouchableOpacity>
                              <Text style={{ fontSize: 11, marginLeft: 4, marginRight: 8 }}>{i.unit_type}</Text>
                            </View>
                          )}

                          <Text style={{ fontWeight: 'bold' }}>{formatMoney(i.price_per_unit * qtyVal)}</Text>
                        </View>
                      );
                    })}
                  </>
                )}

                <Text style={styles.subSectionTitle}>Método de Pago:</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                  <TouchableOpacity style={[styles.payBtn, paymentMethod === 'Efectivo' && styles.payBtnActive]} onPress={() => setPaymentMethod('Efectivo')}><Text style={styles.buttonText}>Efectivo</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.payBtn, paymentMethod === 'Mercado Pago' && styles.payBtnActive]} onPress={() => setPaymentMethod('Mercado Pago')}><Text style={styles.buttonText}>Mercado Pago</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.payBtn, paymentMethod === 'Mixto' && styles.payBtnActive]} onPress={() => setPaymentMethod('Mixto')}><Text style={styles.buttonText}>Mixto</Text></TouchableOpacity>
                </View>

                {paymentMethod === 'Mixto' && (
                  <View style={styles.card}>
                    <Text style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 5 }}>📱 Mercado Pago:</Text>
                    <TextInput style={styles.input} placeholder="Monto MP ($)" keyboardType="numeric" value={amountMP} onChangeText={setAmountMP} />
                    <Text style={{ fontSize: 13, color: '#007bff', fontWeight: 'bold', marginTop: 4 }}>
                      💵 Restante Efectivo: ${getRequiredCash().toFixed(2)}
                    </Text>
                  </View>
                )}

                {(paymentMethod === 'Efectivo' || paymentMethod === 'Mixto') && (
                  <View style={styles.changeCard}>
                    <Text style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 6 }}>💵 Paga con Efectivo: (Requerido: ${getRequiredCash().toFixed(2)})</Text>
                    <TextInput style={styles.inputHighlight} placeholder={`Ej: ${getRequiredCash().toFixed(2)}`} keyboardType="numeric" value={cashTendered} onChangeText={setCashTendered} />
                    <View style={styles.changeRow}>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#155724' }}>💰 Vuelto:</Text>
                      <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#28a745' }}>${getChangeDue()}</Text>
                    </View>
                  </View>
                )}

                <View style={styles.totalBox}>
                  <Text style={{ fontSize: 18, fontWeight: 'bold' }}>TOTAL TICKET:</Text>
                  <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#28a745' }}>${getCashierTotal()}</Text>
                </View>

                <TouchableOpacity style={styles.buttonSuccess} onPress={handleFinalizeSale} disabled={loading}>
                  <Text style={styles.buttonText}>💳 Concretar Venta y Cobrar</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        )}

        {/* 🎪 OBJETIVO DE JORNADA — FERIA */}
        {currentTab === 'feria' && canFairPlanner && (
          <FairDayPlanner
            branchId={branchId}
            userEmail={email}
            canEditConfig={isAdminLevel}
            formatMoney={formatMoney}
            formatQuantityVisual={formatQuantityVisual}
            applyDateMask={applyDateMask}
          />
        )}

        {/* KPIS V2 - RENTABILIDAD REAL */}
        {currentTab === 'kpis' && (canKPIs || isAdminLevel) && (
          <ScrollView contentContainerStyle={styles.scrollPadding}>
            <Text style={styles.sectionTitle}>📈 Rentabilidad y flujo de caja</Text>
            <View style={{flexDirection:'row',marginBottom:10}}>
              {[['week','7 días'],['month','Mes'],['30d','30 días']].map(([p,label]) => (
                <TouchableOpacity key={p} style={[styles.typeBtn,{marginRight:6},kpiPeriod===p&&styles.typeBtnActive]} onPress={()=>changeKPIPeriod(p)}>
                  <Text style={{fontWeight:'bold',color:kpiPeriod===p?'#fff':'#333'}}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {profitabilityData ? (<>
              <View style={styles.card}>
                <Text style={styles.subSectionTitle}>💰 Resultado económico</Text>
                <Text style={{fontSize:12,color:'#666'}}>Período: {profitabilityData.from} → {profitabilityData.to}</Text>
                <Text style={{fontSize:13,marginTop:8}}>Ventas: {profitabilityData.sales_count}</Text>
                <Text style={{fontSize:16,fontWeight:'bold'}}>Facturación: {formatMoney(profitabilityData.revenue)}</Text>
                <Text>Costo mercadería vendida (COGS): {formatMoney(profitabilityData.cogs)}</Text>
                <Text style={{fontWeight:'bold',color:'#007bff'}}>Margen bruto: {formatMoney(profitabilityData.gross_profit)} ({profitabilityData.gross_margin_pct||0}%)</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.subSectionTitle}>📉 Costos y pérdidas reales</Text>
                <Text>Mermas / pérdidas a costo: {formatMoney(profitabilityData.losses_at_cost)}</Text>
                <Text>Gastos operativos / servicios: {formatMoney(profitabilityData.operating_expenses)}</Text>
                <Text>Pagos a empleados: {formatMoney(profitabilityData.employee_expenses)}</Text>
                <Text>Otros gastos económicos: {formatMoney(profitabilityData.other_expenses)}</Text>
                <Text style={{fontWeight:'bold',marginTop:6}}>Total gastos económicos: {formatMoney(profitabilityData.economic_expenses)}</Text>
              </View>
              <View style={[styles.card,{backgroundColor:(profitabilityData.net_profit||0)>=0?'#d4edda':'#f8d7da'}]}>
                <Text style={{fontSize:13,fontWeight:'bold'}}>UTILIDAD NETA</Text>
                <Text style={{fontSize:24,fontWeight:'bold',color:(profitabilityData.net_profit||0)>=0?'#155724':'#721c24'}}>{formatMoney(profitabilityData.net_profit)}</Text>
                <Text>Margen neto: {profitabilityData.net_margin_pct||0}%</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.subSectionTitle}>🏦 Flujo de caja</Text>
                <Text>Ventas efectivo: {formatMoney(profitabilityData.cash_flow?.sales_cash)}</Text>
                <Text>Ventas Mercado Pago: {formatMoney(profitabilityData.cash_flow?.sales_mp)}</Text>
                <Text>Otros ingresos de caja: {formatMoney(profitabilityData.cash_flow?.other_cash_in)}</Text>
                <Text>Salidas totales de caja: {formatMoney(profitabilityData.cash_flow?.cash_out)}</Text>
                <Text style={{marginTop:6}}>Pagos a proveedores: {formatMoney(profitabilityData.cash_flow?.supplier_payments)}</Text>
                <Text>Retiros del dueño: {formatMoney(profitabilityData.cash_flow?.owner_withdrawals)}</Text>
                <Text style={{fontSize:11,color:'#666',marginTop:8}}>Pagos de mercadería y retiros afectan caja, pero no se duplican como gasto económico.</Text>
              </View>
              {kpiData && <>
                <View style={styles.card}><Text style={styles.subSectionTitle}>🚨 Estado operativo</Text><Text>Alertas críticas: {kpiData.critical_alerts_count||0}</Text><Text>Advertencias: {kpiData.warning_alerts_count||0}</Text></View>
                <View style={styles.card}><Text style={styles.subSectionTitle}>🏆 Productos más vendidos</Text>
                  {(kpiData.top_products||[]).map((prod,idx)=><View key={idx} style={{flexDirection:'row',justifyContent:'space-between',paddingVertical:6,borderBottomWidth:1,borderBottomColor:'#eee'}}><Text style={{fontWeight:'bold',fontSize:12}}>{idx+1}. {prod.name}</Text><Text style={{fontWeight:'bold',color:'#007bff'}}>{prod.total_qty}</Text></View>)}
                </View>
              </>}
            </>) : <ActivityIndicator size="large" color="#007bff" />}
          </ScrollView>
        )}

        {/* ALERTAS V2 */}
        {currentTab === 'alertas' && (canAlertas || isAdminLevel) && (
          <ScrollView contentContainerStyle={styles.scrollPadding}>
            <Text style={styles.sectionTitle}>🚨 Alertas críticas y operativas</Text>
            <View style={{flexDirection:'row',marginBottom:10}}>
              <TouchableOpacity style={[styles.buttonPrimary,{flex:1,marginRight:5}]} onPress={refreshAlertsV2}><Text style={styles.buttonText}>↻ Actualizar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.buttonPrimary,{flex:1,marginLeft:5,backgroundColor:'#6c757d'}]} onPress={handleAlertHistory}><Text style={styles.buttonText}>{showAlertHistory?'Ocultar historial':'Ver historial'}</Text></TouchableOpacity>
            </View>
            {systemAlerts.length===0 && <View style={styles.card}><Text>✅ No hay alertas activas.</Text></View>}
            {systemAlerts.map(item=><View key={item.id} style={styles.card}>
              <Text style={{fontWeight:'bold',fontSize:15,color:item.severity==='CRITICAL'?'#dc3545':item.severity==='IMPORTANT'?'#fd7e14':'#555'}}>{item.severity==='CRITICAL'?'🔴':item.severity==='IMPORTANT'?'🟠':'🔵'} {item.title}</Text>
              <Text style={{fontSize:12,color:'#555',marginVertical:6}}>{item.detail}</Text>
              <Text style={{fontSize:10,color:'#777'}}>Estado: {item.state||'NEW'} · Tipo: {item.type}</Text>
              <Text style={{fontSize:10,color:'#555',fontStyle:'italic',marginTop:4}}>Recordar en 24 h oculta temporalmente la alerta. Descartar la oculta de forma permanente.</Text>
              <View style={{flexDirection:'row',flexWrap:'wrap',marginTop:8}}>
                <TouchableOpacity style={[styles.typeBtn,{marginRight:5,marginBottom:5}]} onPress={()=>handleAlertAction(item,'SNOOZED')}><Text>⏰ Recordar en 24 h</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.typeBtn,{marginRight:5,marginBottom:5,backgroundColor:'#6c757d'}]} onPress={()=>handleAlertAction(item,'DISMISSED')}><Text style={{color:'#fff'}}>🗑️ Descartar</Text></TouchableOpacity>
              </View>
            </View>)}
            {showAlertHistory && <View style={styles.card}><Text style={styles.subSectionTitle}>📜 Historial auditable</Text>{alertHistory.slice(0,100).map(h=><Text key={h.id} style={{fontSize:11,paddingVertical:5,borderBottomWidth:1,borderBottomColor:'#eee'}}>{h.created_at} · {h.actor||'-'} · {h.old_state} → {h.new_state} · {h.note||''}</Text>)}</View>}
          </ScrollView>
        )}

        {/* RRHH V2 */}
        {currentTab === 'rrhh' && (canRRHH || isAdminLevel) && (
          <ScrollView contentContainerStyle={styles.scrollPadding}>
            <Text style={styles.sectionTitle}>👨‍💼 RRHH y Turnos</Text>
            <View style={styles.card}>
              <Text style={styles.subSectionTitle}>Turnos laborales (independientes de Caja)</Text>
              {usersList.filter(u=>u.role!=='superadmin').map(u=>{
                const shift=activeHRShifts.find(x=>x.user_id===u.id);
                return <View key={u.id} style={{paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#eee'}}>
                  <Text style={{fontWeight:'bold'}}>{u.name} · {u.role}</Text>
                  <Text style={{fontSize:11,color:'#666'}}>{u.email}</Text>
                  <Text style={{fontSize:11,color:shift?'#28a745':'#777',marginVertical:5}}>{shift ? `🟢 En turno · ${shift.role_worked || u.role}` : '⚪ Fuera de turno'}</Text>
                  <View style={{flexDirection:'row',flexWrap:'wrap'}}>
                    {!shift && u.is_active && <TouchableOpacity style={[styles.typeBtn,{backgroundColor:'#28a745',marginRight:6}]} onPress={()=>handleStartShift(u)}><Text style={{color:'#fff',fontWeight:'bold'}}>▶ Iniciar turno</Text></TouchableOpacity>}
                    {shift && <TouchableOpacity style={[styles.typeBtn,{backgroundColor:'#dc3545',marginRight:6}]} onPress={()=>handleEndShift(u)}><Text style={{color:'#fff',fontWeight:'bold'}}>■ Finalizar turno</Text></TouchableOpacity>}
                    <TouchableOpacity style={[styles.typeBtn,{backgroundColor:u.is_active?'#6c757d':'#007bff'}]} onPress={()=>handleUserEnabled(u)}><Text style={{color:'#fff',fontWeight:'bold'}}>{u.is_active?'Inhabilitar cuenta':'Habilitar cuenta'}</Text></TouchableOpacity>
                  </View>
                </View>
              })}
            </View>

            <View style={styles.card}>
              <Text style={styles.subSectionTitle}>👤 Ver un empleado</Text>
              <TextInput style={styles.input} placeholder="Período en días (7, 30, 90)" keyboardType="numeric" value={hrDays} onChangeText={setHRDays}/>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {usersList.filter(u=>u.role!=='superadmin').map(u=><TouchableOpacity key={u.id} style={[styles.typeBtn,{marginRight:6},hrIndividualEmail===u.email&&{backgroundColor:'#007bff'}]} onPress={()=>handleIndividualHR(u.email)}><Text style={{color:hrIndividualEmail===u.email?'#fff':'#333'}}>{u.name}</Text></TouchableOpacity>)}
              </ScrollView>
              {hrIndividualEmail && <View style={{marginTop:10}}>
                <Text style={{fontWeight:'bold'}}>{hrIndividualEmail} · {hrIndividualLogs.length} registros</Text>
                {hrIndividualLogs.slice(0,20).map(l=><Text key={l.id} style={{fontSize:11,paddingVertical:4}}>{l.date} · {l.clock_in} → {l.clock_out} · {l.hours_worked ?? 0} hs · Rol: {l.role_worked || '-'}</Text>)}
              </View>}
            </View>

            <View style={styles.card}>
              <Text style={styles.subSectionTitle}>⚖ Comparar 2, 3 o todos</Text>
              <Text style={{fontSize:11,color:'#666',marginBottom:8}}>Seleccionados: {hrSelectedEmails.length}. Comparación contextual por rol, sin ranking automático.</Text>
              <View style={{flexDirection:'row',flexWrap:'wrap'}}>
                {usersList.filter(u=>u.role!=='superadmin').map(u=><TouchableOpacity key={u.id} style={[styles.typeBtn,{marginRight:6,marginBottom:6},hrSelectedEmails.includes(u.email)&&{backgroundColor:'#6f42c1'}]} onPress={()=>toggleHRCompare(u.email)}><Text style={{color:hrSelectedEmails.includes(u.email)?'#fff':'#333'}}>{u.name}</Text></TouchableOpacity>)}
              </View>
              <TouchableOpacity style={styles.buttonPrimary} onPress={()=>handleHRCompareV2(false)}><Text style={styles.buttonText}>Comparar seleccionados</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.buttonPrimary,{backgroundColor:'#6f42c1'}]} onPress={()=>handleHRCompareV2(true)}><Text style={styles.buttonText}>Comparar todos</Text></TouchableOpacity>
              {comparisonResult?.employees?.map(emp=><View key={emp.email} style={{marginTop:10,padding:10,backgroundColor:'#f8f9fa',borderRadius:7}}>
                <Text style={{fontWeight:'bold'}}>{emp.name} · {emp.current_role}</Text>
                <Text style={{fontSize:11}}>Turnos: {emp.shifts_count} · Horas: {emp.total_hours} · Roles: {Object.entries(emp.roles_worked||{}).map(([r,n])=>`${r} (${n})`).join(', ') || '-'}</Text>
                <Text style={{fontSize:11}}>Ventas: {emp.sales_count} · Facturación: {formatMoney(emp.total_revenue)} · Ticket prom.: {formatMoney(emp.ticket_avg)}</Text>
                <Text style={{fontSize:11}}>Preventas: {emp.presales_count} · Caja: {emp.cash_operations} · Mermas: {emp.stock_loss_operations}</Text>
              </View>)}
            </View>
          </ScrollView>
        )}

        {/* MRP V2 */}
        {currentTab === 'mrp' && (canMRP || isAdminLevel) && (
          <ScrollView contentContainerStyle={styles.scrollPadding}>
            <Text style={styles.sectionTitle}>📦 Reposición de mercadería</Text>
            <Text style={{fontSize:12,color:'#666',marginBottom:10}}>
              "El sistema analiza las ventas y el stock para ayudarte a decidir qué productos comprar."
            </Text>

            <View style={styles.card}>
              <Text style={{fontSize:12,fontWeight:'bold',color:'#444',marginBottom:4}}>Días de ventas analizados</Text>
              <Text style={{fontSize:11,color:'#666',marginBottom:4}}>Período que se usa para calcular el consumo promedio.</Text>
              <TextInput style={styles.input} placeholder="Días de ventas analizados" keyboardType="numeric" value={mrpDays} onChangeText={setMrpDays}/>

              <Text style={{fontSize:12,fontWeight:'bold',color:'#444',marginBottom:4}}>Días objetivo de stock</Text>
              <Text style={{fontSize:11,color:'#666',marginBottom:4}}>Cantidad de días de mercadería que querés tener disponibles.</Text>
              <TextInput style={styles.input} placeholder="Días objetivo de stock" keyboardType="numeric" value={mrpTargetDays} onChangeText={setMrpTargetDays}/>

              <TouchableOpacity style={styles.buttonPrimary} onPress={loadMRPData} disabled={loading}><Text style={styles.buttonText}>📊 Recalcular sugerencias</Text></TouchableOpacity>
            </View>

            <Text style={styles.subSectionTitle}>🤖 Sugerencias de compra</Text>
            {mrpSuggestions.length===0 && (
              <View style={styles.card}>
                <Text style={{color:'#155724',fontSize:13}}>✅ No hay productos que necesiten reposición automática con la configuración actual.</Text>
              </View>
            )}
            {mrpSuggestions.map(item=>(
              <View key={item.product_id} style={styles.card}>
                <Text style={{fontWeight:'bold',fontSize:15,color:'#222',marginBottom:4}}>{item.product_name}</Text>
                <Text style={{fontSize:13,color:'#444'}}>Stock actual: {item.current_stock}</Text>
                <Text style={{fontSize:13,color:'#444'}}>Compra sugerida: {item.suggested_buy}</Text>
                <Text style={{fontSize:13,fontWeight:'bold',color:'#28a745',marginTop:2}}>Costo estimado: {formatMoney(item.estimated_cost)}</Text>
                <Text style={{fontSize:11,color:'#777',marginTop:4}}>Política: {item.replenishment_policy||'MRP'}</Text>
                <View style={{flexDirection:'row',flexWrap:'wrap',marginTop:6}}>
                  {[
                    ['MRP','🤖 MRP automático'],
                    ['MANUAL','✋ Reposición manual'],
                    ['PAUSED','⏸ No reponer'],
                    ['DISCONTINUED','⛔ Discontinuado']
                  ].map(([pol,label])=>(
                    <TouchableOpacity key={pol} style={[styles.typeBtn,{marginRight:4,marginBottom:4}]} onPress={()=>handleReplenishmentPolicy(item.product_id,pol)}>
                      <Text style={{fontSize:11}}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}

            <View style={styles.card}>
              <Text style={styles.subSectionTitle}>¿Cómo se repone cada producto?</Text>
              <Text style={{fontSize:12,fontWeight:'bold',color:'#333',marginTop:4}}>🤖 MRP automático</Text>
              <Text style={{fontSize:11,color:'#666',marginBottom:6}}>El sistema analiza ventas y stock y calcula cuánto conviene comprar.</Text>

              <Text style={{fontSize:12,fontWeight:'bold',color:'#333',marginTop:4}}>✋ Reposición manual</Text>
              <Text style={{fontSize:11,color:'#666',marginBottom:6}}>El producto sigue activo, pero vos decidís cuándo y cuánto comprar.</Text>

              <Text style={{fontSize:12,fontWeight:'bold',color:'#333',marginTop:4}}>⏸ No reponer</Text>
              <Text style={{fontSize:11,color:'#666',marginBottom:6}}>El producto sigue existiendo, pero queda fuera de las sugerencias de compra.</Text>

              <Text style={{fontSize:12,fontWeight:'bold',color:'#333',marginTop:4}}>⛔ Discontinuado</Text>
              <Text style={{fontSize:11,color:'#666'}}>Producto que ya no se comercializa normalmente.</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.subSectionTitle}>⚙️ Configuración por producto</Text>
              {products.filter(p=>p.is_active).slice(0,100).map(p=>{
                const currentPol = p.replenishment_policy || 'MRP';
                const policyLabelsMap = {
                  'MRP': '🤖 MRP automático',
                  'MANUAL': '✋ Reposición manual',
                  'PAUSED': '⏸ No reponer',
                  'DISCONTINUED': '⛔ Discontinuado'
                };
                return (
                  <View key={p.id} style={{paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#eee'}}>
                    <Text style={{fontWeight:'bold',fontSize:13}}>{p.name}</Text>
                    <Text style={{fontSize:11,color:'#555'}}>Stock actual: {p.stock} {p.unit_type} · Reposición: {policyLabelsMap[currentPol] || currentPol}</Text>
                    <View style={{flexDirection:'row',flexWrap:'wrap',marginTop:6}}>
                      {[
                        ['MRP','🤖 MRP automático'],
                        ['MANUAL','✋ Reposición manual'],
                        ['PAUSED','⏸ No reponer'],
                        ['DISCONTINUED','⛔ Discontinuado']
                      ].map(([pol,label])=>(
                        <TouchableOpacity 
                          key={pol} 
                          style={[
                            styles.typeBtn,
                            {marginRight:4,marginTop:4},
                            currentPol === pol && {backgroundColor:'#007bff'}
                          ]} 
                          onPress={()=>handleReplenishmentPolicy(p.id,pol)}
                        >
                          <Text style={{fontSize:10,color:currentPol === pol?'#fff':'#333',fontWeight:'bold'}}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* VERIFICACIÓN / ARQUEOS */}
        {currentTab === 'verificacion' && (canVerificacion || isAdminLevel) && (
          <ScrollView contentContainerStyle={styles.scrollPadding}>
            <Text style={styles.sectionTitle}>🔍 Verificación de Caja</Text>
            {cashAuditsList.map(audit => (
              <View key={audit.id} style={styles.card}>
                <Text style={{ fontWeight: 'bold', fontSize: 16 }}>Jornada: {audit.date}</Text>
                <Text style={{ fontSize: 12, color: '#555' }}>Apertura: {audit.opened_at} por {audit.opened_by}</Text>
                <Text style={{ fontSize: 12, color: '#555' }}>Cierre: {audit.closed_at} por {audit.closed_by}</Text>
                <Text style={{ fontSize: 14, fontWeight: 'bold', marginTop: 4, color: audit.difference === 0 ? '#28a745' : '#dc3545' }}>
                  Diferencia: ${audit.difference} ({audit.status_message})
                </Text>
              </View>
            ))}
          </ScrollView>
        )}

        {/* INVENTARIO / STOCK / FEFO / ADMINISTRACIÓN POR SUCURSAL */}
        {currentTab === 'inventario' && (canStock || isAdminLevel) && (
          <ScrollView contentContainerStyle={styles.scrollPadding} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>📦 Control FEFO e Inventario</Text>

            {/* ADMINISTRACIÓN DE PRECIOS Y STOCK MÍNIMO POR SUCURSAL */}
            <View style={styles.card}>
              <View style={[{ marginBottom: 10 }, isNarrowScreen ? { flexDirection: 'column' } : { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                <Text style={[{ fontSize: 15, fontWeight: 'bold', color: '#333' }, !isNarrowScreen && { flexShrink: 1, marginRight: 8 }]}>⚙️ Administración por Sucursal ({branchName})</Text>
                <TouchableOpacity style={[{ backgroundColor: '#007bff', paddingHorizontal: 10, paddingVertical: isNarrowScreen ? 10 : 6, borderRadius: 6, alignItems: 'center' }, isNarrowScreen && { marginTop: 8, alignSelf: 'stretch' }]} onPress={loadBranchAdminProducts}>
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: isNarrowScreen ? 13 : 11 }}>↻ Cargar Catálogo Sucursal</Text>
                </TouchableOpacity>
              </View>

              <TextInput style={styles.searchInput} placeholder="Filtrar productos de sucursal..." value={branchAdminSearch} onChangeText={setBranchAdminSearch} />

              <View style={{ marginTop: 10 }}>
                {branchAdminProducts.length === 0 ? (
                  <Text style={{ fontStyle: 'italic', color: '#888', textAlign: 'center', padding: 10 }}>Tocá en "Cargar Catálogo Sucursal" para administrar precios y stock mínimo.</Text>
                ) : (
                  branchAdminProducts
                    .filter(item => (item.name || '').toLowerCase().includes(branchAdminSearch.toLowerCase()))
                    .map(item => {
                      const unitLabel = item.unit_type === 'kg' ? 'kg' : 'unid';
                      const branchStatus = item.branch_status || (item.is_available ? 'DISPONIBLE' : 'RETIRADO');
                      const isRetired = branchStatus === 'RETIRADO';
                      const isNotEnabled = branchStatus === 'NO_HABILITADO';
                      return (
                        <View key={item.product_id} style={{ padding: 10, backgroundColor: isRetired ? '#fff5f5' : '#f8f9fa', borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: isRetired ? '#f5c2c7' : '#dee2e6' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                            <Text style={{ fontWeight: 'bold', fontSize: 14, color: '#222', flexShrink: 1, marginRight: 6 }}>{item.name}</Text>
                            {isRetired && (
                              <View style={{ backgroundColor: '#dc3545', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>RETIRADO</Text>
                              </View>
                            )}
                            {isNotEnabled && (
                              <View style={{ backgroundColor: '#6c757d', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>NO HABILITADO</Text>
                              </View>
                            )}
                          </View>
                          {isRetired && (
                            <Text style={{ fontSize: 11, color: '#842029', marginTop: 2 }}>No se vende ni aparece en Caja ni Cartelería de {branchName} hasta reactivarlo.</Text>
                          )}
                          <Text style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>Precio base (global): {formatMoney(item.base_price)} · Stock actual: {item.stock} {unitLabel}</Text>

                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                            <View style={{ flex: 1, marginRight: 6 }}>
                              <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#444' }}>Precio en sucursal ($)</Text>
                              <TextInput 
                                style={[styles.input, { marginBottom: 0, backgroundColor: '#fff' }]} 
                                keyboardType="numeric" 
                                value={String(branchPriceDrafts[item.product_id] ?? '')} 
                                onChangeText={(val) => setBranchPriceDrafts({ ...branchPriceDrafts, [item.product_id]: val })} 
                              />
                            </View>

                            <View style={{ flex: 1, marginLeft: 6 }}>
                              <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#444' }}>Stock mínimo ({unitLabel})</Text>
                              <TextInput 
                                style={[styles.input, { marginBottom: 0, backgroundColor: '#fff' }]} 
                                keyboardType="numeric" 
                                placeholder="0 = sin alerta"
                                value={String(branchMinStockDrafts[item.product_id] ?? '')} 
                                onChangeText={(val) => setBranchMinStockDrafts({ ...branchMinStockDrafts, [item.product_id]: val })} 
                              />
                            </View>
                          </View>
                          <Text style={{ fontSize: 10, color: '#666', fontStyle: 'italic', marginBottom: 8 }}>Se genera alerta cuando el stock llega a este valor o menos. 0 = sin alerta.</Text>

                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <TouchableOpacity style={[styles.buttonPrimary, { flex: 0.48, marginTop: 0, backgroundColor: '#28a745' }]} onPress={() => saveBranchProductConfig(item)} disabled={loading}>
                              <Text style={styles.buttonText}>💾 Guardar</Text>
                            </TouchableOpacity>
                            {isRetired ? (
                              <TouchableOpacity style={[styles.buttonPrimary, { flex: 0.48, marginTop: 0, backgroundColor: '#17a2b8' }]} onPress={() => reactivateProductInBranch(item)} disabled={loading}>
                                <Text style={styles.buttonText}>Reactivar</Text>
                              </TouchableOpacity>
                            ) : isNotEnabled ? (
                              <View style={{ flex: 0.48, justifyContent: 'center' }}>
                                <Text style={{ fontSize: 11, color: '#6c757d', textAlign: 'center' }}>Sin habilitar en esta sucursal</Text>
                              </View>
                            ) : (
                              <TouchableOpacity style={[styles.buttonDanger, { flex: 0.48 }]} onPress={() => disableBranchProduct(item)} disabled={loading}>
                                <Text style={styles.buttonText}>Retirar de sucursal</Text>
                              </TouchableOpacity>
                            )}
                          </View>

                          {(canEditRecords || isAdminLevel) && stockEditForm?.product_id !== item.product_id && (
                            <TouchableOpacity style={{ marginTop: 8, paddingVertical: 8, alignItems: 'center', borderRadius: 6, borderWidth: 1, borderColor: '#6c757d' }} onPress={() => handleStartEditProduct(item)} disabled={loading}>
                              <Text style={{ color: '#495057', fontWeight: 'bold', fontSize: 12 }}>✏️ Datos del producto</Text>
                            </TouchableOpacity>
                          )}

                          {stockEditForm?.product_id === item.product_id && (
                            <View style={{ marginTop: 10, padding: 10, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#6c757d' }}>
                              <Text style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 6 }}>✏️ Datos del producto (todas las sucursales)</Text>
                              <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#444' }}>Nombre</Text>
                              <TextInput style={styles.input} value={stockEditForm.name} onChangeText={(v) => setStockEditForm({ ...stockEditForm, name: v })} />
                              <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#444' }}>Marca</Text>
                              <TextInput style={styles.input} value={stockEditForm.brand} placeholder="Sin marca" onChangeText={(v) => setStockEditForm({ ...stockEditForm, brand: v })} />
                              <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#444' }}>Categoría</Text>
                              <TextInput style={styles.input} value={stockEditForm.category} onChangeText={(v) => setStockEditForm({ ...stockEditForm, category: v })} />
                              <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#444' }}>EAN</Text>
                              <TextInput style={styles.input} value={stockEditForm.barcode} placeholder="Sin EAN" keyboardType="numeric" onChangeText={(v) => setStockEditForm({ ...stockEditForm, barcode: v })} />
                              <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#444', marginBottom: 4 }}>Presentación visual</Text>
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                                {VISUAL_PRESENTATION_OPTIONS.map(([vKey, vLabel]) => (
                                  <TouchableOpacity key={vKey} style={[styles.typeBtn, { marginRight: 6, paddingHorizontal: 10 }, stockEditForm.visual_presentation === vKey && { backgroundColor: '#007bff' }]}
                                    onPress={() => setStockEditForm({ ...stockEditForm, visual_presentation: vKey })}>
                                    <Text style={{ fontSize: 11, color: stockEditForm.visual_presentation === vKey ? '#fff' : '#333', fontWeight: 'bold' }}>{vLabel}</Text>
                                  </TouchableOpacity>
                                ))}
                              </ScrollView>
                              <Text style={{ fontSize: 10, color: '#666', fontStyle: 'italic', marginBottom: 8 }}>
                                Los precios no se editan acá. Precio base (global): {formatMoney(stockEditForm.base_price)}. El precio de {branchName} se guarda en "Precio en sucursal". Unidad, vencimiento, proveedor, política MRP, stock, lotes y costos se conservan.
                              </Text>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <TouchableOpacity style={[styles.buttonPrimary, { flex: 0.48, marginTop: 0 }]} onPress={handleSaveProduct} disabled={loading}>
                                  <Text style={styles.buttonText}>💾 Guardar datos</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.buttonPrimary, { flex: 0.48, marginTop: 0, backgroundColor: '#6c757d' }]} onPress={handleCancelEditProduct} disabled={loading}>
                                  <Text style={styles.buttonText}>Cancelar</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          )}
                        </View>
                      );
                    })
                )}
              </View>
            </View>

            {/* SECCIÓN NUEVA: Listados / Control de inventario con exportación real */}
            <View style={styles.card}>
              <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#333', marginBottom: 8 }}>📋 Listados / Control de inventario</Text>
              <TouchableOpacity style={styles.buttonPrimary} onPress={() => setShowStockList(!showStockList)}>
                <Text style={styles.buttonText}>{showStockList ? '📋 Ocultar listado de stock y precios' : '📋 Ver listado de stock y precios'}</Text>
              </TouchableOpacity>

              {showStockList && (() => {
                const currentBranchLabel = `Sucursal: ${branchName}`;
                const allCats = ['todas', ...new Set(products.map(p => p.category || 'Varios'))];
                const filteredList = getFilteredStockProducts();

                const totalProds = products.length;
                const totalConStock = products.filter(p => Number(p.stock || 0) > 0).length;
                const totalSinStock = products.filter(p => Number(p.stock || 0) <= 0).length;
                const totalCriticos = products.filter(p => {
                  const stk = Number(p.stock || 0);
                  const minStk = Number(p.minimum_stock ?? p.min_stock ?? p.critical_stock ?? 0);
                  return minStk > 0 ? stk <= minStk : false;
                }).length;

                return (
                  <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10 }}>
                    <Text style={{ fontWeight: 'bold', color: '#007bff', marginBottom: 6 }}>{currentBranchLabel}</Text>
                    
                    {/* Resumen */}
                    <View style={{ backgroundColor: '#f8f9fa', padding: 8, borderRadius: 6, marginBottom: 8 }}>
                      <Text style={{ fontSize: 11, color: '#333' }}>Productos: {totalProds} | Con stock: {totalConStock} | Sin stock: {totalSinStock} | Críticos: {totalCriticos}</Text>
                    </View>

                    {/* Filtros de búsqueda y estados */}
                    <TextInput style={styles.searchInput} placeholder="Buscar producto..." value={stockListSearch} onChangeText={setStockListSearch} />
                    
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
                      {[
                        ['todos', 'Todos'],
                        ['con_stock', 'Con stock'],
                        ['sin_stock', 'Sin stock'],
                        ['critico', 'Stock crítico']
                      ].map(([fKey, fLabel]) => (
                        <TouchableOpacity 
                          key={fKey} 
                          style={[styles.typeBtn, { marginRight: 6, paddingHorizontal: 10 }, stockListFilter === fKey && styles.typeBtnActive]} 
                          onPress={() => setStockListFilter(fKey)}
                        >
                          <Text style={{ fontSize: 11, color: stockListFilter === fKey ? '#fff' : '#333', fontWeight: 'bold' }}>{fLabel}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    {/* Filtro de categorías */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                      {allCats.map(cat => (
                        <TouchableOpacity 
                          key={cat} 
                          style={[styles.typeBtn, { marginRight: 6, backgroundColor: '#e2e3e5' }, stockListCategory === cat && { backgroundColor: '#6c757d' }]} 
                          onPress={() => setStockListCategory(cat)}
                        >
                          <Text style={{ fontSize: 10, color: stockListCategory === cat ? '#fff' : '#333', fontWeight: 'bold' }}>{cat}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    {/* Grupo Responsive de Botones de Exportación */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12, marginHorizontal: -3 }}>
                      <TouchableOpacity style={[styles.exportBtnItem, { backgroundColor: '#dc3545' }]} onPress={handleExportPdf} disabled={loading}>
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11, textAlign: 'center' }}>📄 PDF</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.exportBtnItem, { backgroundColor: '#28a745' }]} onPress={handleExportExcel} disabled={loading}>
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11, textAlign: 'center' }}>📊 Excel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.exportBtnItem, { backgroundColor: '#007bff' }]} onPress={handleExportPdf} disabled={loading}>
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11, textAlign: 'center' }}>📤 Compartir PDF</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.exportBtnItem, { backgroundColor: '#6f42c1' }]} onPress={handlePrintPdf} disabled={loading}>
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11, textAlign: 'center' }}>🖨 Imprimir</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Lista real de stock y precios */}
                    {filteredList.length === 0 ? (
                      <Text style={{ fontStyle: 'italic', color: '#888', textAlign: 'center', padding: 10 }}>No se encontraron productos.</Text>
                    ) : (
                      filteredList.map(item => (
                        <View key={item.id} style={{ padding: 8, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#fff' }}>
                          <Text style={{ fontWeight: 'bold', fontSize: 13, color: '#222' }}>{item.name}</Text>
                          <Text style={{ fontSize: 11, color: '#555' }}>EAN: {item.barcode || 'Sin EAN'} | Categoría: {item.category || 'Varios'}</Text>
                          <Text style={{ fontSize: 11, color: '#555' }}>Stock actual: {item.stock} {item.unit_type}</Text>
                          <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#28a745' }}>Precio venta: {formatMoney(item.branch_price ?? item.price_per_unit ?? 0)}</Text>
                        </View>
                      ))
                    )}
                  </View>
                );
              })()}
            </View>

            <TouchableOpacity style={styles.buttonCamera} onPress={() => toggleCamera('stock')}>
              <Text style={styles.buttonText}>{showCamera && cameraTarget === 'stock' ? '📷 Cerrar Escáner' : '📷 Escanear EAN del Producto'}</Text>
            </TouchableOpacity>
{showCamera && cameraTarget === 'stock' && permission?.granted && (
  <View style={styles.cameraContainer}>
    <CameraView
      style={StyleSheet.absoluteFillObject}
      facing="back"
      onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
    />
  </View>
)}

            <TextInput style={styles.searchInput} placeholder="🔍 Buscar producto para contar..." value={searchQueryStock} onChangeText={setSearchQueryStock} />

            {searchQueryStock.trim() !== '' && (
              <View style={styles.dropdownContainer}>
                {filteredProductsStock.map(p => (
                  <TouchableOpacity key={p.id} style={styles.dropdownItem} onPress={() => { handleSelectProductForAudit(p); setSearchQueryStock(''); }}>
                    <Text style={{ fontWeight: 'bold' }}>{p.name}</Text>
                    <Text style={{ color: '#666', fontSize: 11 }}>EAN: {p.barcode || 'Sin EAN'} · Producto por {p.unit_type === 'kg' ? 'peso' : 'unidad'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {selectedAuditProd && (
              <View style={{ marginTop: 15, backgroundColor: '#e9ecef', padding: 12, borderRadius: 8 }}>
                <Text style={{ fontWeight: 'bold', fontSize: 15, color: '#007bff' }}>{selectedAuditProd.name}</Text>
                <Text style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>
                  {latestStockAudit ? (
                    `Último control físico:\n${new Date(latestStockAudit.created_at).toLocaleString('es-AR')} · realizado por ${latestStockAudit.reported_by}`
                  ) : (
                    'Nunca controlado'
                  )}
                </Text>
                <Text style={{ fontSize: 11, color: '#666', fontStyle: 'italic', marginBottom: 8 }}>
                  Conteo ciego: el stock del sistema se mostrará recién después de confirmar.
                </Text>

                <TextInput style={styles.inputHighlight} placeholder={`Cantidad Conteo Real (${selectedAuditProd.unit_type})`} keyboardType="numeric" value={countedQtyInput} onChangeText={setCountedQtyInput} />
                <TouchableOpacity style={styles.buttonSuccess} onPress={handleSaveAudit} disabled={loading}>
                  <Text style={styles.buttonText}>💾 Confirmar Conteo</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        )}

        {/* INGRESOS V2 */}
        {currentTab === 'ingresos' && (canIngreso || isAdminLevel) && (
          <ScrollView contentContainerStyle={styles.scrollPadding} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>📥 Ingreso de Mercadería</Text>

            {/* SECCIÓN DE HISTORIAL Y BÚSQUEDA (SI NO ESTÁ EDITANDO) */}
            {!editingIngress && (
              <>
                <View style={styles.card}>
                  <Text style={styles.subSectionTitle}>1. Identificar producto</Text>
                  <TouchableOpacity style={styles.buttonCamera} onPress={() => toggleCamera('ingreso')}><Text style={styles.buttonText}>{showCamera && cameraTarget==='ingreso' ? '📷 Cerrar Escáner' : '📷 Escanear EAN'}</Text></TouchableOpacity>
                  {showCamera && cameraTarget==='ingreso' && permission?.granted && <View style={styles.cameraContainer}><CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={scanned ? undefined : handleBarcodeScanned} /></View>}
                  <TextInput style={styles.input} placeholder="EAN (opcional)" value={prodBarcode} onChangeText={setProdBarcode} onEndEditing={() => prodBarcode && lookupIngressEAN(prodBarcode)} keyboardType="numeric" />
                  <TextInput style={styles.searchInput} placeholder="🔍 O buscar producto por nombre..." value={ingressSearch} onChangeText={handleIngressSearch} />
                  {ingressMatches.length>0 && <View style={styles.dropdownContainer}>{ingressMatches.map(p=><TouchableOpacity key={p.id} style={styles.dropdownItem} onPress={()=>selectIngressProduct(p)}><Text style={{fontWeight:'bold'}}>{p.name}</Text><Text style={{fontSize:11,color:'#666'}}>EAN: {p.barcode || 'Sin EAN'} | Stock: {p.stock} {p.unit_type}</Text></TouchableOpacity>)}</View>}
                  <Text style={{fontSize:12,color:ingressProductId?'#28a745':'#666',marginBottom:8}}>{ingressProductId ? `✓ Producto existente #${ingressProductId}` : 'Producto nuevo / sin EAN'}</Text>
                  <TextInput style={styles.input} placeholder="Nombre del producto" value={prodName} onChangeText={setProdName} editable={!ingressProductId} />
                  <TextInput style={styles.input} placeholder="Marca (opcional)" value={prodBrand} onChangeText={setProdBrand} editable={!ingressProductId} />
                  
                  <Text style={{fontWeight:'bold',marginTop:8,marginBottom:4}}>Presentación para carteles</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:10}}>
                    {VISUAL_PRESENTATION_OPTIONS.map(([vKey, vLabel]) => (
                      <TouchableOpacity
                        key={vKey}
                        style={[styles.typeBtn, { marginRight: 6, paddingHorizontal: 10 }, prodVisualPresentation === vKey && { backgroundColor: '#007bff' }]}
                        onPress={() => setProdVisualPresentation(vKey)}
                      >
                        <Text style={{ fontSize: 11, color: prodVisualPresentation === vKey ? '#fff' : '#333', fontWeight: 'bold' }}>{vLabel}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <Text style={{fontWeight:'bold',marginTop:8,marginBottom:6}}>
                    ¿Este producto tiene vencimiento?
                  </Text>

                  <View style={{flexDirection:'row',marginBottom:10}}>
                    <TouchableOpacity
                      style={[styles.typeBtn,!prodRequiresExpiration && styles.typeBtnActive]}
                      onPress={() => {
                        setProdRequiresExpiration(false);
                        setProdExpirationDate('');
                      }}
                    >
                      <Text style={{color:!prodRequiresExpiration?'#fff':'#333',fontWeight:'bold'}}>
                        NO
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.typeBtn,prodRequiresExpiration && styles.typeBtnActive,{marginLeft:8}]}
                      onPress={() => setProdRequiresExpiration(true)}
                    >
                      <Text style={{color:prodRequiresExpiration?'#fff':'#333',fontWeight:'bold'}}>
                        SÍ
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={{fontSize:12,fontWeight:'bold',color:'#555',marginBottom:4}}>Categoría</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Seleccionar / escribir categoría"
                    value={prodCategory}
                    onChangeText={setProdCategory}
                    editable={!ingressProductId}
                  />
                  <Text style={styles.subSectionTitle}>2. Datos del lote / compra</Text>
                  <TextInput style={styles.input} placeholder="Proveedor" value={prodSupplier} onChangeText={setProdSupplier} />
                  <TextInput style={styles.input} placeholder="N° de lote (opcional)" value={prodLotNumber} onChangeText={setProdLotNumber} />
                  <TextInput style={styles.input} placeholder="Costo de compra ($)" keyboardType="decimal-pad" value={prodCost} onChangeText={setProdCost} />
                  <TextInput style={styles.input} placeholder="Precio PVP ($)" keyboardType="decimal-pad" value={prodPrice} onChangeText={setProdPrice} />
                  <TextInput style={styles.input} placeholder={`Cantidad (${prodUnitType})`} keyboardType="decimal-pad" value={prodStock} onChangeText={setProdStock} />
                  <View style={{flexDirection:'row',marginBottom:10}}>{['unid','kg'].map(t=><TouchableOpacity key={t} style={[styles.typeBtn,{marginRight:8},prodUnitType===t&&{backgroundColor:'#007bff'}]} onPress={()=>setProdUnitType(t)}><Text style={{color:prodUnitType===t?'#fff':'#333',fontWeight:'bold'}}>{t==='kg'?'⚖ Peso (kg)':'📦 Unidad'}</Text></TouchableOpacity>)}</View>

                  {prodRequiresExpiration && <>
                    <Text style={{fontSize:12,fontWeight:'bold',color:'#555'}}>Vencimiento (DD/MM/AAAA)</Text>
                    <TextInput
                      style={styles.inputHighlight}
                      placeholder="Ej: 31/10/2027"
                      value={prodExpirationDate}
                      maxLength={10}
                      onChangeText={(value) => {
                        setProdExpirationDate(applyDateMask(value));
                      }}
                      keyboardType="number-pad"
                    />
                    <Text style={{fontSize:11,color:'#777',marginBottom:8}}>Solo números. Se aplica formato automático DD/MM/AAAA.</Text>
                  </>}
                  <TouchableOpacity style={[styles.buttonSuccess,{marginTop:12}]} onPress={handleSaveIngressV2} disabled={loading}><Text style={styles.buttonText}>💾 Registrar ingreso y lote</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.buttonPrimary,{backgroundColor:'#6c757d'}]} onPress={resetIngressForm}><Text style={styles.buttonText}>Limpiar formulario</Text></TouchableOpacity>
                </View>

                {isAdminLevel && (
                  <View style={styles.card}>
                    <Text style={styles.subSectionTitle}>📋 Historial de ingresos</Text>
                    <Text style={{fontSize:11,color:'#666',marginBottom:8}}>Busca un ingreso antiguo para corregirlo fácilmente sin recordar el ID exacto.</Text>

                    <TextInput 
                      style={styles.input} 
                      placeholder="Buscar [ Producto, EAN, proveedor o lote ]" 
                      value={ingressHistorySearch} 
                      onChangeText={setIngressHistorySearch} 
                    />
                    <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                      <TextInput 
                        style={[styles.input, { flex: 1, marginRight: 4, marginBottom: 0 }]} 
                        placeholder="Desde DD/MM/AAAA" 
                        value={ingressHistoryDateFrom} 
                        maxLength={10}
                        onChangeText={(val) => setIngressHistoryDateFrom(applyDateMask(val))}
                        keyboardType="number-pad"
                      />
                      <TextInput 
                        style={[styles.input, { flex: 1, marginLeft: 4, marginBottom: 0 }]} 
                        placeholder="Hasta DD/MM/AAAA" 
                        value={ingressHistoryDateTo} 
                        maxLength={10}
                        onChangeText={(val) => setIngressHistoryDateTo(applyDateMask(val))}
                        keyboardType="number-pad"
                      />
                    </View>

                    <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                      <TouchableOpacity style={[styles.buttonPrimary, { flex: 1, marginRight: 5, marginTop: 0 }]} onPress={loadIngressHistory} disabled={ingressHistoryLoading}>
                        <Text style={styles.buttonText}>{ingressHistoryLoading ? 'Buscando...' : '🔎 Buscar'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.buttonPrimary, { flex: 1, marginLeft: 5, marginTop: 0, backgroundColor: '#6c757d' }]} onPress={() => { setIngressHistorySearch(''); setIngressHistoryDateFrom(''); setIngressHistoryDateTo(''); setIngressHistory([]); setShowIngressHistory(false); }}>
                        <Text style={styles.buttonText}>🧹 Limpiar</Text>
                      </TouchableOpacity>
                    </View>

                    {showIngressHistory && (
                      <>
                        {ingressHistory.length === 0 ? (
                          <Text style={{ textAlign: 'center', color: '#888', fontStyle: 'italic', padding: 15 }}>No se encontraron ingresos.</Text>
                        ) : (
                          ingressHistory.map(item => {
                            const recId = item.ingress_id ?? item.id;
                            const prodNameStr = item.product_name || item.name || `Producto #${item.product_id}`;
                            const eanVal = item.barcode || 'Sin EAN';
                            const categoryVal = item.category || 'Varios';
                            
                            // CORRECCIÓN 3: Obtener marca de forma segura desde el producto si item.brand no existe
                            const matchedProdForBrand = products.find(p => p.id === item.product_id);
                            const brandVal = item.brand || matchedProdForBrand?.brand || null;

                            const qtyVal = item.quantity ?? '-';
                            const unitVal = item.unit_type || 'unid';
                            const costVal = formatMoney(item.unit_cost ?? item.cost_price ?? 0);
                            const supplierVal = item.supplier || 'Desconocido';
                            const lotVal = item.lot_code ?? (item.lot_number || null);
                            const expVal = item.expiration_date ? (item.expiration_date.includes('-') && item.expiration_date.split('-')[0].length === 4 ? `${item.expiration_date.split('T')[0].split('-')[2]}/${item.expiration_date.split('T')[0].split('-')[1]}/${item.expiration_date.split('T')[0].split('-')[0]}` : item.expiration_date) : 'Sin vencimiento';
                            
                            // Fecha de ingreso
                            let dateVal = '-';
                            const dateValRaw = item.received_at_formatted || item.received_at || item.created_at;
                            if (item.received_at_formatted) {
                              dateVal = item.received_at_formatted;
                            } else if (dateValRaw) {
                              const dt = new Date(dateValRaw);
                              if (!isNaN(dt.getTime())) {
                                const day = String(dt.getDate()).padStart(2, '0');
                                const month = String(dt.getMonth() + 1).padStart(2, '0');
                                const year = dt.getFullYear();
                                const hours = String(dt.getHours()).padStart(2, '0');
                                const mins = String(dt.getMinutes()).padStart(2, '0');
                                dateVal = `${day}/${month}/${year} · ${hours}:${mins} hs`;
                              } else {
                                dateVal = dateValRaw;
                              }
                            }

                            // CORRECCIÓN 2: Buscar precio actual en products mediante product.id === item.product_id
                            const matchedProduct = products.find(p => p.id === item.product_id);
                            const currentPriceVal = matchedProduct ? (matchedProduct.branch_price ?? matchedProduct.price_per_unit) : null;
                            const branchPriceStr = currentPriceVal != null ? formatMoney(currentPriceVal) : 'No disponible';

                            return (
                              <View key={recId} style={{ backgroundColor: '#f8f9fa', padding: 12, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#dee2e6' }}>
                                <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#222', marginBottom: 2 }}>{prodNameStr}</Text>
                                <Text style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>{eanVal} · {categoryVal}{brandVal ? ` · ${brandVal}` : ''}</Text>
                                <Text style={{ fontSize: 12, color: '#333', marginBottom: 8, fontWeight: '600' }}>Ingreso #{recId} · {dateVal}</Text>

                                <Text style={{ fontSize: 13, color: '#222', marginBottom: 2 }}>{qtyVal} {unitVal}</Text>
                                <Text style={{ fontSize: 13, color: '#222', marginBottom: 2 }}>Costo: {costVal} c/u</Text>
                                <Text style={{ fontSize: 13, color: '#222', marginBottom: 2 }}>Proveedor: {supplierVal}</Text>
                                <Text style={{ fontSize: 13, color: '#222', marginBottom: 2 }}>Vencimiento: {expVal}</Text>
                                <Text style={{ fontSize: 13, color: '#222', marginBottom: 4 }}>Precio actual: {branchPriceStr}</Text>
                                {lotVal && <Text style={{ fontSize: 11, color: '#777', fontStyle: 'italic', marginBottom: 6 }}>Lote: {lotVal}</Text>}

                                <TouchableOpacity style={[styles.buttonPrimary, { backgroundColor: '#fd7e14', marginTop: 6 }]} onPress={() => beginIngressCorrection(item)}>
                                  <Text style={styles.buttonText}>✏️ Editar / corregir</Text>
                                </TouchableOpacity>
                              </View>
                            );
                          })
                        )}
                      </>
                    )}
                  </View>
                )}
              </>
            )}

            {/* SECCIÓN DE EDICIÓN AMPLIADA (MODO EDICIÓN ACTIVO) */}
            {isAdminLevel && editingIngress && (
              <View style={styles.card}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#eee', pb: 8 }}>
                  <View>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#fd7e14' }}>Editar ingreso #{editingIngress.ingress_id ?? editingIngress.id}</Text>
                    <Text style={{ fontSize: 13, color: '#555', fontWeight: '600' }}>Producto: {editProdName || editingIngress.product_name || editingIngress.name || 'Sin nombre'}</Text>
                  </View>
                  <TouchableOpacity style={{ backgroundColor: '#6c757d', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }} onPress={() => setEditingIngress(null)}>
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>← Volver al historial</Text>
                  </TouchableOpacity>
                </View>

                {/* BLOQUE A: Datos del producto */}
                <View style={{ backgroundColor: '#f8f9fa', padding: 12, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#e9ecef' }}>
                  <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#007bff', marginBottom: 10 }}>📦 Datos del producto</Text>

                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#444', marginBottom: 2 }}>Nombre</Text>
                  <TextInput style={styles.input} placeholder="Nombre del producto" value={editProdName} onChangeText={setEditProdName} />

                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#444', marginBottom: 2 }}>Marca</Text>
                  <TextInput style={styles.input} placeholder="Marca" value={editProdBrand} onChangeText={setEditProdBrand} />

                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#444', marginBottom: 2 }}>Categoría</Text>
                  <TextInput style={styles.input} placeholder="Categoría" value={editProdCategory} onChangeText={setEditProdCategory} />

                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#444', marginBottom: 2 }}>EAN / barcode</Text>
                  <TextInput style={styles.input} placeholder="EAN" value={editProdBarcode} onChangeText={setEditProdBarcode} keyboardType="numeric" />

                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#444', marginBottom: 4 }}>Tipo de unidad</Text>
                  <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                    {['unid', 'kg'].map(t => (
                      <TouchableOpacity 
                        key={t} 
                        style={[styles.typeBtn, { marginRight: 8 }, editProdUnitType === t && { backgroundColor: '#007bff' }]} 
                        onPress={() => setEditProdUnitType(t)}
                      >
                        <Text style={{ color: editProdUnitType === t ? '#fff' : '#333', fontWeight: 'bold' }}>
                          {t === 'kg' ? '⚖ kg' : '📦 unid'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#444', marginBottom: 4 }}>Requiere vencimiento</Text>
                  <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                    <TouchableOpacity 
                      style={[styles.typeBtn, !editProdRequiresExpiration && styles.typeBtnActive]} 
                      onPress={() => setEditProdRequiresExpiration(false)}
                    >
                      <Text style={{ color: !editProdRequiresExpiration ? '#fff' : '#333', fontWeight: 'bold' }}>No</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.typeBtn, editProdRequiresExpiration && styles.typeBtnActive, { marginLeft: 8 }]} 
                      onPress={() => setEditProdRequiresExpiration(true)}
                    >
                      <Text style={{ color: editProdRequiresExpiration ? '#fff' : '#333', fontWeight: 'bold' }}>Sí</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#444', marginBottom: 2 }}>
                    {branchId === 2 ? "Precio de venta — Feria Damyale" : "Precio de venta — Fiambrería Local"} ($)
                  </Text>
                  <TextInput style={styles.input} placeholder="Precio de venta" value={editBranchPrice} onChangeText={setEditBranchPrice} keyboardType="decimal-pad" />
                </View>

                {/* BLOQUE B: Datos de este ingreso */}
                <View style={{ backgroundColor: '#f8f9fa', padding: 12, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#e9ecef' }}>
                  <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#fd7e14', marginBottom: 10 }}>📥 Datos de este ingreso</Text>

                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#444', marginBottom: 2 }}>Cantidad</Text>
                  <TextInput style={styles.input} placeholder="Cantidad" value={editIngressQty} onChangeText={setEditIngressQty} keyboardType="decimal-pad" />

                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#444', marginBottom: 2 }}>Costo de compra ($)</Text>
                  <TextInput style={styles.input} placeholder="Costo" value={editIngressCost} onChangeText={setEditIngressCost} keyboardType="decimal-pad" />

                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#444', marginBottom: 2 }}>Proveedor</Text>
                  <TextInput style={styles.input} placeholder="Proveedor" value={editIngressSupplier} onChangeText={setEditIngressSupplier} />

                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#444', marginBottom: 2 }}>Número de lote</Text>
                  <TextInput style={styles.input} placeholder="Número de lote" value={editIngressLot} onChangeText={setEditIngressLot} />

                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#444', marginBottom: 2 }}>Vencimiento (DD/MM/AAAA)</Text>
                  <TextInput 
                    style={styles.input} 
                    placeholder="DD/MM/AAAA" 
                    value={editIngressExpiration} 
                    maxLength={10}
                    onChangeText={(val) => setEditIngressExpiration(applyDateMask(val))} 
                    keyboardType="number-pad" 
                  />
                </View>

                {/* MOTIVO Y AUDITORÍA */}
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#d32f2f', marginBottom: 4 }}>Motivo obligatorio de la corrección *</Text>
                <TextInput style={styles.inputHighlight} placeholder="Detallá el motivo de la corrección..." value={editIngressReason} onChangeText={setEditIngressReason} />

                <TouchableOpacity style={[styles.buttonSuccess, { backgroundColor: '#28a745', marginTop: 10 }]} onPress={saveIngressCorrection} disabled={loading}>
                  <Text style={styles.buttonText}>💾 Guardar corrección auditada</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.buttonPrimary, { backgroundColor: '#6c757d', marginTop: 8 }]} onPress={() => setEditingIngress(null)}>
                  <Text style={styles.buttonText}>← Volver al historial</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        )}

        {/* GESTIÓN DE PERMISOS GRANULARES */}
        {currentTab === 'permisos' && isAdminLevel && (
          <ScrollView contentContainerStyle={styles.scrollPadding}>
            <Text style={styles.sectionTitle}>👥 Permisos por Módulo y Roles</Text>

            <View style={styles.card}>
              <Text style={styles.subSectionTitle}>Registrar Nuevo Usuario</Text>
              <TextInput style={styles.input} placeholder="Nombre Completo" value={newUserName} onChangeText={setNewUserName} />
              <TextInput style={styles.input} placeholder="Correo Electrónico" value={newUserEmail} onChangeText={setNewUserEmail} autoCapitalize="none" />
              <TextInput style={styles.input} placeholder="Contraseña" secureTextEntry value={newUserPass} onChangeText={setNewUserPass} />
              <TouchableOpacity style={styles.buttonPrimary} onPress={handleCreateUser} disabled={loading}>
                <Text style={styles.buttonText}>+ Registrar Usuario</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.subSectionTitle}>Acceso a Módulos y Roles</Text>
            {usersList.map(u => (
              <View key={u.id} style={styles.card}>
                <View style={{ marginBottom: 10 }}>
                  <Text
                    style={{ fontWeight: 'bold', fontSize: 16, flexShrink: 1 }}
                    numberOfLines={2}
                  >
                    {u.email?.toLowerCase() === 'admin@fiambreria.com'
                      ? '🐍 SolidSnake · Admin Maestro'
                      : u.name}
                  </Text>

                  {u.email?.toLowerCase() !== 'admin@fiambreria.com' && (
                    <Text style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                      {u.email}
                    </Text>
                  )}
                </View>

                {u.email?.toLowerCase() === 'admin@fiambreria.com' ? (
                  <View style={{
                    backgroundColor: '#212529',
                    paddingVertical: 9,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    marginBottom: 10
                  }}>
                    <Text style={{ color: '#fff', fontWeight: 'bold', textAlign: 'center' }}>
                      🛡 ADMIN MAESTRO · Acceso a ambas sucursales
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 5 }}>
                      Rol del usuario
                    </Text>

                    <View style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      marginBottom: 12
                    }}>
                      <TouchableOpacity
                        style={[
                          styles.roleBtn,
                          u.role === 'superadmin' && styles.roleBtnActiveAdmin,
                          { marginRight: 6, marginBottom: 6 }
                        ]}
                        onPress={() => handleRoleChange(u, 'superadmin')}
                      >
                        <Text style={{
                          fontSize: 10,
                          fontWeight: 'bold',
                          color: u.role === 'superadmin' ? '#fff' : '#333'
                        }}>
                          SUPERADMIN
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.roleBtn,
                          u.role === 'dueno' && styles.roleBtnActiveDueno,
                          { marginRight: 6, marginBottom: 6 }
                        ]}
                        onPress={() => handleRoleChange(u, 'dueno')}
                      >
                        <Text style={{
                          fontSize: 10,
                          fontWeight: 'bold',
                          color: u.role === 'dueno' ? '#fff' : '#333'
                        }}>
                          DUEÑO
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.roleBtn,
                          u.role === 'vendedor' && styles.roleBtnActiveUser,
                          { marginBottom: 6 }
                        ]}
                        onPress={() => handleRoleChange(u, 'vendedor')}
                      >
                        <Text style={{
                          fontSize: 10,
                          fontWeight: 'bold',
                          color: u.role === 'vendedor' ? '#fff' : '#333'
                        }}>
                          EMPLEADO
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 5 }}>
                      Sucursal de trabajo
                    </Text>

                    <View style={{
                      flexDirection: 'row',
                      marginBottom: 12
                    }}>
                      <TouchableOpacity
                        style={[
                          styles.badgeBtn,
                          Number(u.branch_id || 1) === 1 && styles.badgeBtnActive,
                          { flex: 1, marginRight: 5 }
                        ]}
                        onPress={() => handleUserBranchChange(u, 1)}
                      >
                        <Text style={{
                          fontSize: 11,
                          fontWeight: 'bold',
                          textAlign: 'center',
                          color: Number(u.branch_id || 1) === 1 ? '#fff' : '#333'
                        }}>
                          🍖 Fiambrería
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.badgeBtn,
                          Number(u.branch_id || 1) === 2 && styles.badgeBtnActive,
                          { flex: 1, marginLeft: 5 }
                        ]}
                        onPress={() => handleUserBranchChange(u, 2)}
                      >
                        <Text style={{
                          fontSize: 11,
                          fontWeight: 'bold',
                          textAlign: 'center',
                          color: Number(u.branch_id || 1) === 2 ? '#fff' : '#333'
                        }}>
                          🎪 Feria Damyale
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                <View style={{ borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 8 }}>
                    <TouchableOpacity style={[styles.badgeBtn, u.can_edit_records && styles.badgeBtnActiveEdit, { width: '100%', marginBottom: 6 }]} onPress={() => handleToggleModulePermission(u, 'can_edit_records')}>
                      <Text style={{ color: u.can_edit_records ? '#fff' : '#333', fontSize: 11, fontWeight: 'bold' }}>
                        ✏ Permiso para Modificar / Cancelar Registros: {u.can_edit_records ? 'SÍ' : 'NO'}
                      </Text>
                    </TouchableOpacity>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                      <TouchableOpacity style={[styles.badgeBtn, u.can_kpis && styles.badgeBtnActive, { width: '48%', marginBottom: 6 }]} onPress={() => handleToggleModulePermission(u, 'can_kpis')}>
                        <Text style={{ color: u.can_kpis ? '#fff' : '#333', fontSize: 11, fontWeight: 'bold' }}>📈 KPIs {u.can_kpis ? '✓' : '✗'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.badgeBtn, u.can_preventa && styles.badgeBtnActive, { width: '48%', marginBottom: 6 }]} onPress={() => handleToggleModulePermission(u, 'can_preventa')}>
                        <Text style={{ color: u.can_preventa ? '#fff' : '#333', fontSize: 11, fontWeight: 'bold' }}>🛒 Pre-venta {u.can_preventa ? '✓' : '✗'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.badgeBtn, u.can_caja && styles.badgeBtnActive, { width: '48%', marginBottom: 6 }]} onPress={() => handleToggleModulePermission(u, 'can_caja')}>
                        <Text style={{ color: u.can_caja ? '#fff' : '#333', fontSize: 11, fontWeight: 'bold' }}>💳 Caja {u.can_caja ? '✓' : '✗'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.badgeBtn, u.can_stock && styles.badgeBtnActive, { width: '48%', marginBottom: 6 }]} onPress={() => handleToggleModulePermission(u, 'can_stock')}>
                        <Text style={{ color: u.can_stock ? '#fff' : '#333', fontSize: 11, fontWeight: 'bold' }}>📦 Inventario {u.can_stock ? '✓' : '✗'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.badgeBtn, u.can_ingreso && styles.badgeBtnActive, { width: '48%', marginBottom: 6 }]} onPress={() => handleToggleModulePermission(u, 'can_ingreso')}>
                        <Text style={{ color: u.can_ingreso ? '#fff' : '#333', fontSize: 11, fontWeight: 'bold' }}>📥 Ingresos {u.can_ingreso ? '✓' : '✗'}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={[styles.badgeBtn, u.can_alertas && styles.badgeBtnActive, { width: '48%', marginBottom: 6 }]} onPress={() => handleToggleModulePermission(u, 'can_alertas')}>
                        <Text style={{ color: u.can_alertas ? '#fff' : '#333', fontSize: 11, fontWeight: 'bold' }}>🚨 Alertas {u.can_alertas ? '✓' : '✗'}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={[styles.badgeBtn, u.can_rrhh && styles.badgeBtnActive, { width: '48%', marginBottom: 6 }]} onPress={() => handleToggleModulePermission(u, 'can_rrhh')}>
                        <Text style={{ color: u.can_rrhh ? '#fff' : '#333', fontSize: 11, fontWeight: 'bold' }}>👨‍💼 RRHH {u.can_rrhh ? '✓' : '✗'}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={[styles.badgeBtn, u.can_mrp && styles.badgeBtnActive, { width: '48%', marginBottom: 6 }]} onPress={() => handleToggleModulePermission(u, 'can_mrp')}>
                        <Text style={{ color: u.can_mrp ? '#fff' : '#333', fontSize: 11, fontWeight: 'bold' }}>📊 MRP {u.can_mrp ? '✓' : '✗'}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={[styles.badgeBtn, u.can_verificacion && styles.badgeBtnActive, { width: '48%', marginBottom: 6 }]} onPress={() => handleToggleModulePermission(u, 'can_verificacion')}>
                        <Text style={{ color: u.can_verificacion ? '#fff' : '#333', fontSize: 11, fontWeight: 'bold' }}>🔍 Arqueo {u.can_verificacion ? '✓' : '✗'}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={[styles.badgeBtn, u.can_carteleria && styles.badgeBtnActive, { width: '48%', marginBottom: 6 }]} onPress={() => handleToggleModulePermission(u, 'can_carteleria')}>
                        <Text style={{ color: u.can_carteleria ? '#fff' : '#333', fontSize: 11, fontWeight: 'bold' }}>🪧 Cartelería {u.can_carteleria ? '✓' : '✗'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* MODAL DE ADMINISTRACIÓN DE PROMOCIONES */}
      {showPromotionAdmin && isAdminLevel && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{promoAdminMode === 'list' ? '⚙️ Administrar promociones' : (editingPromotionId ? 'Editar Promoción' : 'Nueva Promoción')}</Text>
              <TouchableOpacity onPress={() => {
                if (promoAdminMode === 'form') { setEditingPromotionId(null); setPromoAdminMode('list'); }
                else setShowPromotionAdmin(false);
              }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#dc3545' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {promoAdminMode === 'list' ? (
            <ScrollView style={{ maxHeight: 450 }}>
              <TouchableOpacity style={[styles.buttonSuccess, { marginTop: 0, marginBottom: 10 }]} onPress={openCreatePromotionModal}>
                <Text style={styles.buttonText}>+ Nueva promoción</Text>
              </TouchableOpacity>

              {promoAdminLoading && <ActivityIndicator size="small" color="#6f42c1" style={{ marginVertical: 10 }} />}
              {!promoAdminLoading && adminPromotions.length === 0 && (
                <Text style={styles.emptyText}>No hay promociones cargadas.</Text>
              )}

              {adminPromotions.map(promo => {
                const isActive = promo.active === true;
                return (
                  <View key={promo.id} style={[styles.card, { borderWidth: 1, borderColor: isActive ? '#6f42c1' : '#adb5bd', opacity: isActive ? 1 : 0.85 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 15, fontWeight: 'bold', color: isActive ? '#6f42c1' : '#6c757d', flex: 1 }}>🎁 {promo.name}</Text>
                      <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#fff', backgroundColor: isActive ? '#28a745' : '#6c757d', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>{isActive ? 'ACTIVA' : 'INACTIVA'}</Text>
                    </View>
                    {promo.description ? <Text style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{promo.description}</Text> : null}

                    {PROMO_BRANCH_IDS.map(bId => {
                      const cfg = promo.branches?.[bId];
                      const bName = bId === 1 ? 'Fiambrería Local' : 'Feria Damyale';
                      return (
                        <Text key={bId} style={{ fontSize: 11, color: '#333', marginTop: 2 }}>
                          Suc. {bId} ({bName}): {cfg ? `${formatMoney(cfg.promo_price ?? 0)} · ${cfg.enabled ? 'Habilitada' : 'Deshabilitada'}` : 'Sin configurar'}
                        </Text>
                      );
                    })}

                    {(promo.items || []).map((ci, idx) => (
                      <Text key={idx} style={{ fontSize: 11, color: '#555' }}>• {formatQuantityVisual(ci.included_qty, ci.unit_type)} {ci.product_name || ci.name}</Text>
                    ))}

                    <View style={{ flexDirection: 'row', marginTop: 8 }}>
                      <TouchableOpacity style={[styles.typeBtn, { marginRight: 6, backgroundColor: '#007bff' }]} onPress={() => openEditPromotionModal(promo)} disabled={loading}>
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>✏️ Editar</Text>
                      </TouchableOpacity>
                      {isActive ? (
                        <TouchableOpacity style={[styles.typeBtn, { backgroundColor: '#dc3545' }]} onPress={() => handleDeleteOrDisablePromotion(promo)} disabled={loading}>
                          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>⛔ Dar de baja</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity style={[styles.typeBtn, { backgroundColor: '#28a745' }]} onPress={() => handleReactivatePromotion(promo)} disabled={loading}>
                          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>♻️ Reactivar</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            ) : (
            <ScrollView style={{ maxHeight: 400 }}>
              <TouchableOpacity onPress={() => { setEditingPromotionId(null); setPromoAdminMode('list'); }} style={{ marginBottom: 8 }}>
                <Text style={{ color: '#007bff', fontWeight: 'bold' }}>← Volver al listado</Text>
              </TouchableOpacity>
              <TextInput style={styles.input} placeholder="Nombre de la promoción" value={promoFormName} onChangeText={setPromoFormName} />
              <TextInput style={styles.input} placeholder="Descripción (opcional)" value={promoFormDesc} onChangeText={setPromoFormDesc} />

              <Text style={{ fontWeight: 'bold', marginTop: 8, marginBottom: 4 }}>Componentes:</Text>
              {promoFormItems.map((item, idx) => (
                <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8f9fa', padding: 8, borderRadius: 6, marginBottom: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: 'bold', fontSize: 12 }}>{item.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: '#555' }}>Incluye: </Text>
                      <TextInput
                        style={[styles.input, { width: 80, marginBottom: 0, paddingVertical: 2, fontSize: 12 }]}
                        keyboardType="numeric"
                        value={String(item.included_qty ?? '')}
                        onChangeText={(v) => updatePromoItemQtyInDraft(item.product_id, v)}
                      />
                      <Text style={{ fontSize: 11, color: '#555', marginLeft: 4 }}>{item.unit_type === 'kg' ? 'kg' : 'unid'}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => removePromoItemFromDraft(item.product_id)}>
                    <Text style={{ color: '#dc3545', fontWeight: 'bold' }}>Quitar</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <View style={{ backgroundColor: '#e9ecef', padding: 10, borderRadius: 8, marginBottom: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>Agregar componente:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
                  {products.filter(p => p.is_active).map(prod => (
                    <TouchableOpacity 
                      key={prod.id} 
                      style={[styles.typeBtn, { marginRight: 6, paddingHorizontal: 10 }, Number(promoItemProductId) === prod.id && styles.typeBtnActive]}
                      onPress={() => setPromoItemProductId(String(prod.id))}
                    >
                      <Text style={{ fontSize: 11, color: Number(promoItemProductId) === prod.id ? '#fff' : '#333' }}>{prod.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TextInput style={styles.input} placeholder="Cantidad incluida (ej: 0.250 o 1)" keyboardType="numeric" value={promoItemQty} onChangeText={setPromoItemQty} />
                <TouchableOpacity style={[styles.buttonPrimary, { marginTop: 0 }]} onPress={addPromoItemToDraft}>
                  <Text style={styles.buttonText}>+ Agregar componente</Text>
                </TouchableOpacity>
              </View>

              <Text style={{ fontWeight: 'bold', marginTop: 8, marginBottom: 4 }}>Precios y Habilitación por Sucursal:</Text>
              
              <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#555' }}>Sucursal 1 (Fiambrería Local)</Text>
              <TextInput style={styles.input} placeholder="Precio promoción Sucursal 1" keyboardType="numeric" value={promoFormPriceB1} onChangeText={setPromoFormPriceB1} />
              
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <TouchableOpacity 
                  style={[styles.typeBtn, promoFormEnabledB1 && { backgroundColor: '#28a745' }]} 
                  onPress={() => setPromoFormEnabledB1(!promoFormEnabledB1)}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>{promoFormEnabledB1 ? 'Sucursal 1 Habilitada' : 'Sucursal 1 Deshabilitada'}</Text>
                </TouchableOpacity>
              </View>

              <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#555' }}>Sucursal 2 (Feria Damyale)</Text>
              <TextInput style={styles.input} placeholder="Precio promoción Sucursal 2" keyboardType="numeric" value={promoFormPriceB2} onChangeText={setPromoFormPriceB2} />

              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <TouchableOpacity 
                  style={[styles.typeBtn, promoFormEnabledB2 && { backgroundColor: '#28a745' }]} 
                  onPress={() => setPromoFormEnabledB2(!promoFormEnabledB2)}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>{promoFormEnabledB2 ? 'Sucursal 2 Habilitada' : 'Sucursal 2 Deshabilitada'}</Text>
                </TouchableOpacity>
              </View>

              <Text style={{ fontWeight: 'bold', marginTop: 8, marginBottom: 4 }}>Estado general:</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <TouchableOpacity
                  style={[styles.typeBtn, { backgroundColor: promoFormEnabled ? '#28a745' : '#6c757d' }]}
                  onPress={() => setPromoFormEnabled(!promoFormEnabled)}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>{promoFormEnabled ? 'Promoción ACTIVA' : 'Promoción INACTIVA'}</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={[styles.buttonSuccess, { marginTop: 15 }]} onPress={handleSavePromotion} disabled={loading}>
                <Text style={styles.buttonText}>💾 Guardar Promoción</Text>
              </TouchableOpacity>
            </ScrollView>
            )}
          </View>
        </View>
      )}

      {/* MODAL DE HISTORIAL DE VENTAS */}
      {showSalesHistoryModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold' }}>🧾 Historial de Ventas</Text>
              <TouchableOpacity onPress={() => setShowSalesHistoryModal(false)}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#dc3545' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput style={styles.input} placeholder="Buscar por N°, producto o vendedor..." value={historySearch} onChangeText={setHistorySearch} />
            <View style={{ flexDirection: 'row', marginBottom: 8 }}>
              <TextInput style={[styles.input, { flex: 1, marginRight: 4, marginBottom: 0 }]} placeholder="Desde YYYY-MM-DD" value={historyDateFrom} onChangeText={setHistoryDateFrom} />
              <TextInput style={[styles.input, { flex: 1, marginLeft: 4, marginBottom: 0 }]} placeholder="Hasta YYYY-MM-DD" value={historyDateTo} onChangeText={setHistoryDateTo} />
            </View>
            <TouchableOpacity style={[styles.buttonPrimary, { marginTop: 0, marginBottom: 10 }]} onPress={searchSalesHistory}>
              <Text style={styles.buttonText}>🔍 Buscar</Text>
            </TouchableOpacity>

            <ScrollView style={{ maxHeight: 300 }}>
              {salesHistoryList.length === 0 ? (
                <Text style={{ textAlign: 'center', color: '#888', padding: 20 }}>No se encontraron ventas.</Text>
              ) : (
                salesHistoryList.map(s => (
                  <TouchableOpacity key={s.id} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#fff' }} onPress={() => handleSelectHistoricalSale(s)}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontWeight: 'bold' }}>Venta #{s.id}</Text>
                      <Text style={{ fontWeight: 'bold', color: '#28a745' }}>{formatMoney(s.total_amount)}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: '#666' }}>{s.created_at ? new Date(s.created_at).toLocaleString('es-AR') : ''} · {s.payment_method} · {s.sold_by || 'Mostrador'}</Text>
                    <Text style={{ fontSize: 10, color: '#007bff', marginTop: 2 }}>Items: {s.items_count ?? '-'} — Tocar para ver / reimprimir</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {/* NAVBAR NAVEGABLE COMPLETO */}
      <View style={styles.navbarWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navbarContent}>
          {canFairPlanner && (
            <TouchableOpacity style={[styles.navBtn, currentTab === 'feria' && styles.navActive]} onPress={() => handleTabChange('feria')}>
              <Text style={styles.navIcon}>🎪</Text>
              <Text style={styles.navText}>Feria</Text>
            </TouchableOpacity>
          )}

          {(canKPIs || isAdminLevel) && (
            <TouchableOpacity style={[styles.navBtn, currentTab === 'kpis' && styles.navActive]} onPress={() => handleTabChange('kpis')}>
              <Text style={styles.navIcon}>📈</Text>
              <Text style={styles.navText}>KPIs</Text>
            </TouchableOpacity>
          )}

          {(canPreventa || isAdminLevel) && (
            <TouchableOpacity style={[styles.navBtn, currentTab === 'preventa' && styles.navActive]} onPress={() => handleTabChange('preventa')}>
              <Text style={styles.navIcon}>🛒</Text>
              <Text style={styles.navText}>Ventas</Text>
            </TouchableOpacity>
          )}

          {(canCaja || isAdminLevel) && (
            <TouchableOpacity style={[styles.navBtn, currentTab === 'caja' && styles.navActive]} onPress={() => handleTabChange('caja')}>
              <Text style={styles.navIcon}>💳</Text>
              <Text style={styles.navText}>Caja</Text>
            </TouchableOpacity>
          )}

          {(canCarteleria || isAdminLevel) && (
            <TouchableOpacity style={[styles.navBtn, currentTab === 'carteleria' && styles.navActive]} onPress={() => handleTabChange('carteleria')}>
              <Text style={styles.navIcon}>🪧</Text>
              <Text style={styles.navText}>Carteles</Text>
            </TouchableOpacity>
          )}

          {(canAlertas || isAdminLevel) && (
            <TouchableOpacity style={[styles.navBtn, currentTab === 'alertas' && styles.navActive]} onPress={() => handleTabChange('alertas')}>
              <Text style={styles.navIcon}>🚨</Text>
              <Text style={styles.navText}>Alertas</Text>
            </TouchableOpacity>
          )}

          {(canRRHH || isAdminLevel) && (
            <TouchableOpacity style={[styles.navBtn, currentTab === 'rrhh' && styles.navActive]} onPress={() => handleTabChange('rrhh')}>
              <Text style={styles.navIcon}>👨‍💼</Text>
              <Text style={styles.navText}>RRHH</Text>
            </TouchableOpacity>
          )}

          {(canMRP || isAdminLevel) && (
            <TouchableOpacity style={[styles.navBtn, currentTab === 'mrp' && styles.navActive]} onPress={() => handleTabChange('mrp')}>
              <Text style={styles.navIcon}>📊</Text>
              <Text style={styles.navText}>MRP</Text>
            </TouchableOpacity>
          )}

          {(canVerificacion || isAdminLevel) && (
            <TouchableOpacity style={[styles.navBtn, currentTab === 'verificacion' && styles.navActive]} onPress={() => handleTabChange('verificacion')}>
              <Text style={styles.navIcon}>🔍</Text>
              <Text style={styles.navText}>Arqueo</Text>
            </TouchableOpacity>
          )}

          {(canStock || isAdminLevel) && (
            <TouchableOpacity style={[styles.navBtn, currentTab === 'inventario' && styles.navActive]} onPress={() => handleTabChange('inventario')}>
              <Text style={styles.navIcon}>📦</Text>
              <Text style={styles.navText}>Stock</Text>
            </TouchableOpacity>
          )}

          {(canIngreso || isAdminLevel) && (
            <TouchableOpacity style={[styles.navBtn, currentTab === 'ingresos' && styles.navActive]} onPress={() => handleTabChange('ingresos')}>
              <Text style={styles.navIcon}>📥</Text>
              <Text style={styles.navText}>Ingresos</Text>
            </TouchableOpacity>
          )}

          {isAdminLevel && (
            <TouchableOpacity style={[styles.navBtn, currentTab === 'permisos' && styles.navActive]} onPress={() => handleTabChange('permisos')}>
              <Text style={styles.navIcon}>👥</Text>
              <Text style={styles.navText}>Permisos</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#1a1a1a', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 25 : 0 },
  header: { backgroundColor: '#1a1a1a', padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' },
  headerLeft: { flex: 1, minWidth: 180, marginRight: 8, marginBottom: 4 },
  headerRight: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  branchHeader: { color:'#7CFC98', fontSize:12, fontWeight:'bold', marginTop:2 },
  changeBranchBtn: { backgroundColor:'#343a40', paddingHorizontal:8, paddingVertical:4, borderRadius:6, marginRight:6, marginBottom:2 },
  changeBranchText: { color:'#fff', fontSize:10, fontWeight:'bold' },
  logoutBtn: { backgroundColor: '#2a2a2a', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 2 },
  branchSelectScreen: { flex:1, backgroundColor:'#f4f6f8', padding:24, justifyContent:'center', alignItems:'stretch' },
  branchSelectTitle: { fontSize:28, fontWeight:'bold', textAlign:'center', marginBottom:8, color:'#222' },
  branchSelectSubtitle: { fontSize:15, textAlign:'center', color:'#666', marginBottom:28 },
  branchBigButton: { padding:24, borderRadius:16, marginBottom:16, alignItems:'center', elevation:3 },
  branchLocalButton: { backgroundColor:'#28a745' },
  branchFairButton: { backgroundColor:'#6f42c1' },
  branchBigIcon: { fontSize:38, marginBottom:6 },
  branchBigTitle: { color:'#fff', fontSize:22, fontWeight:'bold' },
  branchBigSubtitle: { color:'#fff', fontSize:13, marginTop:3 },
  body: { flex: 1, backgroundColor: '#f4f6f8' },
  scrollPadding: { padding: 15, paddingBottom: 40 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  subSectionTitle: { fontSize: 14, fontWeight: 'bold', marginTop: 12, marginBottom: 8, color: '#444' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, marginBottom: 10 },
  searchInput: { backgroundColor: '#fff', borderWidth: 2, borderColor: '#007bff', padding: 12, borderRadius: 8, fontSize: 15, fontWeight: 'bold' },
  dropdownContainer: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#007bff', borderRadius: 8, marginTop: 4, marginBottom: 10, maxHeight: 200 },
  dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  inputHighlight: { backgroundColor: '#fff', borderWidth: 2, borderColor: '#007bff', padding: 12, borderRadius: 8, fontSize: 16, fontWeight: 'bold', color: '#007bff' },
  inputSmall: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc', padding: 6, borderRadius: 6, width: 65, textAlign: 'center', fontWeight: 'bold' },
  typeBtn: { flex: 1, padding: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, alignItems: 'center', backgroundColor: '#e9ecef' },
  typeBtnActive: { backgroundColor: '#007bff', borderColor: '#0056b3' },
  badgeBtn: { padding: 8, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, alignItems: 'center', backgroundColor: '#f8f9fa' },
  badgeBtnActive: { backgroundColor: '#28a745', borderColor: '#1e7e34' },
  badgeBtnActiveEdit: { backgroundColor: '#fd7e14', borderColor: '#e0670b' },
  buttonPrimary: { backgroundColor: '#007bff', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  buttonCamera: { backgroundColor: '#6f42c1', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  buttonSuccess: { backgroundColor: '#28a745', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  buttonDanger: { backgroundColor: '#dc3545', padding: 8, borderRadius: 6, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold', textAlign: 'center' },
  cameraContainer: { height: 200, borderRadius: 10, overflow: 'hidden', marginBottom: 15 },
  cartRow: { backgroundColor: '#fff', padding: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  totalBox: { backgroundColor: '#fff', padding: 15, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 2, borderTopColor: '#28a745', marginTop: 10 },
  preSaleBadge: { backgroundColor: '#e9ecef', padding: 12, borderRadius: 8, marginRight: 8, borderWidth: 1, borderColor: '#ccc' },
  preSaleBadgeActive: { backgroundColor: '#007bff', borderColor: '#0056b3' },
  qtyBtn: { backgroundColor: '#007bff', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  payBtn: { flex: 0.31, padding: 10, backgroundColor: '#6c757d', borderRadius: 8, alignItems: 'center' },
  payBtnActive: { backgroundColor: '#007bff' },
  card: { backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 15 },
  changeCard: { backgroundColor: '#e8f4f8', padding: 15, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#b8daff' },
  changeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#bee5eb' },
  emptyText: { color: '#888', fontStyle: 'italic' },
  loginCard: { backgroundColor: '#fff', margin: 20, padding: 20, borderRadius: 10 },
  appTitle: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 15 },
  roleBtn: { padding: 4, borderWidth: 1, borderColor: '#ccc', borderRadius: 4, backgroundColor: '#e9ecef' },
  roleBtnActiveAdmin: { backgroundColor: '#dc3545', borderColor: '#bd2130' },
  roleBtnActiveDueno: { backgroundColor: '#6f42c1', borderColor: '#593196' },
  roleBtnActiveUser: { backgroundColor: '#007bff', borderColor: '#0056b3' },
  navbarWrapper: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#ddd', paddingVertical: 6, paddingBottom: Platform.OS === 'android' ? 32 : 12 },
  navbarContent: { paddingHorizontal: 10, alignItems: 'center' },
  navBtn: { paddingHorizontal: 14, paddingVertical: 6, marginHorizontal: 4, borderRadius: 8, alignItems: 'center', backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#eee' },
  navActive: { backgroundColor: '#007bff', borderColor: '#0056b3' },
  navIcon: { fontSize: 16, marginBottom: 2 },
  navText: { color: '#333', fontWeight: 'bold', fontSize: 11 },
  cashOpenHeaderCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#d4edda', padding: 10, borderRadius: 8, marginBottom: 15, flexWrap: 'wrap' },
  arqueoBtnStyle: { backgroundColor: '#dc3545', padding: 8, borderRadius: 6, marginTop: 4 },
  wrapButtonsRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8, marginHorizontal: -3 },
  wrapBtnItem: { flexBasis: '31%', flexGrow: 1, margin: 3, padding: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, alignItems: 'center', backgroundColor: '#e9ecef', justifyContent: 'center' },
  exportBtnItem: { flexBasis: '48%', flexGrow: 1, margin: 3, padding: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20, zIndex: 1000 },
  modalContent: { backgroundColor: '#fff', borderRadius: 10, padding: 15, maxHeight: '80%' }
});
