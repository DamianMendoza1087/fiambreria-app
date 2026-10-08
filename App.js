import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator, Platform, StatusBar } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { loginUser, fetchProducts, createProduct, updateProduct, deleteProduct, fetchUsers, createUser, updateUserPermissions, submitStockAudit, createPreSale, fetchPendingPreSales, deletePreSale, finalizeSale, fetchCashSessionStatus, openCashSession, closeCashSession, fetchCashAuditsByDate, fetchWorkLogs, compareEmployeesMetrics, fetchMRPStats, fetchSystemAlerts, fetchProductLots, fetchKPIsDashboard, fetchProfitability, fetchMasterProductByBarcode, fetchProductByBarcode, searchProducts, createProductMaster, createIngress, fetchIngresses, updateIngress, createCashMovement, fetchCashMovements, createStockLoss, startHRShift, endHRShift, fetchActiveHRShifts, fetchHRWorkLogs, compareHR, setUserEnabled, actOnAlert, fetchAlertHistory, updateReplenishmentPolicy , fetchBranchProductsAdmin, configureBranchProduct, removeBranchProduct, fetchLatestProductAudit } from './api';

export default function App() {
  const loadBranchAdminProducts = async () => {
    if (!branchId) return;
    try {
      setLoading(true);
      const data = await fetchBranchProductsAdmin(branchId);
      setBranchAdminProducts(data);
      const drafts = {};
      data.forEach(x => {
        drafts[x.product_id] = String(x.branch_price ?? x.base_price ?? '');
      });
      setBranchPriceDrafts(drafts);
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

      await configureBranchProduct(branchId, item.product_id, {
        price_per_unit: price,
        is_available: changes.is_available ?? item.is_available,
        is_exclusive: changes.is_exclusive ?? item.is_exclusive
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

  const disableBranchProduct = async (item) => {
    try {
      setLoading(true);
      await removeBranchProduct(branchId, item.product_id);
      await loadBranchAdminProducts();
      setProducts(await fetchProducts(branchId || 1));
    } catch (e) {
      alert(e.message || 'No se pudo retirar el producto');
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (value) => {
    const n=Number(value || 0);
    return '$'+n.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
  };
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [branchId, setBranchId] = useState(null);
  const [branchSelectorPending, setBranchSelectorPending] = useState(false);

  const branchName = branchId === 2 ? 'Feria Damyale' : 'Fiambrería Local';
  const isAdminLevel = userRole === 'masteradmin' || userRole === 'superadmin';
  const isMasterAdmin = userRole === 'masteradmin';

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

  const [currentTab, setCurrentTab] = useState('preventa');
  // Administración de catálogo por sucursal
  const [branchAdminProducts, setBranchAdminProducts] = useState([]);
  const [branchAdminSearch, setBranchAdminSearch] = useState('');
  const [branchPriceDrafts, setBranchPriceDrafts] = useState({});


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
  const [editingProductId, setEditingProductId] = useState(null);
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState('');
  const [prodCost, setProdCost] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodSupplier, setProdSupplier] = useState('');
  const [prodStock, setProdStock] = useState('');
  const [prodUnitType, setProdUnitType] = useState('unid');
  const [prodBarcode, setProdBarcode] = useState('');
  const [prodExpirationDate, setProdExpirationDate] = useState('');
  const [prodIsActive, setProdIsActive] = useState(true);
  const [ingressProductId, setIngressProductId] = useState(null);
  const [prodBrand, setProdBrand] = useState('');
  const [prodLotNumber, setProdLotNumber] = useState('');
  const [prodRequiresExpiration, setProdRequiresExpiration] = useState(false);
  const [ingressSearch, setIngressSearch] = useState('');
  const [ingressMatches, setIngressMatches] = useState([]);

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


  const loadInitialData = async () => {
    try {
      setProducts(await fetchProducts(branchId || 1));
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

  const handleTabChange = async (tabName) => {
    setCurrentTab(tabName);
    if (tabName === 'verificacion') loadCashAudits();
    else if (tabName === 'rrhh') loadHRData();
    else if (tabName === 'mrp') loadMRPData();
    else if (tabName === 'alertas') loadAlertsData();
    else if (tabName === 'kpis') loadKPIData();
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
      setCanEditRecords(res.can_edit_records);

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
          alert(`Producto reconocido: ${found.name}. Se habilitará en ${branchName || 'esta sucursal'} al guardar el ingreso.`);
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
    setIngressSearch(''); setIngressMatches([]);
  };

  const loadIngressHistory = async () => {
    try {
      setLoading(true);
      setIngressHistory(await fetchIngresses(null, branchId || 1));
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const beginIngressCorrection = (item) => {
    setEditingIngress(item);
    setEditIngressQty(String(item.quantity ?? ""));
    setEditIngressCost(String(item.cost_price ?? ""));
    setEditIngressSupplier(item.supplier || "");
    setEditIngressLot(item.lot_number || "");
    setEditIngressExpiration(item.expiration_date || "");
    setEditIngressReason("");
  };

  const saveIngressCorrection = async () => {
    if (!editingIngress) return;
    if (!editIngressReason.trim()) return alert("El motivo de la correccion es obligatorio.");

    const qty = parseFloat(String(editIngressQty).replace(",", "."));
    const cost = parseFloat(String(editIngressCost).replace(",", "."));

    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(cost) || cost < 0) {
      return alert("Cantidad o costo invalido.");
    }

    try {
      setLoading(true);
      await updateIngress(editingIngress.id, {
        quantity: qty,
        cost_price: cost,
        supplier: editIngressSupplier.trim() || null,
        lot_number: editIngressLot.trim() || null,
        expiration_date: editIngressExpiration.trim() || null,
        actor: email,
        reason: editIngressReason.trim()
      }, branchId || 1);
      alert("Ingreso corregido y auditado.");
      setEditingIngress(null);
      setEditIngressReason("");
      await loadIngressHistory();
      await loadInitialData();
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveIngressV2 = async () => {
    const qty=parseFloat((prodStock || '').replace(',','.')), cost=parseFloat((prodCost || '').replace(',','.')), price=parseFloat((prodPrice || '').replace(',','.'));
    if (!prodName.trim() || !Number.isFinite(qty) || qty<=0 || !Number.isFinite(cost) || cost<0 || !Number.isFinite(price)) return alert('Completá producto, costo, PVP y cantidad.');
    if (!ingressProductId && !prodCategory.trim()) return alert('Seleccioná o escribí una categoría.');
    if (prodRequiresExpiration && !prodExpirationDate.trim()) return alert('Este producto requiere fecha de vencimiento.');
    if (prodRequiresExpiration && !/^\d{2}-\d{2}-\d{4}$/.test(prodExpirationDate.trim())) return alert('Vencimiento invalido. Usa DD-MM-AAAA.');
    if (prodRequiresExpiration) {
      const [dd,mm,yyyy]=prodExpirationDate.trim().split('-').map(Number);
      const d=new Date(yyyy,mm-1,dd);
      if(d.getFullYear()!==yyyy || d.getMonth()!==mm-1 || d.getDate()!==dd) return alert('La fecha de vencimiento no existe.');
    }
    try {
      setLoading(true); let productId=ingressProductId;
      if (!productId) {
        const created=await createProductMaster({name:prodName.trim(),category:prodCategory.trim(),brand:prodBrand||null,barcode:prodBarcode.trim()||null,price_per_unit:price,unit_type:prodUnitType,requires_expiration:prodRequiresExpiration,replenishment_policy:'MRP',is_active:true}, branchId || 1);
        productId=created.id;
      }
      await createIngress({product_id:productId,supplier:prodSupplier||null,cost_price:cost,quantity:qty,lot_number:prodLotNumber||null,expiration_date:prodRequiresExpiration?prodExpirationDate:null,received_by:email,notes:'Ingreso desde App V2'}, branchId || 1);
      alert('Ingreso y lote registrados correctamente'); resetIngressForm(); await loadInitialData();
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
    if (!canEditRecords && userRole !== 'superadmin') return alert('⚠️ No tenés permiso para eliminar o cancelar registros.');
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

  const getCashierTotal = () => cashierCart.reduce((acc, i) => {
    const qtyVal = parseFloat(String(i.qty).replace(',', '.')) || 0;
    return acc + (i.price_per_unit * qtyVal);
  }, 0).toFixed(2);

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

  const handleFinalizeSale = async () => {
    if (!cashStatus.is_open) return alert('⚠️ Abrí la caja antes de procesar ventas.');
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

    if (paymentMethod === 'Efectivo') {
      cash = total;
      if ((parseFloat(cashTendered) || 0) < total) return alert(`⚠️ Dinero insuficiente`);
    } else if (paymentMethod === 'Mercado Pago') {
      mp = total;
    } else {
      mp = parseFloat(amountMP) || 0;
      if (mp > total) return alert(`⚠️ Monto MP supera el total`);
      cash = total - mp;
      if (cash > 0 && (parseFloat(cashTendered) || 0) < cash) return alert(`⚠️ Dinero insuficiente en efectivo`);
    }

    try {
      setLoading(true);
      await finalizeSale({
        presale_id: selectedPreSaleId,
        items: cashierCart.map(i => ({
          product_id: i.id,
          quantity: parseFloat(String(i.qty).replace(',', '.')) || 0
        })),
        total_amount: total,
        amount_cash: cash,
        amount_mp: mp,
        payment_method: paymentMethod,
        sold_by: email
      }, branchId || 1);
      alert(`💳 Venta procesada con éxito!\nVuelto: ${formatMoney(getChangeDue())}`);
      setSelectedPreSaleId(null); setCashierCart([]); setAmountMP(''); setCashTendered('');
      await loadInitialData();
    } catch (e) { alert('Error procesando venta'); }
    finally { setLoading(false); }
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

  const handleStartEditProduct = (prod) => {
    if (!canEditRecords && userRole !== 'superadmin') return alert('⚠️ No tenés permiso para editar registros.');
    setEditingProductId(prod.id);
    setProdName(prod.name);
    setProdCategory(prod.category || 'Varios');
    setProdCost(prod.cost_price ? String(prod.cost_price) : '0');
    setProdPrice(String(prod.price_per_unit));
    setProdSupplier(prod.supplier || '');
    setProdStock(String(prod.stock));
    setProdUnitType(prod.unit_type || 'unid');
    setProdBarcode(prod.barcode || '');
    setProdIsActive(prod.is_active);
    setProdExpirationDate('');
  };

  const handleCancelEditProduct = () => {
    setEditingProductId(null);
    setProdName(''); setProdCost(''); setProdPrice(''); setProdSupplier(''); setProdStock(''); setProdBarcode(''); setProdExpirationDate(''); setProdUnitType('unid'); setProdIsActive(true);
  };

  const handleSaveProduct = async () => {
    if (!prodName || !prodPrice || !prodStock) return alert('Completá nombre, precio PVP y stock');
    try {
      setLoading(true);
      const payload = {
        name: prodName,
        category: prodCategory,
        cost_price: parseFloat((prodCost || '0').replace(',', '.')),
        price_per_unit: parseFloat(prodPrice.replace(',', '.')),
        supplier: prodSupplier || null,
        unit_type: prodUnitType,
        stock: parseFloat(prodStock.replace(',', '.')),
        barcode: prodBarcode || null,
        is_active: prodIsActive,
        expiration_date: prodExpirationDate || null
      };

      if (editingProductId) {
        await updateProduct(editingProductId, payload);
        alert('✅ Producto actualizado');
      } else {
        await createProduct(payload);
        alert('✅ Producto/Lote guardado');
      }

      handleCancelEditProduct();
      await loadInitialData();
    } catch (e) { alert('Error guardando producto'); }
    finally { setLoading(false); }
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

  if (!isAccountActive && userRole !== 'superadmin') {
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
        <View>
          <Text style={styles.headerTitle}>🍖 Fiambrería POS & MRP</Text>
          <Text style={{ color: '#ccc', fontSize: 11 }}>Usuario: {email} ({userRole.toUpperCase()})</Text>
          <Text style={styles.branchHeader}>📍 {branchName}</Text>
        </View>
        <View style={{alignItems:'flex-end'}}>
          {userRole === 'superadmin' && (
            <TouchableOpacity onPress={changeBranch} style={styles.changeBranchBtn}>
              <Text style={styles.changeBranchText}>⇄ Cambiar sucursal</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleLogout}>
            <Text style={{ color: '#dc3545', fontWeight: 'bold', marginTop:6 }}>🚪 Salir</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.body}>
        {/* PRE-VENTA */}
        {currentTab === 'preventa' && (canPreventa || userRole === 'superadmin') && (
          <ScrollView contentContainerStyle={styles.scrollPadding} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>🛒 Pre-venta (Mostrador)</Text>

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
          </ScrollView>
        )}

        {/* CAJA */}
        {currentTab === 'caja' && (canCaja || userRole === 'superadmin') && (
          <ScrollView contentContainerStyle={styles.scrollPadding} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>💳 Caja y Cobro</Text>

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
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#d4edda', padding: 12, borderRadius: 8, marginBottom: 15 }}>
                  <View>
                    <Text style={{ fontWeight: 'bold', color: '#155724' }}>🟢 CAJA ABIERTA</Text>
                    <Text style={{ fontSize: 11, color: '#155724' }}>{cashStatus.opened_by} ({cashStatus.opened_at}) | Fondo: {formatMoney(cashStatus.initial_amount)}</Text>
                  </View>
                  <TouchableOpacity style={{ backgroundColor: '#dc3545', padding: 8, borderRadius: 6 }} onPress={() => setShowCloseModal(true)}>
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>🔒 Arqueo / Cierre</Text>
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
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:8}}>
                    {['PROVEEDOR','SERVICIOS','EMPLEADO','COMPRA_MENOR','OPERATIVO','OTRO','RETIRO_DUENO'].map(c=><TouchableOpacity key={c} style={[styles.typeBtn,{marginRight:6},cashMovementCategory===c&&{backgroundColor:'#dc3545'}]} onPress={()=>setCashMovementCategory(c)}><Text style={{fontSize:11,color:cashMovementCategory===c?'#fff':'#333'}}>{c.replaceAll('_',' ')}</Text></TouchableOpacity>)}
                  </ScrollView>
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
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:8}}>
                    {['MERMA_CORTE','VENCIMIENTO','ROTURA','DIFERENCIA_INVENTARIO','CONSUMO_INTERNO','OTRO'].map(r=><TouchableOpacity key={r} style={[styles.typeBtn,{marginRight:6},lossReason===r&&{backgroundColor:'#ffc107'}]} onPress={()=>setLossReason(r)}><Text style={{fontSize:11,fontWeight:'bold'}}>{r.replaceAll('_',' ')}</Text></TouchableOpacity>)}
                  </ScrollView>
                  {lossLots.length>0 && <><Text style={{fontSize:11,fontWeight:'bold'}}>Lote específico (opcional; vacío = FEFO)</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:8}}><TouchableOpacity style={[styles.typeBtn,{marginRight:6},!lossLotId&&{backgroundColor:'#007bff'}]} onPress={()=>setLossLotId(null)}><Text style={{color:!lossLotId?'#fff':'#333'}}>FEFO</Text></TouchableOpacity>{lossLots.map(l=><TouchableOpacity key={l.id} style={[styles.typeBtn,{marginRight:6},lossLotId===l.id&&{backgroundColor:'#007bff'}]} onPress={()=>setLossLotId(l.id)}><Text style={{color:lossLotId===l.id?'#fff':'#333'}}>{l.lot_number} ({l.current_qty})</Text></TouchableOpacity>)}</ScrollView></>}
                  <TouchableOpacity style={styles.buttonDanger} onPress={handleStockLoss} disabled={loading}><Text style={styles.buttonText}>Registrar merma / pérdida</Text></TouchableOpacity>
                </View>

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

                        {(canEditRecords || userRole === 'superadmin') && (
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

        {/* KPIS V2 - RENTABILIDAD REAL */}
        {currentTab === 'kpis' && (canKPIs || userRole === 'superadmin') && (
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
        {currentTab === 'alertas' && (canAlertas || userRole === 'superadmin') && (
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
              <View style={{flexDirection:'row',flexWrap:'wrap',marginTop:8}}>
                <TouchableOpacity style={[styles.typeBtn,{marginRight:5,marginBottom:5}]} onPress={()=>handleAlertAction(item,'SEEN')}><Text>👁 Vista</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.typeBtn,{marginRight:5,marginBottom:5}]} onPress={()=>handleAlertAction(item,'SNOOZED')}><Text>⏰ 24 h</Text></TouchableOpacity>
                {(item.actions||[]).includes('RESOLVED') && <TouchableOpacity style={[styles.typeBtn,{marginRight:5,marginBottom:5,backgroundColor:'#28a745'}]} onPress={()=>handleAlertAction(item,'RESOLVED')}><Text style={{color:'#fff'}}>✓ Resolver</Text></TouchableOpacity>}
                <TouchableOpacity style={[styles.typeBtn,{marginRight:5,marginBottom:5,backgroundColor:'#6c757d'}]} onPress={()=>handleAlertAction(item,'DISMISSED')}><Text style={{color:'#fff'}}>Descartar</Text></TouchableOpacity>
              </View>
            </View>)}
            {showAlertHistory && <View style={styles.card}><Text style={styles.subSectionTitle}>📜 Historial auditable</Text>{alertHistory.slice(0,100).map(h=><Text key={h.id} style={{fontSize:11,paddingVertical:5,borderBottomWidth:1,borderBottomColor:'#eee'}}>{h.created_at} · {h.actor||'-'} · {h.old_state} → {h.new_state} · {h.note||''}</Text>)}</View>}
          </ScrollView>
        )}

        {/* RRHH V2 */}
        {currentTab === 'rrhh' && (canRRHH || userRole === 'superadmin') && (
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
        {currentTab === 'mrp' && (canMRP || userRole === 'superadmin') && (
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
        {currentTab === 'verificacion' && (canVerificacion || userRole === 'superadmin') && (
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

        {/* INVENTARIO / STOCK / FEFO */}
        {currentTab === 'inventario' && (canStock || userRole === 'superadmin') && (
          <ScrollView contentContainerStyle={styles.scrollPadding} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>📦 Control FEFO e Inventario</Text>
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
        {currentTab === 'ingresos' && (canIngreso || userRole === 'superadmin') && (
          <ScrollView contentContainerStyle={styles.scrollPadding} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionTitle}>📥 Ingreso de Mercadería</Text>
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
                <Text style={{fontSize:12,fontWeight:'bold',color:'#555'}}>Vencimiento (DD-MM-AAAA)</Text>
                <TextInput
                  style={styles.inputHighlight}
                  placeholder="Ej: 31-10-2027"
                  value={prodExpirationDate}
                  maxLength={10}
                  onChangeText={(value) => {
                    const digits=value.replace(/\D/g,'').slice(0,8);
                    let formatted=digits;
                    if(digits.length>4) formatted=digits.slice(0,2)+'-'+digits.slice(2,4)+'-'+digits.slice(4);
                    else if(digits.length>2) formatted=digits.slice(0,2)+'-'+digits.slice(2);
                    setProdExpirationDate(formatted);
                  }}
                  keyboardType="number-pad"
                />
                <Text style={{fontSize:11,color:'#777',marginBottom:8}}>Solo numeros. El sistema valida la fecha al guardar.</Text>
              </>}
              <TouchableOpacity style={[styles.buttonSuccess,{marginTop:12}]} onPress={handleSaveIngressV2} disabled={loading}><Text style={styles.buttonText}>💾 Registrar ingreso y lote</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.buttonPrimary,{backgroundColor:'#6c757d'}]} onPress={resetIngressForm}><Text style={styles.buttonText}>Limpiar formulario</Text></TouchableOpacity>
            </View>

            {isAdminLevel && (
              <View style={styles.card}>
                <Text style={styles.subSectionTitle}>Correccion auditada de ingresos</Text>
                <Text style={{fontSize:11,color:'#666',marginBottom:8}}>Solo SuperAdmin. Toda correccion requiere un motivo.</Text>
                <TouchableOpacity style={styles.buttonPrimary} onPress={loadIngressHistory} disabled={loading}>
                  <Text style={styles.buttonText}>Cargar ingresos anteriores</Text>
                </TouchableOpacity>
                {ingressHistory.slice(0, 30).map(item => (
                  <View key={item.id} style={{paddingVertical:9,borderBottomWidth:1,borderBottomColor:'#ddd'}}>
                    <Text style={{fontWeight:'bold'}}>Ingreso #{item.id} - Producto #{item.product_id}</Text>
                    <Text style={{fontSize:12}}>Cantidad: {item.quantity} - Costo: {item.cost_price}</Text>
                    <Text style={{fontSize:11,color:'#666'}}>Proveedor: {item.supplier || '-'} - Lote: {item.lot_number || '-'}</Text>
                    <Text style={{fontSize:11,color:'#666'}}>Vencimiento: {item.expiration_date || 'Sin vencimiento'}</Text>
                    <TouchableOpacity style={[styles.typeBtn,{marginTop:5,alignSelf:'flex-start'}]} onPress={() => beginIngressCorrection(item)}>
                      <Text>Corregir</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

          {isAdminLevel && editingIngress && (
              <View style={styles.card}>
                <Text style={styles.subSectionTitle}>Corrigiendo ingreso #{editingIngress.id}</Text>
                <TextInput style={styles.input} placeholder="Cantidad" keyboardType="decimal-pad" value={editIngressQty} onChangeText={setEditIngressQty}/>
                <TextInput style={styles.input} placeholder="Costo" keyboardType="decimal-pad" value={editIngressCost} onChangeText={setEditIngressCost}/>
                <TextInput style={styles.input} placeholder="Proveedor" value={editIngressSupplier} onChangeText={setEditIngressSupplier}/>
                <TextInput style={styles.input} placeholder="Numero de lote" value={editIngressLot} onChangeText={setEditIngressLot}/>
                <TextInput style={styles.input} placeholder="Vencimiento DD-MM-AAAA" value={editIngressExpiration} onChangeText={setEditIngressExpiration} keyboardType="numbers-and-punctuation"/>
                <TextInput style={styles.inputHighlight} placeholder="Motivo obligatorio de la correccion" value={editIngressReason} onChangeText={setEditIngressReason}/>
                <TouchableOpacity style={styles.buttonSuccess} onPress={saveIngressCorrection} disabled={loading}>
                  <Text style={styles.buttonText}>Guardar correccion auditada</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.buttonPrimary,{backgroundColor:'#6c757d'}]} onPress={() => setEditingIngress(null)}>
                  <Text style={styles.buttonText}>Cancelar</Text>
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
                    </View>
                  </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* NAVBAR NAVEGABLE COMPLETO */}
      <View style={styles.navbarWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navbarContent}>
          {(canKPIs || userRole === 'superadmin') && (
            <TouchableOpacity style={[styles.navBtn, currentTab === 'kpis' && styles.navActive]} onPress={() => handleTabChange('kpis')}>
              <Text style={styles.navIcon}>📈</Text>
              <Text style={styles.navText}>KPIs</Text>
            </TouchableOpacity>
          )}

          {(canPreventa || userRole === 'superadmin') && (
            <TouchableOpacity style={[styles.navBtn, currentTab === 'preventa' && styles.navActive]} onPress={() => handleTabChange('preventa')}>
              <Text style={styles.navIcon}>🛒</Text>
              <Text style={styles.navText}>Ventas</Text>
            </TouchableOpacity>
          )}

          {(canCaja || userRole === 'superadmin') && (
            <TouchableOpacity style={[styles.navBtn, currentTab === 'caja' && styles.navActive]} onPress={() => handleTabChange('caja')}>
              <Text style={styles.navIcon}>💳</Text>
              <Text style={styles.navText}>Caja</Text>
            </TouchableOpacity>
          )}

          {(canAlertas || userRole === 'superadmin') && (
            <TouchableOpacity style={[styles.navBtn, currentTab === 'alertas' && styles.navActive]} onPress={() => handleTabChange('alertas')}>
              <Text style={styles.navIcon}>🚨</Text>
              <Text style={styles.navText}>Alertas</Text>
            </TouchableOpacity>
          )}

          {(canRRHH || userRole === 'superadmin') && (
            <TouchableOpacity style={[styles.navBtn, currentTab === 'rrhh' && styles.navActive]} onPress={() => handleTabChange('rrhh')}>
              <Text style={styles.navIcon}>👨‍💼</Text>
              <Text style={styles.navText}>RRHH</Text>
            </TouchableOpacity>
          )}

          {(canMRP || userRole === 'superadmin') && (
            <TouchableOpacity style={[styles.navBtn, currentTab === 'mrp' && styles.navActive]} onPress={() => handleTabChange('mrp')}>
              <Text style={styles.navIcon}>📊</Text>
              <Text style={styles.navText}>MRP</Text>
            </TouchableOpacity>
          )}

          {(canVerificacion || userRole === 'superadmin') && (
            <TouchableOpacity style={[styles.navBtn, currentTab === 'verificacion' && styles.navActive]} onPress={() => handleTabChange('verificacion')}>
              <Text style={styles.navIcon}>🔍</Text>
              <Text style={styles.navText}>Arqueo</Text>
            </TouchableOpacity>
          )}

          {(canStock || userRole === 'superadmin') && (
            <TouchableOpacity style={[styles.navBtn, currentTab === 'inventario' && styles.navActive]} onPress={() => handleTabChange('inventario')}>
              <Text style={styles.navIcon}>📦</Text>
              <Text style={styles.navText}>Stock</Text>
            </TouchableOpacity>
          )}

          {(canIngreso || userRole === 'superadmin') && (
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
  header: { backgroundColor: '#1a1a1a', padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  branchHeader: { color:'#7CFC98', fontSize:13, fontWeight:'bold', marginTop:4 },
  changeBranchBtn: { backgroundColor:'#343a40', paddingHorizontal:10, paddingVertical:6, borderRadius:7 },
  changeBranchText: { color:'#fff', fontSize:11, fontWeight:'bold' },
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
  buttonText: { color: '#fff', fontWeight: 'bold' },
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
  navText: { color: '#333', fontWeight: 'bold', fontSize: 11 }
});
