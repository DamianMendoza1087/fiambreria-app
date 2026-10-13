// 🎪 Objetivo de Jornada — Feria Damyale ("¿Conviene abrir?")
// El backend es la única fuente de verdad: este componente solo arma los datos de entrada,
// llama a la API y muestra lo que devuelve. No recalcula montos ni veredictos.
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Platform, Alert } from 'react-native';
import {
  fetchFairConfig, updateFairConfig, previewFairDayPlan, createFairDayPlan, fetchFairDayPlans,
  fetchFairDayPlan, recalculateFairDayPlan, updateFairDayPlanStatus,
} from './api';

const FAIR_BRANCH_ID = 2;

const PLAN_TYPES = [
  { key: 'SABADO', label: 'Sábado' },
  { key: 'DOMINGO', label: 'Domingo' },
  { key: 'FIN_DE_SEMANA', label: 'Fin de semana' },
  { key: 'FERIADO', label: 'Feriado' },
  { key: 'EXTRAORDINARIA', label: 'Extraordinaria' },
  { key: 'PERSONALIZADA', label: 'Personalizada' },
];
const PLAN_TYPE_LABELS = PLAN_TYPES.reduce((acc, t) => ({ ...acc, [t.key]: t.label }), {});
const EDITABLE_STATUSES = ['BORRADOR', 'PLANIFICADA'];

const ECONOMIC = {
  VIABLE: { label: '🟢 ECONÓMICAMENTE VIABLE', color: '#155724', bg: '#d4edda' },
  VIABLE_AJUSTADO: { label: '🟡 VIABLE AJUSTADO', color: '#856404', bg: '#fff3cd' },
  NO_VIABLE: { label: '🔴 NO CONVIENE ABRIR', color: '#721c24', bg: '#f8d7da' },
};
const COMMERCIAL = {
  DEMANDA_PROBABLE: { label: '🟢 DEMANDA PROBABLE', color: '#155724', bg: '#d4edda' },
  DEMANDA_INCIERTA: { label: '🟡 DEMANDA INCIERTA', color: '#856404', bg: '#fff3cd' },
  RIESGO_ALTO: { label: '🟠 DEMANDA HISTÓRICA INSUFICIENTE / RIESGO ALTO', color: '#8a4b08', bg: '#ffe5cc' },
  SIN_HISTORIAL_SUFICIENTE: { label: '⚪ SIN HISTORIAL SUFICIENTE', color: '#495057', bg: '#e9ecef' },
  SIN_REFERENCIA_COMPARABLE: { label: '⚪ SIN REFERENCIA COMPARABLE', color: '#495057', bg: '#e9ecef' },
};

const REASONS = {
  // Calidad de datos
  COSTO_INCOMPLETO: 'Falta costo del lote',
  PRECIO_FERIA_INCOMPLETO: 'Falta precio de Feria',
  PRECIO_FERIA_INVALIDO: 'Precio de Feria inválido',
  PRODUCTO_NO_HABILITADO_EN_FERIA: 'Producto no habilitado en Feria',
  VENTA_BAJO_COSTO: 'Precio de venta inferior al costo',
  // Viabilidad económica
  MARGEN_NO_POSITIVO: 'El margen del stock no es positivo',
  SIN_STOCK_VALIDO: 'No hay stock válido para analizar',
  NO_CUBRE_EQUILIBRIO_CON_STOCK_Y_CAPITAL: 'Ni el stock ni el capital alcanzan para cubrir los gastos',
  NO_ALCANZA_OBJETIVO: 'Cubre los gastos pero no alcanza el objetivo (deuda + ganancia)',
  OBJETIVO_CON_SEGURIDAD_SUPERA_UMBRAL_VERDE: 'Con margen de seguridad habría que vender demasiado stock',
  REQUIERE_COMPRAR_STOCK: 'Hace falta comprar mercadería para llegar al objetivo',
  DATOS_INCOMPLETOS_SUPERAN_TOLERANCIA: 'Hay demasiados datos incompletos',
  // Escenarios / capital / pronóstico
  SIN_HISTORIAL_SUFICIENTE: 'Todavía no hay suficientes jornadas de Feria registradas',
  SIN_PRODUCTOS_HISTORICOS_EN_STOCK: 'Los productos vendidos antes no están en el stock actual',
  SIN_COSTO_DE_REPOSICION: 'No hay ingresos de Feria para estimar el costo de reposición',
  REPOSICION_NO_RENTABLE: 'Con los costos actuales, reponer mercadería no deja margen',
  MARGEN_REPOSICION_INVALIDO: 'El margen de reposición calculado no es válido; revisá los costos de ingreso',
  MARGEN_HISTORICO_NO_POSITIVO: 'Las ventas anteriores de Feria no dejaron margen positivo',
  SIN_REFERENCIA_COMPARABLE: 'No hay jornadas anteriores equivalentes para comparar',
  DATOS_INCOMPLETOS: 'Hay lotes excluidos del cálculo',
  DATOS_INCOMPLETOS_SIN_VALOR: 'Hay lotes excluidos sin ningún precio para estimar su valor',
  CAPITAL_NO_CALCULABLE: 'No se puede calcular el capital necesario',
};
const reasonText = (code) => (code ? (REASONS[code] || code) : '');

// ---------- Utilidades de interfaz ----------

const notify = (title, message) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message || undefined);
};

const confirmAction = (title, message, confirmText, onConfirm) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Volver', style: 'cancel' },
    { text: confirmText, style: 'destructive', onPress: onConfirm },
  ]);
};

// Acepta formato argentino ("50.000", "1.234,56", "1234,56") y "1234.56". Vacío = null.
const parseAmount = (raw) => {
  const s = String(raw ?? '').trim().replace(/\s/g, '').replace(/^\$/, '');
  if (!s) return null;
  let normalized;
  if (s.includes(',')) normalized = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) normalized = s.replace(/\./g, ''); // puntos de miles
  else normalized = s;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return NaN;
  return Number(normalized);
};

const isValidDate = (str) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(str || '').trim());
  if (!m) return false;
  const dd = Number(m[1]); const mm = Number(m[2]); const yyyy = Number(m[3]);
  if (mm < 1 || mm > 12) return false;
  return dd >= 1 && dd <= new Date(yyyy, mm, 0).getDate();
};

const pctText = (ratio) => {
  if (ratio === null || ratio === undefined || Number.isNaN(Number(ratio))) return '—';
  return `${(Number(ratio) * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
};

// El backend guarda fechas/horas en UTC; Argentina es UTC-3 (sin horario de verano).
const utcToArText = (iso) => {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 3 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

const dateRangeText = (plan) => {
  if (!plan) return '—';
  const from = plan.start_date_display || plan.start_date;
  const to = plan.end_date_display || plan.end_date;
  return to && to !== from ? `${from} → ${to}` : from;
};

// ---------- Bloques de resultado (solo lectura de la respuesta del backend) ----------
// Definidos fuera del componente principal para que no se vuelvan a montar en cada render.


const Row = ({ label, value, strong, color }) => (
  <View style={s.row}>
    <Text style={[s.rowLabel, strong && s.bold]}>{label}</Text>
    <Text style={[s.rowValue, strong && s.bold, color && { color }]}>{value}</Text>
  </View>
);

const Indicator = ({ title, info, fallbackLabel, children }) => (
  <View style={[s.indicator, { backgroundColor: info?.bg || '#e9ecef' }]}>
    <Text style={s.indicatorTitle}>{title}</Text>
    <Text style={[s.indicatorLabel, { color: info?.color || '#333' }]}>{info?.label || fallbackLabel || '—'}</Text>
    {children}
  </View>
);

const ScenarioLine = ({ label, sc, money }) => {
  if (!sc) return null;
  if (sc.available === false) return <Text style={s.muted}>{label}: {reasonText(sc.reason)}</Text>;
  if (sc.reachable_with_stock === false || sc.sales_needed === null || sc.sales_needed === undefined) {
    return (
      <View style={s.scLine}>
        <Text style={s.scLabel}>{label}</Text>
        <Text style={s.warnText}>⚠️ No alcanza con el stock actual.</Text>
      </View>
    );
  }
  return (
    <View style={s.scLine}>
      <Text style={s.scLabel}>{label}</Text>
      <Text style={s.scValue}>Venta necesaria: {money(sc.sales_needed)}</Text>
      <Text style={s.scValue}>{pctText(sc.stock_pct)} del valor del stock</Text>
      {sc.mix_margin !== undefined && sc.mix_margin !== null && <Text style={s.muted}>Margen de la mezcla: {pctText(sc.mix_margin)}</Text>}
    </View>
  );
};

function ResultView({ res, money, formatQuantityVisual }) {
  const [showStock, setShowStock] = useState(false);
  if (!res) return null;
  const eco = res.economic || {};
  const com = res.commercial || {};
  const costs = res.operating_costs || {};
  const tg = res.targets || {};
  const stock = res.stock_summary || {};
  const sc = res.scenarios || {};
  const hist = sc.historical || {};
  const cap = res.capital || {};
  const dq = res.data_quality || {};
  const warnings = Array.isArray(res.warnings) ? res.warnings : [];
  const excluded = Array.isArray(dq.excluded) ? dq.excluded : [];
  const belowCost = warnings.filter(w => w?.code === 'VENTA_BAJO_COSTO');
  const otherWarnings = warnings.filter(w => w?.code && !['VENTA_BAJO_COSTO', 'DATOS_INCOMPLETOS', 'DATOS_INCOMPLETOS_SIN_VALOR'].includes(w.code));
  const products = Array.isArray(stock.products) ? stock.products : [];
  const manual = com.manual_scenario;
  const hasHistory = com.expected_sales !== undefined && com.expected_sales !== null;

  return (
    <View>
      {/* Indicadores separados: solo el económico puede decir "NO CONVIENE ABRIR" */}
      <Indicator title="INDICADOR ECONÓMICO" info={ECONOMIC[eco.verdict]} fallbackLabel={eco.label}>
        {eco.very_tight ? <Text style={s.veryTight}>⚠️ MUY AJUSTADO</Text> : null}
        {(eco.reasons || []).map((r) => <Text key={r} style={s.reason}>• {reasonText(r)}</Text>)}
      </Indicator>
      <Indicator title="INDICADOR DE DEMANDA" info={COMMERCIAL[com.verdict]} fallbackLabel={com.label}>
        {com.reason ? <Text style={s.reason}>{reasonText(com.reason) || com.reason}</Text> : null}
      </Indicator>

      {(excluded.length > 0 || belowCost.length > 0 || dq.incomplete_pct_is_lower_bound) && (
        <View style={[s.card, s.dangerCard]}>
          <Text style={s.cardTitle}>⚠️ DATOS A CORREGIR</Text>
          <Row label="Datos incompletos" value={`${pctText(dq.incomplete_pct)}${dq.incomplete_pct_is_lower_bound ? ' (mínimo)' : ''}`} strong />
          <Row label="Tolerancia configurada" value={pctText(dq.tolerance_pct)} />
          {dq.incomplete_pct_is_lower_bound ? (
            <Text style={s.strongWarn}>🚨 Hay lotes excluidos sin ningún precio: el porcentaje real de datos incompletos puede ser mayor. Corregí estos productos antes de decidir.</Text>
          ) : null}
          {excluded.map((e, i) => (
            <View key={`ex-${i}`} style={s.problemRow}>
              <Text style={s.bold}>{e?.product_name || `Producto #${e?.product_id}`}</Text>
              <Text style={s.muted}>{formatQuantityVisual(e?.qty, e?.unit_type)} — {reasonText(e?.reason)}</Text>
            </View>
          ))}
          {belowCost.map((w, i) => (
            <View key={`bc-${i}`} style={s.problemRow}>
              <Text style={s.bold}>{w?.product_name || `Producto #${w?.product_id}`}</Text>
              <Text style={s.muted}>{reasonText('VENTA_BAJO_COSTO')}{w?.detail ? ` (${w.detail})` : ''}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={s.card}>
        <Text style={s.cardTitle}>🧾 Gastos para abrir</Text>
        <Row label="Costo del puesto" value={money(costs.stall)} />
        <Row label="Personal" value={money(costs.staff)} />
        <Row label="Transporte" value={money(costs.transport)} />
        <Row label="Otros gastos" value={money(costs.other)} />
        <Row label="COSTO OPERATIVO TOTAL" value={money(costs.opex)} strong />
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>🎯 Objetivos (no son gastos)</Text>
        <Row label="Deuda objetivo" value={money(tg.debt_target)} />
        <Row label="Ganancia deseada" value={money(tg.profit_target)} />
        <Row label="Margen necesario para equilibrio" value={money(tg.equilibrium)} />
        <Row label="Objetivo + deuda" value={money(tg.with_debt)} />
        <Row label="Margen objetivo (gastos + deuda + ganancia)" value={money(tg.objective)} strong />
        <Text style={s.hint}>Es el margen bruto que hay que generar vendiendo, no la venta total.</Text>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>📦 Stock válido de Feria</Text>
        <Row label="Valor de venta" value={money(stock.sale_value)} />
        <Row label="Costo" value={money(stock.cost)} />
        <Row label="Margen bruto potencial" value={money(stock.gross_margin)} strong />
        <Row label="Margen %" value={pctText(stock.margin_pct)} />
      </View>

      <Text style={s.sectionTitle}>📊 ¿Cuánto stock tendría que vender?</Text>
      <View style={s.card}>
        <Text style={s.cardTitle}>1. PROPORCIONAL</Text>
        <Text style={s.hint}>Si se vende un poco de todo, en la misma proporción.</Text>
        <ScenarioLine money={money} label="Para equilibrio" sc={sc.proportional?.equilibrium} />
        <ScenarioLine money={money} label="Para el objetivo" sc={sc.proportional?.objective} />
      </View>
      <View style={[s.card, s.highlightCard]}>
        <Text style={s.cardTitle}>2. CONSERVADOR</Text>
        <Text style={s.badge}>Escenario utilizado para el semáforo</Text>
        <Text style={s.hint}>Si se venden primero los productos de menor margen.</Text>
        <ScenarioLine money={money} label="Para equilibrio" sc={sc.conservative?.equilibrium} />
        <ScenarioLine money={money} label="Para el objetivo" sc={sc.conservative?.objective} />
        <ScenarioLine money={money} label="Objetivo con margen de seguridad" sc={sc.conservative?.objective_with_safety} />
      </View>
      <View style={s.card}>
        <Text style={s.cardTitle}>3. HISTÓRICO</Text>
        <Text style={s.hint}>Según la mezcla real de ventas de Feria.</Text>
        {hist.available === false ? (
          <Text style={s.muted}>{reasonText(hist.reason)}</Text>
        ) : (
          <>
            <ScenarioLine money={money} label="Para equilibrio" sc={hist.equilibrium} />
            <ScenarioLine money={money} label="Para el objetivo" sc={hist.objective} />
          </>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>📈 Pronóstico comercial</Text>
        <Text style={s.hint}>Se compara con jornadas anteriores equivalentes de Feria.</Text>
        <Row label="Jornadas comparables" value={String(com.comparables_count ?? 0)} />
        {hasHistory ? (
          <>
            <Row label="Venta esperada histórica (mediana)" value={money(com.expected_sales)} strong />
            <Row label="P25" value={money(com.p25)} />
            <Row label="Mediana" value={money(com.expected_sales)} />
            <Row label="P75" value={money(com.p75)} />
            <Row label="Margen histórico" value={pctText(com.historical_margin)} />
            <Row label="Venta necesaria para equilibrio" value={money(com.sales_needed_equilibrium)} />
            <Row label="Venta necesaria para objetivo" value={money(com.sales_needed_objective)} />
          </>
        ) : (
          <Text style={s.muted}>{reasonText(com.verdict)}</Text>
        )}
      </View>

      {manual ? (
        <View style={[s.card, s.manualCard]}>
          <Text style={s.cardTitle}>✍️ ESCENARIO INGRESADO MANUALMENTE</Text>
          <Text style={s.hint}>No reemplaza al histórico.</Text>
          <Row label="Venta esperada ingresada" value={money(manual.expected_sales)} strong />
          <Row label="Venta necesaria para equilibrio" value={money(manual.sales_needed_equilibrium)} />
          <Row label="Venta necesaria para objetivo" value={money(manual.sales_needed_objective)} />
          <Row label="Margen usado" value={manual.margin_basis === 'HISTORICO' ? 'Histórico de Feria' : 'Stock actual'} />
          <Text style={s.bold}>{COMMERCIAL[manual.verdict]?.label || reasonText(manual.reason) || '—'}</Text>
        </View>
      ) : null}

      <View style={s.card}>
        <Text style={s.cardTitle}>💰 ¿Necesito comprar más mercadería?</Text>
        {cap.purchase_needed === false ? (
          <Text style={s.okText}>✅ No hace falta comprar mercadería: el stock actual alcanza para el objetivo.</Text>
        ) : (
          <Text style={s.warnText}>Hace falta comprar mercadería para llegar al objetivo.</Text>
        )}
        <Row label="Capital disponible" value={money(cap.capital_available)} />
        {cap.purchase_needed ? (
          <>
            <Row label="Margen faltante" value={money(cap.margin_gap)} />
            <Row label="Capital estimado requerido" value={money(cap.capital_required)} strong />
            <Row label="Diferencia de capital" value={money(cap.capital_difference)}
              color={cap.capital_difference !== null && cap.capital_difference !== undefined && cap.capital_difference < 0 ? '#c0392b' : '#155724'} />
          </>
        ) : null}
        <Row label="Margen estimado de reposición" value={pctText(cap.replacement_margin)} />
        {cap.reason ? <Text style={s.warnText}>⚠️ {reasonText(cap.reason)}</Text> : null}
      </View>

      {otherWarnings.length > 0 && (
        <View style={[s.card, s.warnCard]}>
          <Text style={s.cardTitle}>⚠️ Advertencias</Text>
          {otherWarnings.map((w, i) => <Text key={`w-${i}`} style={s.reason}>• {reasonText(w.code)}{w.detail ? ` — ${w.detail}` : ''}</Text>)}
        </View>
      )}

      <TouchableOpacity style={s.collapseBtn} onPress={() => setShowStock(!showStock)}>
        <Text style={s.collapseText}>{showStock ? '▼' : '▶'} 📦 Stock analizado ({products.length} productos)</Text>
      </TouchableOpacity>
      {showStock && products.map((p) => (
        <View key={`p-${p?.product_id}`} style={s.productCard}>
          <Text style={s.bold}>{p?.product_name}{p?.below_cost ? '  ⚠️ bajo costo' : ''}</Text>
          <Row label="Cantidad disponible" value={formatQuantityVisual(p?.qty, p?.unit_type)} />
          <Row label={`Precio Feria (${p?.unit_type === 'kg' ? 'por kg' : 'por unidad'})`} value={money(p?.price)} />
          <Row label="Valor de venta" value={money(p?.sale_value)} />
          <Row label="Costo" value={money(p?.cost)} />
          <Row label="Margen bruto" value={money(p?.gross_margin)} />
          <Row label="Margen %" value={pctText(p?.margin_pct)} />
        </View>
      ))}
    </View>
  );
}

const Field = ({ label, value, onChange, placeholder, keyboardType = 'numeric', hint, editable = true }) => (
  <View style={s.field}>
    <Text style={s.fieldLabel}>{label}</Text>
    <TextInput style={s.input} value={value} onChangeText={onChange} placeholder={placeholder} keyboardType={keyboardType} editable={editable} />
    {hint ? <Text style={s.hint}>{hint}</Text> : null}
  </View>
);

// ---------- Componente ----------

export default function FairDayPlanner({ branchId, userEmail, canEditConfig, formatMoney, formatQuantityVisual, applyDateMask }) {
  const [view, setView] = useState('home'); // home | new | plans | detail | config
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState('');

  // Formulario de análisis
  const [planType, setPlanType] = useState('FIN_DE_SEMANA');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [transportOut, setTransportOut] = useState('');
  const [transportRet, setTransportRet] = useState('');
  const [otherExpenses, setOtherExpenses] = useState('');
  const [debtTarget, setDebtTarget] = useState('');
  const [profitTarget, setProfitTarget] = useState('');
  const [capitalAvailable, setCapitalAvailable] = useState('');
  const [manualSales, setManualSales] = useState('');
  const [notes, setNotes] = useState('');

  const [preview, setPreview] = useState(null);           // respuesta de /day-plans/preview
  const [previewPayload, setPreviewPayload] = useState(null); // datos exactos usados en el preview
  const [savedPlanId, setSavedPlanId] = useState(null);

  const [plans, setPlans] = useState([]);
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [detail, setDetail] = useState(null);

  const [cfgForm, setCfgForm] = useState({});

  const money = (v) => (v === null || v === undefined ? '—' : formatMoney(v));

  // Ejecuta una request por vez: bloquea doble envío.
  const runExclusive = async (fn) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify('No se pudo completar la operación', e?.message || 'Error desconocido');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const loadConfig = async () => {
    try {
      setConfigError('');
      const cfg = await fetchFairConfig(FAIR_BRANCH_ID);
      setConfig(cfg);
      return cfg;
    } catch (e) {
      setConfigError(e?.message || 'No se pudo obtener la configuración de Feria');
      return null;
    }
  };

  useEffect(() => { loadConfig(); }, []);

  // Cualquier cambio en el formulario invalida el preview: no se puede guardar algo distinto a lo analizado.
  const invalidatePreview = () => { setPreview(null); setPreviewPayload(null); setSavedPlanId(null); };
  const onField = (setter) => (value) => { setter(value); invalidatePreview(); };

  if (branchId !== FAIR_BRANCH_ID) return null;

  // ---------- Acciones ----------

  const buildPayload = () => {
    if (!isValidDate(startDate)) return { error: 'Ingresá la fecha desde con formato DD/MM/AAAA.' };
    if (planType === 'PERSONALIZADA' && !isValidDate(endDate)) return { error: 'Ingresá la fecha hasta con formato DD/MM/AAAA.' };
    const amounts = {
      other_expenses: [otherExpenses, 'Otros gastos'],
      debt_target: [debtTarget, 'Deuda que quiero cubrir'],
      profit_target: [profitTarget, 'Ganancia que quiero obtener'],
      capital_available: [capitalAvailable, 'Capital disponible'],
      manual_expected_sales: [manualSales, 'Venta esperada manual'],
    };
    if (planType !== 'FIN_DE_SEMANA') {
      amounts.transport_outbound = [transportOut, 'Transporte ida'];
      amounts.transport_return = [transportRet, 'Transporte vuelta'];
    }
    const payload = { branch_id: FAIR_BRANCH_ID, plan_type: planType, start_date: startDate.trim(), created_by: userEmail || null };
    if (planType === 'PERSONALIZADA') payload.end_date = endDate.trim();
    for (const [key, [raw, label]] of Object.entries(amounts)) {
      const value = parseAmount(raw);
      if (Number.isNaN(value)) return { error: `${label}: ingresá un importe válido.` };
      if (value !== null && value < 0) return { error: `${label}: no puede ser negativo.` };
      if ((key === 'transport_outbound' || key === 'transport_return') && value === null) {
        return { error: 'Para este tipo de jornada ingresá transporte ida y vuelta (puede ser 0).' };
      }
      if (key === 'manual_expected_sales') payload[key] = value;
      else if (value !== null) payload[key] = value;
    }
    if (notes.trim()) payload.notes = notes.trim();
    return { payload };
  };

  const handlePreview = () => runExclusive(async () => {
    const { payload, error } = buildPayload();
    if (error) { notify('Revisá los datos', error); return; }
    setSavedPlanId(null);
    const res = await previewFairDayPlan(payload);
    setPreview(res);
    setPreviewPayload(payload);
  });

  const handleSave = () => runExclusive(async () => {
    if (!previewPayload || savedPlanId) return;
    const created = await createFairDayPlan(previewPayload);
    const id = created?.plan?.id;
    setSavedPlanId(id || null);
    setPlansLoaded(false);
    notify('✅ Plan guardado', id ? `Plan #${id} guardado con su cálculo.` : 'Plan guardado.');
  });

  const loadPlans = () => runExclusive(async () => {
    const list = await fetchFairDayPlans(FAIR_BRANCH_ID);
    setPlans(Array.isArray(list) ? list : []);
    setPlansLoaded(true);
  });

  const openPlans = () => { setView('plans'); loadPlans(); };

  const openDetail = (id) => runExclusive(async () => {
    const d = await fetchFairDayPlan(id);
    setDetail(d);
    setView('detail');
  });

  const recalculate = (id, fromDetail) => runExclusive(async () => {
    await recalculateFairDayPlan(id, userEmail || null);
    if (fromDetail) setDetail(await fetchFairDayPlan(id));
    const list = await fetchFairDayPlans(FAIR_BRANCH_ID);
    setPlans(Array.isArray(list) ? list : []);
    notify('🔄 Plan recalculado', 'Se guardó un cálculo nuevo con los datos actuales.');
  });

  const cancelPlan = (plan, fromDetail) => {
    confirmAction(
      'Cancelar plan',
      `¿Cancelar el plan del ${dateRangeText(plan)}? El plan y sus cálculos quedan guardados en el historial.`,
      'Cancelar plan',
      () => runExclusive(async () => {
        await updateFairDayPlanStatus(plan.id, 'CANCELADA', userEmail || null, null);
        if (fromDetail) setDetail(await fetchFairDayPlan(plan.id));
        const list = await fetchFairDayPlans(FAIR_BRANCH_ID);
        setPlans(Array.isArray(list) ? list : []);
        notify('Plan cancelado', 'El plan quedó como CANCELADA.');
      })
    );
  };

  const openConfig = async () => {
    setView('config');
    const cfg = config || await loadConfig();
    if (cfg) fillConfigForm(cfg);
  };

  const fillConfigForm = (cfg) => {
    const pct = (v) => (v === null || v === undefined ? '' : String(Number((Number(v) * 100).toFixed(2))).replace('.', ','));
    const num = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
    setCfgForm({
      stall_cost_per_day: num(cfg.stall_cost_per_day),
      staff_count: String(cfg.staff_count ?? ''),
      staff_cost_per_person_day: num(cfg.staff_cost_per_person_day),
      transport_outbound: num(cfg.transport_outbound),
      transport_return: num(cfg.transport_return),
      green_max_stock_pct: pct(cfg.green_max_stock_pct),
      yellow_max_stock_pct: pct(cfg.yellow_max_stock_pct),
      safety_margin_pct: pct(cfg.safety_margin_pct),
      incomplete_data_tolerance_pct: pct(cfg.incomplete_data_tolerance_pct),
      comparable_days_count: String(cfg.comparable_days_count ?? ''),
      minimum_comparable_days: String(cfg.minimum_comparable_days ?? ''),
    });
  };

  const saveConfig = () => runExclusive(async () => {
    const f = cfgForm;
    const data = {};
    for (const [key, label] of [['stall_cost_per_day', 'Costo puesto/día'], ['staff_cost_per_person_day', 'Costo empleado/día'],
      ['transport_outbound', 'Transporte ida'], ['transport_return', 'Transporte vuelta']]) {
      const v = parseAmount(f[key]);
      if (v === null || Number.isNaN(v) || v < 0) { notify('Revisá la configuración', `${label}: ingresá un importe mayor o igual a 0.`); return; }
      data[key] = v;
    }
    const percents = {};
    for (const [key, label] of [['green_max_stock_pct', 'Umbral verde'], ['yellow_max_stock_pct', 'Umbral amarillo'],
      ['safety_margin_pct', 'Margen de seguridad'], ['incomplete_data_tolerance_pct', 'Tolerancia de datos incompletos']]) {
      const v = parseAmount(f[key]);
      if (v === null || Number.isNaN(v) || v < 0 || v > 100) { notify('Revisá la configuración', `${label}: debe estar entre 0 y 100 %.`); return; }
      percents[key] = v;
      data[key] = Number((v / 100).toFixed(4)); // el backend recibe 0..1
    }
    if (percents.green_max_stock_pct <= 0) { notify('Revisá la configuración', 'El umbral verde debe ser mayor a 0 %.'); return; }
    if (percents.green_max_stock_pct >= percents.yellow_max_stock_pct) { notify('Revisá la configuración', 'El umbral verde debe ser menor que el amarillo.'); return; }
    for (const [key, label, min] of [['staff_count', 'Cantidad de empleados', 0], ['comparable_days_count', 'Cantidad de comparables', 1],
      ['minimum_comparable_days', 'Mínimo de comparables', 1]]) {
      const raw = String(f[key] ?? '').trim();
      if (!/^\d+$/.test(raw) || Number(raw) < min) { notify('Revisá la configuración', `${label}: ingresá un número entero mayor o igual a ${min}.`); return; }
      data[key] = Number(raw);
    }
    if (data.minimum_comparable_days > data.comparable_days_count) { notify('Revisá la configuración', 'El mínimo de comparables no puede superar la cantidad de comparables.'); return; }
    data.updated_by = userEmail || null;
    const saved = await updateFairConfig(data, FAIR_BRANCH_ID);
    setConfig(saved);
    fillConfigForm(saved);
    notify('✅ Configuración guardada', `Versión ${saved?.version ?? ''}. Se aplica a análisis nuevos.`);
  });

  // ---------- Vistas ----------

  const renderBack = (to = 'home', label = '← Volver') => (
    <TouchableOpacity onPress={() => setView(to)} disabled={busy} style={s.backBtn}>
      <Text style={s.backText}>{label}</Text>
    </TouchableOpacity>
  );

  const header = (
    <View style={s.header}>
      <Text style={s.title}>🎪 Objetivo de Jornada</Text>
      <Text style={s.subtitle}>Feria Damyale</Text>
    </View>
  );

  if (view === 'home') {
    return (
      <ScrollView contentContainerStyle={s.container}>
        {header}
        <Text style={s.lead}>Calculá si conviene abrir antes de comprometer gastos y mercadería.</Text>
        <TouchableOpacity style={[s.bigBtn, { backgroundColor: '#6f42c1' }]} onPress={() => setView('new')}>
          <Text style={s.bigBtnText}>NUEVO ANÁLISIS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.bigBtn, { backgroundColor: '#007bff' }]} onPress={openPlans}>
          <Text style={s.bigBtnText}>PLANES GUARDADOS</Text>
        </TouchableOpacity>
        {canEditConfig && (
          <TouchableOpacity style={s.secondaryBtn} onPress={openConfig}>
            <Text style={s.secondaryText}>⚙️ Configuración de Feria</Text>
          </TouchableOpacity>
        )}
        {configError ? <Text style={s.errorText}>{configError}</Text> : null}
      </ScrollView>
    );
  }

  if (view === 'new') {
    return (
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        {renderBack()}
        {header}
        <Text style={s.sectionTitle}>Nuevo análisis</Text>

        <Text style={s.fieldLabel}>Tipo de jornada</Text>
        <View style={s.chips}>
          {PLAN_TYPES.map(t => (
            <TouchableOpacity key={t.key} disabled={busy} onPress={() => { setPlanType(t.key); invalidatePreview(); }}
              style={[s.chip, planType === t.key && s.chipActive]}>
              <Text style={[s.chipText, planType === t.key && s.chipTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Field editable={!busy} label={planType === 'PERSONALIZADA' ? 'Fecha desde' : planType === 'FIN_DE_SEMANA' ? 'Sábado (fecha desde)' : 'Fecha'}
          value={startDate} onChange={(v) => onField(setStartDate)(applyDateMask(v))} placeholder="DD/MM/AAAA"
          hint={planType === 'FIN_DE_SEMANA' ? 'El domingo se toma automáticamente.' : null} />
        {planType === 'PERSONALIZADA' && (
          <Field editable={!busy} label="Fecha hasta" value={endDate} onChange={(v) => onField(setEndDate)(applyDateMask(v))} placeholder="DD/MM/AAAA" />
        )}

        <View style={s.card}>
          <Text style={s.cardTitle}>Gastos de la jornada</Text>
          {config ? (
            <Text style={s.hint}>
              Puesto: {money(config.stall_cost_per_day)} por día · Personal: {config.staff_count} × {money(config.staff_cost_per_person_day)} por día (de la configuración de Feria).
            </Text>
          ) : null}
          {planType === 'FIN_DE_SEMANA' ? (
            <Text style={s.hint}>
              Transporte: se usan los valores de la configuración{config ? ` (ida ${money(config.transport_outbound)}, vuelta ${money(config.transport_return)})` : ''}.
            </Text>
          ) : (
            <>
              <Field editable={!busy} label="Transporte ida" value={transportOut} onChange={onField(setTransportOut)} placeholder="Ej: 30000 (puede ser 0)" />
              <Field editable={!busy} label="Transporte vuelta" value={transportRet} onChange={onField(setTransportRet)} placeholder="Ej: 30000 (puede ser 0)" />
            </>
          )}
          <Field editable={!busy} label="Otros gastos" value={otherExpenses} onChange={onField(setOtherExpenses)} placeholder="0" />
          <Text style={s.hint}>El costo operativo total se muestra en el resultado, calculado por el sistema.</Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Objetivos (no son gastos)</Text>
          <Field editable={!busy} label="Deuda que quiero cubrir" value={debtTarget} onChange={onField(setDebtTarget)} placeholder="0" />
          <Field editable={!busy} label="Ganancia que quiero obtener" value={profitTarget} onChange={onField(setProfitTarget)} placeholder="0" />
          <Field editable={!busy} label="Capital disponible para comprar mercadería" value={capitalAvailable} onChange={onField(setCapitalAvailable)} placeholder="0" />
          <Field editable={!busy} label="Venta esperada manual (opcional)" value={manualSales} onChange={onField(setManualSales)} placeholder="Dejar vacío si no sabés"
            hint="Se muestra como escenario aparte; no reemplaza al histórico." />
          <Field editable={!busy} label="Notas (opcional)" value={notes} onChange={onField(setNotes)} placeholder="" keyboardType="default" />
        </View>

        <TouchableOpacity style={[s.bigBtn, { backgroundColor: busy ? '#999' : '#28a745' }]} onPress={handlePreview} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.bigBtnText}>🔍 ANALIZAR SI CONVIENE ABRIR</Text>}
        </TouchableOpacity>

        {preview?.results ? (
          <View style={{ marginTop: 16 }}>
            <Text style={s.sectionTitle}>Resultado del análisis</Text>
            <Text style={s.hint}>Vista previa: todavía no se guardó.</Text>
            <ResultView res={preview.results} money={money} formatQuantityVisual={formatQuantityVisual} />
            {savedPlanId ? (
              <View style={[s.card, s.okCard]}>
                <Text style={s.okText}>✅ Plan #{savedPlanId} guardado.</Text>
                <TouchableOpacity style={[s.bigBtn, { backgroundColor: '#007bff' }]} onPress={() => openDetail(savedPlanId)} disabled={busy}>
                  <Text style={s.bigBtnText}>VER DETALLE DEL PLAN</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={[s.bigBtn, { backgroundColor: busy ? '#999' : '#6f42c1' }]} onPress={handleSave} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.bigBtnText}>💾 GUARDAR PLAN</Text>}
              </TouchableOpacity>
            )}
          </View>
        ) : null}
      </ScrollView>
    );
  }

  if (view === 'plans') {
    return (
      <ScrollView contentContainerStyle={s.container}>
        {renderBack()}
        {header}
        <Text style={s.sectionTitle}>Planes guardados</Text>
        {busy && <ActivityIndicator color="#6f42c1" style={{ marginVertical: 10 }} />}
        {plansLoaded && plans.length === 0 && <Text style={s.muted}>Todavía no hay planes guardados.</Text>}
        {plans.map((p) => {
          const snap = p?.latest_snapshot || {};
          const editable = EDITABLE_STATUSES.includes(p?.status);
          return (
            <View key={`plan-${p?.id}`} style={[s.card, p?.status === 'CANCELADA' && { opacity: 0.7 }]}>
              <Text style={s.cardTitle}>{dateRangeText(p)} · {PLAN_TYPE_LABELS[p?.plan_type] || p?.plan_type}</Text>
              <Text style={s.statusBadge}>{p?.status}</Text>
              <Text style={[s.bold, { color: ECONOMIC[snap.economic_verdict]?.color || '#333' }]}>{ECONOMIC[snap.economic_verdict]?.label || '—'}</Text>
              <Text style={[s.bold, { color: COMMERCIAL[snap.commercial_verdict]?.color || '#333' }]}>{COMMERCIAL[snap.commercial_verdict]?.label || '—'}</Text>
              <Row label="Costo operativo" value={money(p?.operating_cost_total)} />
              <Row label="Objetivo: deuda" value={money(p?.debt_target)} />
              <Row label="Objetivo: ganancia" value={money(p?.profit_target)} />
              <View style={s.actions}>
                <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#007bff' }]} onPress={() => openDetail(p.id)} disabled={busy}>
                  <Text style={s.actionText}>VER DETALLE</Text>
                </TouchableOpacity>
                {editable && (
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#17a2b8' }]} onPress={() => recalculate(p.id, false)} disabled={busy}>
                    <Text style={s.actionText}>RECALCULAR</Text>
                  </TouchableOpacity>
                )}
                {editable && (
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#dc3545' }]} onPress={() => cancelPlan(p, false)} disabled={busy}>
                    <Text style={s.actionText}>CANCELAR</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
        <TouchableOpacity style={s.secondaryBtn} onPress={loadPlans} disabled={busy}>
          <Text style={s.secondaryText}>↻ Actualizar listado</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (view === 'detail') {
    const plan = detail?.plan || {};
    const latest = detail?.latest_snapshot || null;
    const snapshots = Array.isArray(detail?.snapshots) ? [...detail.snapshots].reverse() : [];
    const editable = EDITABLE_STATUSES.includes(plan.status);
    return (
      <ScrollView contentContainerStyle={s.container}>
        {renderBack('plans', '← Planes guardados')}
        {header}
        <Text style={s.sectionTitle}>Plan #{plan.id} · {PLAN_TYPE_LABELS[plan.plan_type] || plan.plan_type}</Text>
        <View style={s.card}>
          <Text style={s.cardTitle}>Datos originales</Text>
          <Row label="Estado" value={plan.status || '—'} strong />
          <Row label="Fecha" value={dateRangeText(plan)} />
          <Row label="Días" value={String(plan.days_count ?? '—')} />
          <Row label="Costo del puesto" value={money(plan.stall_total)} />
          <Row label="Personal" value={money(plan.staff_total)} />
          <Row label="Transporte (ida + vuelta)" value={`${money(plan.transport_outbound)} + ${money(plan.transport_return)}`} />
          <Row label="Otros gastos" value={money(plan.other_expenses)} />
          <Row label="Costo operativo total" value={money(plan.operating_cost_total)} strong />
          <Row label="Deuda que quiero cubrir" value={money(plan.debt_target)} />
          <Row label="Ganancia que quiero obtener" value={money(plan.profit_target)} />
          <Row label="Capital disponible" value={money(plan.capital_available)} />
          <Row label="Venta esperada manual" value={plan.manual_expected_sales === null || plan.manual_expected_sales === undefined ? '—' : money(plan.manual_expected_sales)} />
          <Row label="Configuración usada" value={plan.config_version ? `Versión ${plan.config_version}` : 'Valores por defecto'} />
          {plan.notes ? <Text style={s.hint}>Notas: {plan.notes}</Text> : null}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Cálculos guardados ({snapshots.length})</Text>
          {snapshots.map((sn, i) => (
            <Text key={`sn-${sn?.id}`} style={s.muted}>
              Cálculo {i + 1} — {utcToArText(sn?.computed_at)} — {ECONOMIC[sn?.economic_verdict]?.label || sn?.economic_verdict} · {COMMERCIAL[sn?.commercial_verdict]?.label || sn?.commercial_verdict}
            </Text>
          ))}
        </View>

        {editable && (
          <TouchableOpacity style={[s.bigBtn, { backgroundColor: busy ? '#999' : '#17a2b8' }]} onPress={() => recalculate(plan.id, true)} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.bigBtnText}>🔄 RECALCULAR CON DATOS ACTUALES</Text>}
          </TouchableOpacity>
        )}

        {latest ? (
          <>
            <Text style={s.sectionTitle}>Resultado actual</Text>
            <Text style={s.hint}>Calculado el {utcToArText(latest.computed_at)}</Text>
            <ResultView res={latest.results} money={money} formatQuantityVisual={formatQuantityVisual} />
          </>
        ) : <Text style={s.muted}>Este plan no tiene cálculos guardados.</Text>}

        {editable && (
          <TouchableOpacity style={[s.secondaryBtn, { borderColor: '#dc3545' }]} onPress={() => cancelPlan(plan, true)} disabled={busy}>
            <Text style={[s.secondaryText, { color: '#dc3545' }]}>Cancelar plan</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  }

  if (view === 'config') {
    if (!canEditConfig) {
      return (
        <ScrollView contentContainerStyle={s.container}>
          {renderBack()}
          <Text style={s.muted}>Solo un administrador puede modificar la configuración de Feria.</Text>
        </ScrollView>
      );
    }
    const setCfg = (key) => (value) => setCfgForm({ ...cfgForm, [key]: value });
    return (
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        {renderBack()}
        {header}
        <Text style={s.sectionTitle}>⚙️ Configuración de Feria</Text>
        <Text style={s.hint}>Los cambios se aplican a análisis nuevos. Los planes anteriores conservan la configuración con la que fueron calculados.</Text>
        {config ? <Text style={s.hint}>Versión actual: {config.version ?? 'valores por defecto'}{config.weekend_operating_cost !== undefined ? ` · Fin de semana completo: ${money(config.weekend_operating_cost)}` : ''}</Text> : null}
        {configError ? <Text style={s.errorText}>{configError}</Text> : null}
        <View style={s.card}>
          <Text style={s.cardTitle}>Costos</Text>
          <Field editable={!busy} label="Costo puesto por día ($)" value={cfgForm.stall_cost_per_day} onChange={setCfg('stall_cost_per_day')} />
          <Field editable={!busy} label="Cantidad de empleados" value={cfgForm.staff_count} onChange={setCfg('staff_count')} />
          <Field editable={!busy} label="Costo por empleado por día ($)" value={cfgForm.staff_cost_per_person_day} onChange={setCfg('staff_cost_per_person_day')} />
          <Field editable={!busy} label="Transporte ida ($)" value={cfgForm.transport_outbound} onChange={setCfg('transport_outbound')} />
          <Field editable={!busy} label="Transporte vuelta ($)" value={cfgForm.transport_return} onChange={setCfg('transport_return')} />
        </View>
        <View style={s.card}>
          <Text style={s.cardTitle}>Semáforo</Text>
          <Field editable={!busy} label="Umbral verde (%)" value={cfgForm.green_max_stock_pct} onChange={setCfg('green_max_stock_pct')} hint="Máximo % del stock a vender para estar en verde." />
          <Field editable={!busy} label="Umbral amarillo (%)" value={cfgForm.yellow_max_stock_pct} onChange={setCfg('yellow_max_stock_pct')} hint="Por encima se marca MUY AJUSTADO." />
          <Field editable={!busy} label="Margen de seguridad (%)" value={cfgForm.safety_margin_pct} onChange={setCfg('safety_margin_pct')} />
          <Field editable={!busy} label="Tolerancia de datos incompletos (%)" value={cfgForm.incomplete_data_tolerance_pct} onChange={setCfg('incomplete_data_tolerance_pct')} />
          <Field editable={!busy} label="Cantidad de jornadas comparables" value={cfgForm.comparable_days_count} onChange={setCfg('comparable_days_count')} />
          <Field editable={!busy} label="Mínimo de jornadas comparables" value={cfgForm.minimum_comparable_days} onChange={setCfg('minimum_comparable_days')} />
        </View>
        <TouchableOpacity style={[s.bigBtn, { backgroundColor: busy ? '#999' : '#28a745' }]} onPress={saveConfig} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.bigBtnText}>💾 GUARDAR CONFIGURACIÓN</Text>}
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return null;
}

const s = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 8 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#6f42c1' },
  subtitle: { fontSize: 15, fontWeight: 'bold', color: '#555' },
  lead: { fontSize: 14, color: '#444', marginBottom: 16 },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: '#222', marginTop: 12, marginBottom: 8 },
  bigBtn: { paddingVertical: 15, borderRadius: 10, alignItems: 'center', marginVertical: 6 },
  bigBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  secondaryBtn: { paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginVertical: 8, borderWidth: 1, borderColor: '#6f42c1', backgroundColor: '#fff' },
  secondaryText: { color: '#6f42c1', fontWeight: 'bold' },
  backBtn: { marginBottom: 8 },
  backText: { color: '#007bff', fontWeight: 'bold', fontSize: 14 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e2e2' },
  dangerCard: { borderColor: '#dc3545', backgroundColor: '#fff5f5' },
  warnCard: { borderColor: '#ffc107', backgroundColor: '#fffbea' },
  okCard: { borderColor: '#28a745', backgroundColor: '#f0fff4' },
  manualCard: { borderColor: '#6f42c1', backgroundColor: '#f8f4ff' },
  highlightCard: { borderColor: '#6f42c1', borderWidth: 2 },
  cardTitle: { fontSize: 15, fontWeight: 'bold', marginBottom: 6, color: '#222' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  rowLabel: { flex: 1, fontSize: 13, color: '#444', paddingRight: 8 },
  rowValue: { fontSize: 13, color: '#222', textAlign: 'right' },
  bold: { fontWeight: 'bold' },
  muted: { fontSize: 12, color: '#666', marginVertical: 2 },
  hint: { fontSize: 11, color: '#777', marginTop: 2, marginBottom: 4 },
  reason: { fontSize: 12, color: '#333', marginTop: 2 },
  indicator: { borderRadius: 10, padding: 14, marginBottom: 10 },
  indicatorTitle: { fontSize: 11, fontWeight: 'bold', color: '#555', marginBottom: 4 },
  indicatorLabel: { fontSize: 17, fontWeight: 'bold' },
  veryTight: { fontSize: 15, fontWeight: 'bold', color: '#c0392b', marginTop: 4 },
  warnText: { fontSize: 13, color: '#b35c00', fontWeight: 'bold', marginVertical: 4 },
  strongWarn: { fontSize: 13, color: '#fff', backgroundColor: '#c0392b', padding: 8, borderRadius: 6, marginVertical: 6, fontWeight: 'bold' },
  okText: { fontSize: 13, color: '#155724', fontWeight: 'bold', marginVertical: 4 },
  errorText: { fontSize: 13, color: '#c0392b', marginTop: 8 },
  badge: { alignSelf: 'flex-start', backgroundColor: '#6f42c1', color: '#fff', fontSize: 11, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, marginBottom: 4 },
  statusBadge: { alignSelf: 'flex-start', backgroundColor: '#e9ecef', color: '#333', fontSize: 11, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginBottom: 4 },
  scLine: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#eee' },
  scLabel: { fontSize: 12, fontWeight: 'bold', color: '#555' },
  scValue: { fontSize: 13, color: '#222' },
  problemRow: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f1c0c0' },
  productCard: { backgroundColor: '#fafafa', borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#eee' },
  collapseBtn: { paddingVertical: 12, marginTop: 4 },
  collapseText: { fontSize: 15, fontWeight: 'bold', color: '#6f42c1' },
  field: { marginBottom: 8 },
  fieldLabel: { fontSize: 13, fontWeight: 'bold', color: '#444', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: '#6f42c1', marginRight: 6, marginBottom: 6, backgroundColor: '#fff' },
  chipActive: { backgroundColor: '#6f42c1' },
  chipText: { color: '#6f42c1', fontWeight: 'bold', fontSize: 13 },
  chipTextActive: { color: '#fff' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 6, marginRight: 6, marginBottom: 6 },
  actionText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
});
