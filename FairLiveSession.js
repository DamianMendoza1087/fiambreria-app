// 🎪 Jornada de Feria en vivo — Feria Damyale (branch_id=2)
// Responde DURANTE y DESPUÉS de la Feria cuánto se vendió, cuánto margen dejó y cómo vamos
// contra los objetivos del plan. Las ventas salen de las ventas normales de la app: acá no se
// carga nada a mano. El backend calcula todo; este componente solo muestra lo que devuelve.
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator, Platform, Alert } from 'react-native';
import { fetchFairDayPlan, fetchFairDayPlans, fetchOpenFairDayPlan, openFairDayPlan, fetchFairDayPlanLive, closeFairDayPlan } from './api';

const FAIR_BRANCH_ID = 2;
const LIVE_REFRESH_MS = 60000;

export const PLAN_TYPE_LABELS = {
  SABADO: 'Sábado', DOMINGO: 'Domingo', FIN_DE_SEMANA: 'Fin de semana',
  FERIADO: 'Feriado', EXTRAORDINARIA: 'Extraordinaria', PERSONALIZADA: 'Personalizada',
};

// Indicador en vivo (distinto del semáforo previo de "¿Conviene abrir?").
export const LIVE_INDICATOR = {
  FALTA_EQUILIBRIO: { label: '🔴 FALTA PARA EQUILIBRIO', color: '#721c24', bg: '#f8d7da' },
  EQUILIBRIO_ALCANZADO: { label: '🟡 EQUILIBRIO ALCANZADO', color: '#856404', bg: '#fff3cd' },
  OBJETIVO_ALCANZADO: { label: '🟢 OBJETIVO ALCANZADO', color: '#155724', bg: '#d4edda' },
};

const STATUS_LABELS = { BORRADOR: 'Borrador', PLANIFICADA: 'Planificada', ABIERTA: '🎪 En curso', CERRADA: '🔒 Cerrada', CANCELADA: 'Cancelada' };

// ---------- Utilidades de presentación (sin fórmulas económicas) ----------

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

// El backend ya devuelve la hora argentina ("2026-10-17T09:00:00-03:00"): se muestra tal cual.
export const arIsoText = (iso) => {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(iso));
  if (!m) return String(iso);
  return m[4] ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : `${m[3]}/${m[2]}/${m[1]}`;
};

export const elapsedText = (minutes) => {
  const total = Math.max(0, Math.floor(Number(minutes) || 0));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days > 0) return `${days} d ${hours} h ${mins} min`;
  if (hours > 0) return `${hours} h ${mins} min`;
  return `${mins} min`;
};

export const pctText = (ratio) => {
  if (ratio === null || ratio === undefined || Number.isNaN(Number(ratio))) return '—';
  return `${(Number(ratio) * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
};

// Ancho visual de la barra de progreso (0–100). Solo presentación.
export const progressWidth = (ratio) => {
  const n = Number(ratio);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, n * 100);
};

// "Falta" nunca negativo: si se superó se muestra "SUPERADO +$X" (montos del backend).
export const missingText = (objective, money) => {
  if (!objective) return '—';
  if (objective.reached) return `SUPERADO +${money(objective.surplus || 0)}`;
  return `Falta ${money(objective.missing)}`;
};

export const periodText = (data) => {
  if (!data) return '—';
  const from = data.start_date_display || data.start_date;
  const to = data.end_date_display || data.end_date;
  return to && to !== from ? `${from} → ${to}` : from;
};

// Jornadas iniciadas (en curso primero, después las cerradas más recientes).
export const sessionHistory = (plans) => (Array.isArray(plans) ? plans : [])
  .filter(p => p && (p.status === 'ABIERTA' || p.status === 'CERRADA'))
  .sort((a, b) => (a.status === 'ABIERTA' ? -1 : 0) - (b.status === 'ABIERTA' ? -1 : 0)
    || String(b.start_date).localeCompare(String(a.start_date)) || (b.id - a.id));

export const objectiveLines = (live, money) => {
  const obj = live?.objectives || {};
  const lines = [`Equilibrio (margen necesario ${money(obj.equilibrium?.required_margin)}): ${missingText(obj.equilibrium, money)}`];
  if (obj.debt?.applies) lines.push(`Objetivo deuda ${money(obj.debt.objective_amount)}: ${missingText(obj.debt, money)}`);
  if (obj.profit?.applies) lines.push(`Ganancia deseada ${money(obj.profit.objective_amount)}`);
  if (obj.total?.applies) lines.push(`Objetivo total ${money(obj.total.objective_amount)}: ${missingText(obj.total, money)}`);
  return lines;
};

export const closeSummaryText = (live, money) => {
  const r = live?.result || {};
  return [
    `Ventas totales: ${money(r.revenue)}`,
    `Costo real mercadería: ${money(r.cogs)}`,
    `Margen bruto: ${money(r.gross_margin)}`,
    `Costos operativos planificados: ${money(r.planned_operating_costs)}`,
    `Gastos extraordinarios: ${money(r.extra_expenses)}`,
    `Mermas a costo: ${money(r.losses_at_cost)}`,
    `Resultado operativo: ${money(r.operating_result)}`,
    '',
    ...objectiveLines(live, money),
    '',
    'Una vez cerrada, la jornada queda en solo lectura.',
  ].join('\n');
};

export const openSummaryText = (plan, money) => [
  `Fecha: ${periodText(plan)}`,
  `Tipo: ${PLAN_TYPE_LABELS[plan?.plan_type] || plan?.plan_type || '—'}`,
  'Sucursal: Feria Damyale',
  `Costo operativo total: ${money(plan?.operating_cost_total)}`,
  `Objetivo total: ${money(plan?.objective_total)}`,
  '',
  'Desde ahora, las ventas de Feria entran automáticamente en esta jornada.',
].join('\n');

// ---------- Bloques de interfaz ----------

const Row = ({ label, value, strong, color, hint }) => (
  <View style={s.rowWrap}>
    <View style={s.row}>
      <Text style={[s.rowLabel, strong && s.bold]}>{label}</Text>
      <Text style={[s.rowValue, strong && s.bold, color && { color }]}>{value}</Text>
    </View>
    {hint ? <Text style={s.hint}>{hint}</Text> : null}
  </View>
);

const ProgressBar = ({ ratio }) => (
  <View style={s.barTrack}>
    <View style={[s.barFill, { width: `${progressWidth(ratio)}%` }]} />
  </View>
);

const ObjectiveCard = ({ title, objective, objectiveAmount, revenue, money }) => {
  if (!objective) return null;
  return (
    <View style={[s.card, objective.reached && s.okCard]}>
      <Text style={s.cardTitle}>{title}</Text>
      {objectiveAmount !== undefined ? <Row label="Monto objetivo" value={money(objectiveAmount)} /> : null}
      <Row label="Margen necesario" value={money(objective.required_margin)} />
      <Row label="Vendido" value={money(revenue)} />
      <Row label="Margen generado" value={money(objective.gross_margin)} />
      <Text style={[s.missing, { color: objective.reached ? '#155724' : '#c0392b' }]}>{missingText(objective, money)}</Text>
      <ProgressBar ratio={objective.progress_pct} />
      <Text style={s.muted}>Progreso: {pctText(objective.progress_pct)}</Text>
      {!objective.reached && objective.estimated_sales_missing !== null && objective.estimated_sales_missing !== undefined ? (
        <Text style={s.hint}>≈ {money(objective.estimated_sales_missing)} más de ventas al margen actual</Text>
      ) : null}
      <Text style={s.hint}>Plan original: margen necesario {money(objective.plan_required_margin)}</Text>
    </View>
  );
};

const BucketColumn = ({ title, b, money }) => (
  <View style={s.col}>
    <Text style={s.colTitle}>{title}</Text>
    <Text style={s.colValue}>{money(b?.revenue)}</Text>
    <Text style={s.muted}>{b?.sales_count ?? 0} venta(s)</Text>
    <Text style={s.muted}>COGS {money(b?.cogs)}</Text>
    <Text style={s.muted}>Margen {money(b?.gross_margin)}</Text>
    <Text style={s.muted}>Gastos extra {money(b?.extra_expenses)}</Text>
    <Text style={s.muted}>Mermas {money(b?.losses_at_cost)}</Text>
  </View>
);

export function LiveView({ live, money }) {
  if (!live) return null;
  const r = live.result || {};
  const acc = live.accumulated || {};
  const obj = live.objectives || {};
  const pc = live.planned_operating_costs || {};
  const ind = LIVE_INDICATOR[live.indicator?.code] || {};
  const warnings = Array.isArray(live.warnings) ? live.warnings : [];
  const outOfPeriod = warnings.find(w => w?.code === 'ABIERTA_FUERA_DE_PERIODO');
  const otherWarnings = warnings.filter(w => w?.code !== 'ABIERTA_FUERA_DE_PERIODO');
  const closed = live.status === 'CERRADA';
  const days = Array.isArray(live.days) ? live.days : [];
  const outcomes = Array.isArray(live.outcomes) ? live.outcomes : [];
  const resultColor = Number(r.operating_result) < 0 ? '#c0392b' : '#155724';

  return (
    <View>
      <View style={s.header}>
        <Text style={s.title}>{closed ? '📋 JORNADA CERRADA' : '🎪 FERIA EN VIVO'}</Text>
        <Text style={s.subtitle}>{live.branch_name || 'Feria Damyale'} · {PLAN_TYPE_LABELS[live.plan_type] || live.plan_type} · {periodText(live)}</Text>
        <Text style={s.muted}>Abrió {live.opened_by || '—'} el {arIsoText(live.opened_at)}</Text>
        {closed ? (
          <Text style={s.muted}>Cerró {live.closed_by || '—'} el {arIsoText(live.closed_at)} · duración {elapsedText(live.elapsed_minutes)}</Text>
        ) : (
          <Text style={s.muted}>Tiempo desde apertura: {elapsedText(live.elapsed_minutes)} · actualizado {arIsoText(live.computed_at)}</Text>
        )}
      </View>

      {outOfPeriod ? <Text style={s.strongWarn}>{outOfPeriod.detail}</Text> : null}
      {closed ? <Text style={s.readOnly}>🔒 Solo lectura: resultado guardado al cerrar, no se recalcula.</Text> : null}

      <View style={[s.indicator, { backgroundColor: ind.bg || '#e9ecef' }]}>
        <Text style={s.indicatorTitle}>{closed ? 'RESULTADO DE LA JORNADA' : 'CÓMO VAMOS'}</Text>
        <Text style={[s.indicatorLabel, { color: ind.color || '#333' }]}>{ind.label || live.indicator?.label || '—'}</Text>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>💵 Ventas y margen</Text>
        <Row label="VENTAS REALES" value={money(r.revenue)} strong hint="Lo realmente cobrado (en promociones, el precio promo)." />
        <Row label="− Costo real de mercadería vendida" value={money(r.cogs)} hint="Costo histórico de cada venta (FEFO)." />
        <Row label="= MARGEN BRUTO REAL" value={`${money(r.gross_margin)} (${pctText(r.gross_margin_pct)})`} strong />
        <Text style={s.hint}>Vender no es ganar: el margen es lo que queda después de pagar la mercadería.</Text>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>🧾 Costos de la jornada</Text>
        <Row label="− Costos operativos planificados" value={money(r.planned_operating_costs)}
          hint={`Puesto ${money(pc.stall)} · Personal ${money(pc.staff)} · Transporte ${money(pc.transport)} · Otros ${money(pc.other)}`} />
        <Row label="− Gastos extraordinarios reales" value={money(r.extra_expenses)} hint="Caja: operativo, servicios, compra menor, otro." />
        <Row label="− Mermas reales (a costo)" value={money(r.losses_at_cost)} hint={`${acc.losses_count ?? 0} merma(s) registradas en Feria durante la jornada.`} />
        <Row label="= RESULTADO OPERATIVO REAL" value={money(r.operating_result)} strong color={resultColor} />
      </View>

      {live.multi_day && live.today ? (
        <View style={s.card}>
          <Text style={s.cardTitle}>📅 HOY vs ACUMULADO</Text>
          <View style={s.cols}>
            <BucketColumn title={`HOY ${arIsoText(live.today.date)}`} b={live.today} money={money} />
            <BucketColumn title="ACUMULADO" b={acc} money={money} />
          </View>
        </View>
      ) : null}

      <Text style={s.sectionTitle}>🎯 Objetivos (deuda y ganancia no son gastos)</Text>
      <ObjectiveCard title="⚖️ Equilibrio" objective={obj.equilibrium} revenue={r.revenue} money={money} />
      {obj.debt?.applies ? (
        <ObjectiveCard title="💳 Objetivo con deuda" objective={obj.debt} objectiveAmount={obj.debt.objective_amount} revenue={r.revenue} money={money} />
      ) : null}
      {obj.total?.applies ? (
        <ObjectiveCard title="🌟 Objetivo favorable (deuda + ganancia deseada)" objective={obj.total}
          objectiveAmount={obj.total.objective_amount} revenue={r.revenue} money={money} />
      ) : null}
      {obj.profit?.applies ? <Text style={s.hint}>Ganancia deseada del plan: {money(obj.profit.objective_amount)}</Text> : null}

      {outcomes.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>{closed ? '🏁 Resultado final' : '📌 Resultado parcial'}</Text>
          {outcomes.map((o) => (
            <Text key={o.code} style={s.outcome}>{o.label}: {money(o.amount)}</Text>
          ))}
        </View>
      )}

      <View style={s.card}>
        <Text style={s.cardTitle}>ℹ️ Informativo (no se resta)</Text>
        <Row label="Pagos a empleados registrados" value={money(acc.employee_payments_info)}
          hint="Informativo — personal ya contemplado en el plan." />
        <Row label="Pagos a proveedores" value={money(acc.supplier_payments_excluded)} hint="Excluidos — la mercadería vendida entra por su costo (COGS)." />
        <Row label="Retiros del dueño" value={money(acc.owner_withdrawals_excluded)} hint="Excluidos del resultado operativo." />
        <Row label="Ventas con promoción" value={`${acc.promo_sales_count ?? 0} · ${money(acc.promo_revenue)}`} />
        <Row label="Capital disponible del plan" value={money(live.targets?.capital_available)} />
      </View>

      {days.length > 1 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>📆 Por día</Text>
          {days.map((d) => (
            <Row key={d.date} label={`${arIsoText(d.date)} · ${d.sales_count} venta(s)`} value={`${money(d.revenue)} · margen ${money(d.gross_margin)}`} />
          ))}
        </View>
      )}

      {otherWarnings.length > 0 && (
        <View style={[s.card, s.warnCard]}>
          <Text style={s.cardTitle}>⚠️ Calidad de datos</Text>
          {otherWarnings.map((w, i) => <Text key={`w-${i}`} style={s.reason}>• {w.detail || w.code}</Text>)}
          {(live.data_quality?.sales_total_mismatches || []).map((m) => (
            <Text key={`mm-${m.sale_id}`} style={s.muted}>Venta #{m.sale_id}: cobrado {money(m.total_amount)} · ítems {money(m.items_revenue)}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

// ---------- Componente ----------

// mode: 'current' (jornada en curso) | 'history' (jornadas anteriores) | 'start' (iniciar planId)
export default function FairLiveSession({ mode = 'current', planId = null, userEmail, formatMoney, onBack }) {
  const [view, setView] = useState(mode === 'history' ? 'history' : mode === 'start' ? 'start' : 'loading');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [startPlan, setStartPlan] = useState(null);
  const [live, setLive] = useState(null);
  const [openable, setOpenable] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [backTo, setBackTo] = useState(null);

  const money = (v) => (v === null || v === undefined ? '—' : formatMoney(v));

  const runExclusive = async (fn) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      setError('');
      await fn();
    } catch (e) {
      const msg = e?.message || 'Error desconocido';
      setError(msg);
      notify('No se pudo completar la operación', msg);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const loadCurrent = () => runExclusive(async () => {
    const res = await fetchOpenFairDayPlan(FAIR_BRANCH_ID);
    if (res?.open && res.plan?.id) {
      setLive(await fetchFairDayPlanLive(res.plan.id));
      setView('live');
      return;
    }
    const plans = await fetchFairDayPlans(FAIR_BRANCH_ID);
    setOpenable((Array.isArray(plans) ? plans : []).filter(p => p?.can_open_today));
    setView('none');
  });

  const loadStart = (id) => runExclusive(async () => {
    const d = await fetchFairDayPlan(id);
    setStartPlan(d?.plan || null);
    setView('start');
  });

  const loadHistory = () => runExclusive(async () => {
    const plans = await fetchFairDayPlans(FAIR_BRANCH_ID);
    setHistory(sessionHistory(plans));
    setHistoryLoaded(true);
    setView('history');
  });

  const openDetail = (id) => runExclusive(async () => {
    setLive(await fetchFairDayPlanLive(id));
    setBackTo('history');
    setView('live');
  });

  useEffect(() => {
    if (mode === 'history') loadHistory();
    else if (mode === 'start' && planId) loadStart(planId);
    else loadCurrent();
  }, [mode, planId]);

  // Mientras está abierta, se actualiza sola cada minuto (sin pisar otra operación en curso).
  const liveId = live?.plan_id;
  const liveOpen = view === 'live' && live?.status === 'ABIERTA';
  useEffect(() => {
    if (!liveOpen || !liveId) return undefined;
    const timer = setInterval(async () => {
      if (busyRef.current) return;
      try { setLive(await fetchFairDayPlanLive(liveId)); } catch (_) { /* se reintenta en el próximo ciclo */ }
    }, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [liveOpen, liveId]);

  const refreshLive = () => runExclusive(async () => {
    setLive(await fetchFairDayPlanLive(live.plan_id));
  });

  const startSession = () => {
    if (!startPlan) return;
    // Si ya hay otra jornada en curso, el backend lo rechaza y se ofrece «Ver jornada en curso».
    confirmAction('▶️ Iniciar jornada', openSummaryText(startPlan, money), 'Iniciar jornada', () => runExclusive(async () => {
      const res = await openFairDayPlan(startPlan.id, userEmail || null);
      setLive(res);
      setBackTo(null);
      setView('live');
    }));
  };

  const closeSession = async () => {
    // Se trae el resultado actualizado para mostrarlo en la confirmación.
    let fresh = null;
    await runExclusive(async () => {
      fresh = await fetchFairDayPlanLive(live.plan_id);
      setLive(fresh);
    });
    if (!fresh || fresh.status !== 'ABIERTA') return;
    confirmAction('🔒 Cerrar jornada', closeSummaryText(fresh, money), 'Cerrar jornada', () => runExclusive(async () => {
      const final = await closeFairDayPlan(fresh.plan_id, userEmail || null);
      setLive(final);
      notify('🔒 Jornada cerrada', 'El resultado quedó guardado y no va a cambiar.');
    }));
  };

  const back = () => {
    if (view === 'live' && backTo === 'history') { setBackTo(null); loadHistory(); return; }
    if (onBack) onBack();
  };

  const backBtn = (
    <TouchableOpacity onPress={back} disabled={busy} style={s.backBtn}>
      <Text style={s.backText}>{view === 'live' && backTo === 'history' ? '← Jornadas anteriores' : '← Volver a Feria'}</Text>
    </TouchableOpacity>
  );

  const errorBox = error ? (
    <View style={[s.card, s.dangerCard]}>
      <Text style={s.errorText}>{error}</Text>
      {/en curso/i.test(error) ? (
        <TouchableOpacity style={[s.bigBtn, { backgroundColor: '#6f42c1' }]} onPress={loadCurrent} disabled={busy}>
          <Text style={s.bigBtnText}>🎪 VER JORNADA EN CURSO</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  ) : null;

  if (view === 'loading') {
    return (
      <ScrollView contentContainerStyle={s.container}>
        {backBtn}
        {busy ? <ActivityIndicator color="#6f42c1" style={{ marginVertical: 20 }} /> : null}
        {errorBox}
        {!busy && error ? (
          <TouchableOpacity style={s.secondaryBtn} onPress={loadCurrent}><Text style={s.secondaryText}>↻ Reintentar</Text></TouchableOpacity>
        ) : null}
      </ScrollView>
    );
  }

  if (view === 'none') {
    return (
      <ScrollView contentContainerStyle={s.container}>
        {backBtn}
        <Text style={s.title}>🎪 Jornada en vivo</Text>
        <Text style={s.lead}>No hay ninguna jornada en curso.</Text>
        {errorBox}
        {openable.length > 0 ? <Text style={s.sectionTitle}>Planes que pueden iniciarse hoy</Text> : (
          <Text style={s.muted}>Ningún plan guardado incluye la fecha de hoy. Creá o revisá un plan en «¿Conviene abrir?».</Text>
        )}
        {openable.map((p) => (
          <View key={`op-${p.id}`} style={s.card}>
            <Text style={s.cardTitle}>Plan #{p.id} · {periodText(p)} · {PLAN_TYPE_LABELS[p.plan_type] || p.plan_type}</Text>
            <Row label="Costo operativo" value={money(p.operating_cost_total)} />
            <Row label="Objetivo total (margen)" value={money(p.objective_total)} />
            <TouchableOpacity style={[s.bigBtn, { backgroundColor: '#28a745' }]} onPress={() => loadStart(p.id)} disabled={busy}>
              <Text style={s.bigBtnText}>▶️ INICIAR JORNADA</Text>
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={s.secondaryBtn} onPress={loadCurrent} disabled={busy}>
          <Text style={s.secondaryText}>↻ Actualizar</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (view === 'start') {
    const p = startPlan;
    return (
      <ScrollView contentContainerStyle={s.container}>
        {backBtn}
        <Text style={s.title}>▶️ Iniciar jornada</Text>
        {errorBox}
        {!p ? (busy ? <ActivityIndicator color="#6f42c1" /> : <Text style={s.muted}>No se pudo cargar el plan.</Text>) : (
          <>
            <View style={s.card}>
              <Text style={s.cardTitle}>Plan #{p.id}</Text>
              <Row label="Fecha" value={periodText(p)} />
              <Row label="Tipo" value={PLAN_TYPE_LABELS[p.plan_type] || p.plan_type} />
              <Row label="Sucursal" value="Feria Damyale" />
              <Row label="Estado" value={STATUS_LABELS[p.status] || p.status} />
            </View>
            <View style={s.card}>
              <Text style={s.cardTitle}>🧾 Costos planificados (quedan congelados)</Text>
              <Row label="Costo del puesto" value={money(p.stall_total)} />
              <Row label="Personal" value={money(p.staff_total)} />
              <Row label="Transporte" value={money(p.transport_total)} />
              <Row label="Otros gastos" value={money(p.other_expenses)} />
              <Row label="COSTO OPERATIVO TOTAL" value={money(p.operating_cost_total)} strong />
            </View>
            <View style={s.card}>
              <Text style={s.cardTitle}>🎯 Objetivos (no son gastos)</Text>
              <Row label="Objetivo equilibrio (margen)" value={money(p.objective_equilibrium)} />
              <Row label="Deuda objetivo" value={money(p.debt_target)} />
              <Row label="Objetivo con deuda (margen)" value={money(p.objective_with_debt)} />
              <Row label="Ganancia deseada" value={money(p.profit_target)} />
              <Row label="Objetivo total (margen)" value={money(p.objective_total)} strong />
              <Row label="Capital disponible" value={money(p.capital_available)} />
            </View>
            {p.can_open_today ? (
              <TouchableOpacity style={[s.bigBtn, { backgroundColor: busy ? '#999' : '#28a745' }]} onPress={startSession} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.bigBtnText}>▶️ INICIAR JORNADA</Text>}
              </TouchableOpacity>
            ) : (
              <Text style={s.warnText}>
                {['BORRADOR', 'PLANIFICADA'].includes(p.status)
                  ? `Este plan solo puede iniciarse entre el ${p.start_date_display} y el ${p.end_date_display}.`
                  : `Un plan en estado ${STATUS_LABELS[p.status] || p.status} no puede iniciarse.`}
              </Text>
            )}
          </>
        )}
      </ScrollView>
    );
  }

  if (view === 'history') {
    return (
      <ScrollView contentContainerStyle={s.container}>
        {backBtn}
        <Text style={s.title}>📋 Jornadas anteriores</Text>
        {errorBox}
        {busy && <ActivityIndicator color="#6f42c1" style={{ marginVertical: 10 }} />}
        {historyLoaded && history.length === 0 && <Text style={s.muted}>Todavía no hay jornadas iniciadas.</Text>}
        {history.map((p) => {
          const sum = p.session_summary || {};
          return (
            <View key={`h-${p.id}`} style={s.card}>
              <Text style={s.cardTitle}>{periodText(p)} · {PLAN_TYPE_LABELS[p.plan_type] || p.plan_type}</Text>
              <Text style={s.statusBadge}>{STATUS_LABELS[p.status] || p.status}</Text>
              <Row label="Ventas" value={money(sum.revenue)} />
              <Row label="Margen bruto" value={money(sum.gross_margin)} />
              <Row label="Resultado operativo" value={money(sum.operating_result)} strong
                color={Number(sum.operating_result) < 0 ? '#c0392b' : '#155724'} />
              {sum.indicator?.label ? <Text style={s.muted}>{sum.indicator.label}</Text> : null}
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#007bff' }]} onPress={() => openDetail(p.id)} disabled={busy}>
                <Text style={s.actionText}>VER DETALLE</Text>
              </TouchableOpacity>
            </View>
          );
        })}
        <TouchableOpacity style={s.secondaryBtn} onPress={loadHistory} disabled={busy}>
          <Text style={s.secondaryText}>↻ Actualizar listado</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // view === 'live'
  const isOpen = live?.status === 'ABIERTA';
  return (
    <ScrollView contentContainerStyle={s.container}>
      {backBtn}
      {errorBox}
      <LiveView live={live} money={money} />
      {isOpen && (
        <>
          <TouchableOpacity style={s.secondaryBtn} onPress={refreshLive} disabled={busy}>
            {busy ? <ActivityIndicator color="#6f42c1" /> : <Text style={s.secondaryText}>↻ Actualizar ahora</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[s.bigBtn, { backgroundColor: busy ? '#999' : '#343a40' }]} onPress={closeSession} disabled={busy}>
            <Text style={s.bigBtnText}>🔒 CERRAR JORNADA</Text>
          </TouchableOpacity>
          <Text style={s.hint}>Si la jornada es de varios días no hace falta cerrarla cada día: cerrala al terminar el período.</Text>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 8 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#6f42c1', marginBottom: 4 },
  subtitle: { fontSize: 14, fontWeight: 'bold', color: '#555' },
  lead: { fontSize: 14, color: '#444', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#222', marginTop: 12, marginBottom: 8 },
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
  cardTitle: { fontSize: 15, fontWeight: 'bold', marginBottom: 6, color: '#222' },
  rowWrap: { paddingVertical: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  rowLabel: { flex: 1, fontSize: 13, color: '#444', paddingRight: 8 },
  rowValue: { fontSize: 13, color: '#222', textAlign: 'right' },
  bold: { fontWeight: 'bold' },
  muted: { fontSize: 12, color: '#666', marginVertical: 1 },
  hint: { fontSize: 11, color: '#777', marginTop: 1, marginBottom: 3 },
  reason: { fontSize: 12, color: '#333', marginTop: 2 },
  indicator: { borderRadius: 12, padding: 16, marginBottom: 10, alignItems: 'center' },
  indicatorTitle: { fontSize: 11, fontWeight: 'bold', color: '#555', marginBottom: 4 },
  indicatorLabel: { fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  missing: { fontSize: 18, fontWeight: 'bold', marginTop: 6 },
  barTrack: { height: 10, backgroundColor: '#e9ecef', borderRadius: 5, overflow: 'hidden', marginVertical: 6 },
  barFill: { height: 10, backgroundColor: '#6f42c1' },
  cols: { flexDirection: 'row' },
  col: { flex: 1, paddingRight: 6 },
  colTitle: { fontSize: 12, fontWeight: 'bold', color: '#555' },
  colValue: { fontSize: 17, fontWeight: 'bold', color: '#222', marginVertical: 2 },
  outcome: { fontSize: 14, fontWeight: 'bold', marginVertical: 2, color: '#222' },
  strongWarn: { fontSize: 14, color: '#fff', backgroundColor: '#c0392b', padding: 10, borderRadius: 8, marginVertical: 6, fontWeight: 'bold' },
  readOnly: { fontSize: 12, color: '#495057', backgroundColor: '#e9ecef', padding: 8, borderRadius: 6, marginBottom: 8 },
  warnText: { fontSize: 13, color: '#b35c00', fontWeight: 'bold', marginVertical: 6 },
  errorText: { fontSize: 13, color: '#c0392b' },
  statusBadge: { alignSelf: 'flex-start', backgroundColor: '#e9ecef', color: '#333', fontSize: 11, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginBottom: 4 },
  actionBtn: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 6, marginTop: 6 },
  actionText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
});
