// 🏷️ Cartelería V2
// Un único "modelo" del cartel (textos, precio, unidad, etiqueta) y un único cálculo de
// tamaños alimentan tanto la vista previa de la app como el HTML que se imprime.
// Cartelería solo LEE datos comerciales: no modifica precios, stock ni promociones.
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Platform, Alert } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

export const BADGES = [
  ['SIN_ETIQUETA', 'Sin etiqueta'],
  ['OFERTA', 'OFERTA'],
  ['NUEVO', 'NUEVO'],
  ['RECOMENDADO', 'RECOMENDADO'],
  ['IMPERDIBLE', 'IMPERDIBLE'],
  ['IDEAL PARA PICADAS', 'IDEAL PARA PICADAS'],
];

export const KG_OPTIONS = [
  ['100g', '100 g', 0.1],
  ['1/4', '1/4 kg', 0.25],
  ['1/2', '1/2 kg', 0.5],
  ['1', '1 kg', 1],
  ['custom', 'Personalizado', null],
];

// Comillas simples: estos valores van dentro de atributos style="..." del HTML.
const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = 'Arial, Helvetica, sans-serif';
const HEAVY = "'Arial Black', 'Arial Bold', Arial, Helvetica, sans-serif";

export const TEMPLATES = {
  CLASICO: {
    label: 'Clásico', bg: '#FFFDF6', fg: '#3E2723', border: '#3E2723', borderW: 0.9, innerFrame: true,
    titleFont: SERIF, titleWeight: '700', titleUpper: true, brandColor: '#6D4C41',
    priceFg: '#B71C1C', priceBg: null, unitColor: '#3E2723', secondaryColor: '#5D4037',
    badgeBg: '#B71C1C', badgeFg: '#FFFFFF', badgeBorder: null, rule: '#B71C1C',
  },
  OFERTA: {
    label: 'Oferta', bg: '#FFEB3B', fg: '#111111', border: '#D50000', borderW: 1.6, innerFrame: false,
    titleFont: HEAVY, titleWeight: '900', titleUpper: true, brandColor: '#333333',
    priceFg: '#FFFFFF', priceBg: '#D50000', unitColor: '#111111', secondaryColor: '#333333',
    badgeBg: '#D50000', badgeFg: '#FFFFFF', badgeBorder: '#111111', rule: null, defaultBadge: 'OFERTA',
  },
  PREMIUM: {
    label: 'Premium', bg: '#141414', fg: '#F4EFE6', border: '#C9A227', borderW: 0.5, innerFrame: true,
    titleFont: SERIF, titleWeight: '400', titleUpper: true, titleSpacing: 0.08, brandColor: '#C9A227',
    priceFg: '#C9A227', priceBg: null, unitColor: '#F4EFE6', secondaryColor: '#BDB6A8',
    badgeBg: null, badgeFg: '#C9A227', badgeBorder: '#C9A227', rule: '#C9A227',
  },
  FERIA: {
    label: 'Feria', bg: '#C62828', fg: '#FFFFFF', border: '#111111', borderW: 2.2, innerFrame: false,
    titleFont: HEAVY, titleWeight: '900', titleUpper: true, brandColor: '#FFE082',
    priceFg: '#111111', priceBg: '#FFEB3B', unitColor: '#FFFFFF', secondaryColor: '#FFE082',
    badgeBg: '#111111', badgeFg: '#FFEB3B', badgeBorder: null, rule: null,
  },
};

// Medidas en mm. Las hojas A4 se arman con celdas posicionadas: así el PDF respeta el formato.
export const FORMATS = {
  A4_VERTICAL: {
    label: 'A4 vertical', landscape: false, page: { w: 210, h: 297 },
    cells: [{ x: 10, y: 10, w: 190, h: 277 }], cuts: [],
  },
  A4_HORIZONTAL: {
    label: 'A4 horizontal', landscape: true, page: { w: 297, h: 210 },
    cells: [{ x: 10, y: 10, w: 277, h: 190 }], cuts: [],
  },
  A4_2: {
    label: '2 por A4', landscape: false, page: { w: 210, h: 297 },
    cells: [{ x: 8, y: 8, w: 194, h: 136.5 }, { x: 8, y: 152.5, w: 194, h: 136.5 }],
    cuts: [{ dir: 'h', at: 148.5 }],
  },
  A4_4: {
    label: '4 por A4', landscape: false, page: { w: 210, h: 297 },
    cells: [
      { x: 8, y: 8, w: 93, h: 136.5 }, { x: 109, y: 8, w: 93, h: 136.5 },
      { x: 8, y: 152.5, w: 93, h: 136.5 }, { x: 109, y: 152.5, w: 93, h: 136.5 },
    ],
    cuts: [{ dir: 'h', at: 148.5 }, { dir: 'v', at: 105 }],
  },
};

const MM_TO_PT = 72 / 25.4;

const VISUAL_LABELS = {
  horma_redonda: 'Horma redonda', horma_rectangular: 'Horma rectangular', barra: 'Barra',
  embutido_entero: 'Embutido entero', jamon_entero: 'Jamón entero', botella: 'Botella',
  paquete: 'Paquete', unidad: 'Unidad / pieza',
};

// ---------------------------------------------------------------------------
// Formato y datos
// ---------------------------------------------------------------------------

const groupThousands = (intStr) => intStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// "$8.990" si es entero, "$8.990,50" si tiene centavos (formato argentino).
export const formatPosterPrice = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const cents = Math.round(Math.abs(n) * 100);
  const intPart = groupThousands(String(Math.floor(cents / 100)));
  const dec = cents % 100;
  return `${n < 0 ? '-' : ''}$${intPart}${dec ? ',' + String(dec).padStart(2, '0') : ''}`;
};

// "0,300" / "0.75" / "1,25" -> número. Inválido -> NaN.
export const parseKg = (raw) => {
  const s = String(raw ?? '').trim().replace(',', '.');
  if (!/^\d*\.?\d+$/.test(s)) return NaN;
  return Number(s);
};

const round2 = (n) => Math.round(n * 100) / 100;

const kgUnitText = (kg) => {
  if (Math.abs(kg - 1) < 1e-9) return 'EL KG';
  if (kg < 1) return `LOS ${Math.round(kg * 1000)} g`;
  return `LOS ${String(Number(kg.toFixed(3))).replace('.', ',')} KG`;
};

export const formatQty = (qty, unitType) => {
  const q = Number(qty);
  if (!Number.isFinite(q)) return '';
  if (unitType === 'kg') {
    if (q < 1) return `${Math.round(q * 1000)} g`;
    return `${String(Number(q.toFixed(3))).replace('.', ',')} kg`;
  }
  return `${String(Number(q.toFixed(3))).replace('.', ',')} u.`;
};

export const productPrice = (product) => {
  // /products?branch_id=X ya devuelve price_per_unit resuelto para esa sucursal.
  const n = Number(product?.price_per_unit);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const buildProductModel = (product, opts) => {
  const errors = [];
  if (!product) return { errors: ['Seleccioná un producto.'] };
  const base = productPrice(product);
  if (base === null) errors.push('El producto no tiene un precio válido en esta sucursal.');

  const isKg = product.unit_type === 'kg';
  let factor = 1;
  if (isKg) {
    const opt = KG_OPTIONS.find(o => o[0] === opts.kgOption) || KG_OPTIONS[1];
    if (opt[0] === 'custom') {
      factor = parseKg(opts.customKg);
      if (!Number.isFinite(factor) || factor <= 0) errors.push('Ingresá una cantidad personalizada mayor a 0 (ej: 0,300).');
      else if (factor > 50) errors.push('La cantidad personalizada no puede superar 50 kg.');
    } else {
      factor = opt[2];
    }
  }
  if (errors.length) return { errors };

  // El precio fraccionado es solo presentación del cartel: no se guarda en ningún lado.
  const priceValue = isKg ? round2(base * factor) : base;
  const secondary = [];
  if (isKg && Math.abs(factor - 1) > 1e-9 && opts.showKgReference) secondary.push(`${formatPosterPrice(base)}/kg`);
  if (opts.extraText && opts.extraText.trim()) secondary.push(opts.extraText.trim());
  return {
    errors: [],
    kind: 'product',
    badge: opts.badge && opts.badge !== 'SIN_ETIQUETA' ? opts.badge : null,
    title: product.name || 'PRODUCTO',
    brand: opts.showBrand && product.brand ? product.brand : null,
    presentation: opts.showPresentation ? (VISUAL_LABELS[product.visual_presentation] || null) : null,
    priceValue,
    priceText: formatPosterPrice(priceValue),
    unitText: isKg ? kgUnitText(factor) : 'C/U',
    secondary,
  };
};

// Ahorro solo si es confiable: todos los componentes con precio vigente en ESTA sucursal.
export const promoSavings = (promo, branchProducts) => {
  const promoPrice = Number(promo?.promo_price);
  const items = Array.isArray(promo?.items) ? promo.items : [];
  if (!items.length) return { ok: false, reason: 'La promoción no tiene componentes.' };
  let normal = 0;
  for (const item of items) {
    const qty = Number(item.included_qty);
    const unitPrice = Number(item.regular_unit_price);
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: 'Hay componentes sin cantidad válida.' };
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return { ok: false, reason: 'Hay componentes sin precio normal.' };
    const prod = (branchProducts || []).find(p => p.id === item.product_id);
    if (!prod) return { ok: false, reason: `"${item.product_name || 'Un componente'}" no está habilitado en esta sucursal.` };
    if (prod.unit_type && item.unit_type && prod.unit_type !== item.unit_type) {
      return { ok: false, reason: `La unidad de "${item.product_name}" no coincide con la del producto.` };
    }
    const current = productPrice(prod);
    if (current === null || Math.abs(current - unitPrice) > 0.005) {
      return { ok: false, reason: `El precio de "${item.product_name}" no coincide con el vigente en esta sucursal.` };
    }
    normal += round2(qty * unitPrice);
  }
  normal = round2(normal);
  if (!(normal > promoPrice + 0.009)) return { ok: false, reason: 'El precio normal no supera al promocional.' };
  return { ok: true, normal, savings: round2(normal - promoPrice) };
};

export const buildPromoModel = (promo, branchProducts, opts) => {
  if (!promo) return { errors: ['Seleccioná una promoción.'] };
  const price = Number(promo.promo_price);
  if (!Number.isFinite(price) || price <= 0) return { errors: ['La promoción no tiene un precio válido en esta sucursal.'] };
  const sav = promoSavings(promo, branchProducts);
  const secondary = [];
  if (opts.extraText && opts.extraText.trim()) secondary.push(opts.extraText.trim());
  return {
    errors: [],
    kind: 'promo',
    badge: opts.badge && opts.badge !== 'SIN_ETIQUETA' ? opts.badge : null,
    title: promo.name || 'PROMOCIÓN',
    description: promo.description || null,
    items: (promo.items || []).map(i => ({ qty: formatQty(i.included_qty, i.unit_type), name: i.product_name || 'Componente' })),
    priceValue: price,
    priceText: formatPosterPrice(price),
    unitText: null,
    savings: opts.showSavings && sav.ok ? { normalText: formatPosterPrice(sav.normal), savingsText: formatPosterPrice(sav.savings) } : null,
    savingsInfo: sav,
    secondary,
  };
};

// Tamaños (en mm) según el tamaño real de la celda. Lo usan la vista previa y el PDF.
export const computeLayout = (model, W, H, template) => {
  const u = Math.min(H, W * 1.42) / 100;
  const charW = 0.62; // ancho medio de un carácter en relación al tamaño de fuente
  const fitWidth = (text, size, lines = 1, ratio = 0.9) => {
    const len = Math.max(1, String(text || '').length);
    return Math.min(size, (W * ratio * lines) / (len * charW));
  };
  const isPromo = model.kind === 'promo';
  const itemCount = isPromo ? model.items.length : 0;
  const title = fitWidth(model.title, (isPromo ? 7 : 8.5) * u, 2);
  const price = fitWidth(model.priceText, (isPromo ? 17 : 22) * u - Math.max(0, itemCount - 3) * u, 1, template.priceBg ? 0.78 : 0.9);
  return {
    pad: 4 * u,
    border: template.borderW * u,
    badge: Math.min(4.2 * u, fitWidth(model.badge || '', 4.2 * u, 1, 0.7)),
    title: Math.max(title, 3 * u),
    brand: 3.6 * u,
    presentation: 2.8 * u,
    items: Math.max(2.4 * u, (itemCount > 4 ? 3 : 3.8) * u),
    price: Math.max(price, 6 * u),
    unit: 5 * u,
    secondary: 3.2 * u,
    savings: 3.4 * u,
    // En celdas altas (A4 vertical, 4 por hoja) se separan más los bloques para usar la altura.
    gap: (H > W * 1.3 ? 2.6 : 1.6) * u,
  };
};

// ---------------------------------------------------------------------------
// HTML (PDF / impresión)
// ---------------------------------------------------------------------------

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const posterInnerHtml = (model, t, L) => {
  const mm = (v) => `${v.toFixed(2)}mm`;
  const upper = (s) => (t.titleUpper ? String(s).toUpperCase() : s);
  const parts = [];
  if (model.badge) {
    parts.push(`<div style="display:inline-block;background:${t.badgeBg || 'transparent'};color:${t.badgeFg};${t.badgeBorder ? `border:${mm(L.border * 0.5)} solid ${t.badgeBorder};` : ''}font-family:${HEAVY};font-weight:900;font-size:${mm(L.badge)};letter-spacing:0.08em;padding:${mm(L.badge * 0.25)} ${mm(L.badge * 0.7)};border-radius:${mm(L.badge * 0.2)};margin-bottom:${mm(L.gap * 1.2)};">${esc(model.badge)}</div>`);
  }
  parts.push(`<div style="font-family:${t.titleFont};font-weight:${t.titleWeight};font-size:${mm(L.title)};line-height:1.05;letter-spacing:${t.titleSpacing || 0}em;color:${t.fg};word-wrap:break-word;">${esc(upper(model.title))}</div>`);
  if (model.brand) parts.push(`<div style="font-family:${SANS};font-weight:700;font-size:${mm(L.brand)};color:${t.brandColor};text-transform:uppercase;letter-spacing:0.06em;margin-top:${mm(L.gap * 0.6)};">${esc(model.brand)}</div>`);
  if (model.presentation) parts.push(`<div style="font-family:${SANS};font-size:${mm(L.presentation)};color:${t.secondaryColor};margin-top:${mm(L.gap * 0.4)};">${esc(model.presentation)}</div>`);
  if (model.description) parts.push(`<div style="font-family:${SANS};font-style:italic;font-size:${mm(L.secondary)};color:${t.secondaryColor};margin-top:${mm(L.gap * 0.5)};">${esc(model.description)}</div>`);
  if (t.rule) parts.push(`<div style="width:30%;height:${mm(Math.max(0.3, L.border * 0.4))};background:${t.rule};margin:${mm(L.gap * 1.4)} auto;"></div>`);
  else parts.push(`<div style="height:${mm(L.gap * 1.2)};"></div>`);
  if (model.kind === 'promo' && model.items.length) {
    parts.push(`<div style="font-family:${SANS};font-weight:700;font-size:${mm(L.items)};line-height:1.25;color:${t.fg};margin-bottom:${mm(L.gap)};">${model.items.map(i => `<div>${esc(i.qty)} ${esc(i.name)}</div>`).join('')}</div>`);
  }
  if (model.savings) {
    parts.push(`<div style="font-family:${SANS};font-size:${mm(L.savings)};color:${t.secondaryColor};text-decoration:line-through;margin-bottom:${mm(L.gap * 0.6)};">Precio normal ${esc(model.savings.normalText)}</div>`);
  }
  const priceBox = t.priceBg
    ? `background:${t.priceBg};padding:${mm(L.price * 0.08)} ${mm(L.price * 0.25)};border-radius:${mm(L.price * 0.1)};`
    : '';
  parts.push(`<div style="display:inline-block;${priceBox}font-family:${HEAVY};font-weight:900;font-size:${mm(L.price)};line-height:1;letter-spacing:-0.02em;color:${t.priceFg};white-space:nowrap;">${esc(model.priceText)}</div>`);
  if (model.unitText) parts.push(`<div style="font-family:${HEAVY};font-weight:900;font-size:${mm(L.unit)};color:${t.unitColor};margin-top:${mm(L.gap)};letter-spacing:0.04em;">${esc(model.unitText)}</div>`);
  if (model.savings) parts.push(`<div style="font-family:${HEAVY};font-weight:900;font-size:${mm(L.savings * 1.2)};color:${t.fg};margin-top:${mm(L.gap)};">AHORRÁS ${esc(model.savings.savingsText)}</div>`);
  for (const s of model.secondary || []) {
    parts.push(`<div style="font-family:${SANS};font-size:${mm(L.secondary)};color:${t.secondaryColor};margin-top:${mm(L.gap * 0.8)};">${esc(s)}</div>`);
  }
  const content = `<div style="width:100%;">${parts.join('')}</div>`;
  const frame = t.innerFrame
    ? `<div style="position:absolute;inset:${mm(L.border * 2.2)};border:${mm(Math.max(0.25, L.border * 0.45))} solid ${t.border};"></div>`
    : '';
  return `<div class="poster" style="background:${t.bg};border:${mm(L.border)} solid ${t.border};padding:${mm(L.pad)};">${frame}<div class="poster-content">${content}</div></div>`;
};

export const buildPosterHtml = (model, templateKey, formatKey) => {
  const f = FORMATS[formatKey] || FORMATS.A4_VERTICAL;
  const t = TEMPLATES[templateKey] || TEMPLATES.CLASICO;
  const cells = f.cells.map(c => {
    const L = computeLayout(model, c.w, c.h, t);
    return `<div class="cell" style="left:${c.x}mm;top:${c.y}mm;width:${c.w}mm;height:${c.h}mm;">${posterInnerHtml(model, t, L)}</div>`;
  }).join('');
  const cuts = f.cuts.map(cut => (cut.dir === 'h'
    ? `<div class="cut" style="left:0;top:${cut.at}mm;width:${f.page.w}mm;height:0;border-top:0.3mm dashed #9E9E9E;"></div>`
    : `<div class="cut" style="top:0;left:${cut.at}mm;height:${f.page.h}mm;width:0;border-left:0.3mm dashed #9E9E9E;"></div>`)).join('');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { size: A4 ${f.landscape ? 'landscape' : 'portrait'}; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #FFFFFF; }
  .sheet { position: relative; width: ${f.page.w}mm; height: ${f.page.h}mm; overflow: hidden; page-break-inside: avoid; break-inside: avoid; }
  .cell { position: absolute; page-break-inside: avoid; break-inside: avoid; }
  .poster { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; text-align: center; overflow: hidden; }
  .poster-content { position: relative; width: 100%; }
  .cut { position: absolute; }
</style></head>
<body><div class="sheet">${cells}${cuts}</div></body></html>`;
};

// ---------------------------------------------------------------------------
// Vista previa nativa (mismo modelo y mismos tamaños, en px)
// ---------------------------------------------------------------------------

const nativeFont = (cssFont) => {
  if (cssFont === SERIF) return Platform.OS === 'ios' ? 'Georgia' : 'serif';
  return undefined; // fuente del sistema
};

const PosterNative = ({ model, template: t, cell, pxPerMm }) => {
  const L = computeLayout(model, cell.w, cell.h, t);
  const px = (mm) => mm * pxPerMm;
  const upper = (s) => (t.titleUpper ? String(s).toUpperCase() : s);
  const heavy = { fontWeight: '900' };
  return (
    <View style={{ width: px(cell.w), height: px(cell.h), backgroundColor: t.bg, borderWidth: Math.max(1, px(L.border)), borderColor: t.border,
      padding: px(L.pad), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {t.innerFrame ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: px(L.border * 2.2), left: px(L.border * 2.2), right: px(L.border * 2.2),
          bottom: px(L.border * 2.2), borderWidth: Math.max(0.5, px(L.border * 0.45)), borderColor: t.border }} />
      ) : null}
      {model.badge ? (
        <Text style={[heavy, { backgroundColor: t.badgeBg || 'transparent', color: t.badgeFg, fontSize: px(L.badge), paddingHorizontal: px(L.badge * 0.7),
          paddingVertical: px(L.badge * 0.25), borderRadius: px(L.badge * 0.2), marginBottom: px(L.gap * 1.2), letterSpacing: px(L.badge) * 0.08,
          borderWidth: t.badgeBorder ? Math.max(0.5, px(L.border * 0.5)) : 0, borderColor: t.badgeBorder || 'transparent', overflow: 'hidden' }]}>{model.badge}</Text>
      ) : null}
      <Text style={{ fontFamily: nativeFont(t.titleFont), fontWeight: t.titleWeight === '400' ? 'normal' : t.titleWeight, fontSize: px(L.title),
        lineHeight: px(L.title) * 1.08, color: t.fg, textAlign: 'center', letterSpacing: px(L.title) * (t.titleSpacing || 0) }}>{upper(model.title)}</Text>
      {model.brand ? <Text style={{ fontWeight: '700', fontSize: px(L.brand), color: t.brandColor, marginTop: px(L.gap * 0.6), letterSpacing: px(L.brand) * 0.06 }}>{String(model.brand).toUpperCase()}</Text> : null}
      {model.presentation ? <Text style={{ fontSize: px(L.presentation), color: t.secondaryColor, marginTop: px(L.gap * 0.4) }}>{model.presentation}</Text> : null}
      {model.description ? <Text style={{ fontStyle: 'italic', fontSize: px(L.secondary), color: t.secondaryColor, marginTop: px(L.gap * 0.5), textAlign: 'center' }}>{model.description}</Text> : null}
      {t.rule ? <View style={{ width: '30%', height: Math.max(1, px(Math.max(0.3, L.border * 0.4))), backgroundColor: t.rule, marginVertical: px(L.gap * 1.4) }} />
        : <View style={{ height: px(L.gap * 1.2) }} />}
      {model.kind === 'promo' && model.items.length ? (
        <View style={{ marginBottom: px(L.gap), alignItems: 'center' }}>
          {model.items.map((i, idx) => <Text key={idx} style={{ fontWeight: '700', fontSize: px(L.items), color: t.fg }}>{i.qty} {i.name}</Text>)}
        </View>
      ) : null}
      {model.savings ? <Text style={{ fontSize: px(L.savings), color: t.secondaryColor, textDecorationLine: 'line-through', marginBottom: px(L.gap * 0.6) }}>Precio normal {model.savings.normalText}</Text> : null}
      <View style={t.priceBg ? { backgroundColor: t.priceBg, paddingHorizontal: px(L.price * 0.25), paddingVertical: px(L.price * 0.08), borderRadius: px(L.price * 0.1) } : null}>
        <Text style={[heavy, { fontSize: px(L.price), lineHeight: px(L.price) * 1.1, color: t.priceFg }]} numberOfLines={1}>{model.priceText}</Text>
      </View>
      {model.unitText ? <Text style={[heavy, { fontSize: px(L.unit), color: t.unitColor, marginTop: px(L.gap) }]}>{model.unitText}</Text> : null}
      {model.savings ? <Text style={[heavy, { fontSize: px(L.savings * 1.2), color: t.fg, marginTop: px(L.gap) }]}>AHORRÁS {model.savings.savingsText}</Text> : null}
      {(model.secondary || []).map((s, idx) => <Text key={idx} style={{ fontSize: px(L.secondary), color: t.secondaryColor, marginTop: px(L.gap * 0.8), textAlign: 'center' }}>{s}</Text>)}
    </View>
  );
};

const SheetPreview = ({ model, templateKey, formatKey, width }) => {
  const f = FORMATS[formatKey];
  const t = TEMPLATES[templateKey];
  const pxPerMm = width / f.page.w;
  return (
    <View style={{ width, height: f.page.h * pxPerMm, backgroundColor: '#FFFFFF', alignSelf: 'center', elevation: 3,
      shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}>
      {f.cells.map((c, idx) => (
        <View key={idx} style={{ position: 'absolute', left: c.x * pxPerMm, top: c.y * pxPerMm }}>
          <PosterNative model={model} template={t} cell={c} pxPerMm={pxPerMm} />
        </View>
      ))}
      {f.cuts.map((cut, idx) => (cut.dir === 'h'
        ? <View key={`c${idx}`} style={{ position: 'absolute', left: 0, right: 0, top: cut.at * pxPerMm, borderTopWidth: 1, borderColor: '#9E9E9E', borderStyle: 'dashed' }} />
        : <View key={`c${idx}`} style={{ position: 'absolute', top: 0, bottom: 0, left: cut.at * pxPerMm, borderLeftWidth: 1, borderColor: '#9E9E9E', borderStyle: 'dashed' }} />))}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

const notify = (title, message) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message || undefined);
};

const Chip = ({ label, active, onPress, color = '#6f42c1', disabled }) => (
  <TouchableOpacity onPress={onPress} disabled={disabled} style={[s.chip, { borderColor: color }, active && { backgroundColor: color }]}>
    <Text style={[s.chipText, { color: active ? '#fff' : color }]}>{label}</Text>
  </TouchableOpacity>
);

const Toggle = ({ label, value, onChange }) => (
  <TouchableOpacity onPress={() => onChange(!value)} style={s.toggleRow}>
    <View style={[s.checkbox, value && s.checkboxOn]}>{value ? <Text style={s.checkMark}>✓</Text> : null}</View>
    <Text style={s.toggleLabel}>{label}</Text>
  </TouchableOpacity>
);

export default function PosterMaker({ branchId, branchName, products, promotions, onRefreshPromotions, formatMoney }) {
  const [mode, setMode] = useState('producto'); // producto | promocion
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState(null);
  const [promoId, setPromoId] = useState(null);
  const [templateKey, setTemplateKey] = useState('CLASICO');
  const [badge, setBadge] = useState('SIN_ETIQUETA');
  const [formatKey, setFormatKey] = useState('A4_VERTICAL');
  const [kgOption, setKgOption] = useState('1');
  const [customKg, setCustomKg] = useState('');
  const [showKgReference, setShowKgReference] = useState(true);
  const [showBrand, setShowBrand] = useState(true);
  const [showPresentation, setShowPresentation] = useState(false);
  const [showSavings, setShowSavings] = useState(true);
  const [extraText, setExtraText] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(300);

  // Al cambiar de sucursal se descarta la selección: nunca se reutiliza un precio de otra sucursal.
  useEffect(() => { setProductId(null); setPromoId(null); setShowPreview(false); }, [branchId]);

  const branchProducts = Array.isArray(products) ? products : [];
  // Siempre se toma el producto desde la lista ACTUAL de la sucursal (precio vigente).
  const product = productId !== null ? branchProducts.find(p => p.id === productId) || null : null;
  const availablePromos = (Array.isArray(promotions) ? promotions : []).filter(p => p.active === true && p.enabled === true);
  const promo = promoId !== null ? availablePromos.find(p => p.id === promoId) || null : null;

  const opts = { badge, kgOption, customKg, showKgReference, showBrand, showPresentation, showSavings, extraText };
  const model = mode === 'producto' ? buildProductModel(product, opts) : buildPromoModel(promo, branchProducts, opts);
  const ready = model.errors && model.errors.length === 0;

  const q = search.trim().toLowerCase();
  const matches = branchProducts
    .filter(p => p.is_active !== false)
    .filter(p => !q || (p.name || '').toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q)
      || (p.category || '').toLowerCase().includes(q) || (p.barcode || '').includes(q))
    .slice(0, q ? 30 : 12);

  const chooseTemplate = (key) => {
    setTemplateKey(key);
    if (TEMPLATES[key].defaultBadge) setBadge(TEMPLATES[key].defaultBadge);
  };

  const fileSafe = (str) => String(str || 'cartel').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').slice(0, 40);

  const run = async (fn) => {
    if (busy) return;
    if (!ready) { notify('Falta información', (model.errors || []).join('\n')); return; }
    setBusy(true);
    try { await fn(buildPosterHtml(model, templateKey, formatKey)); }
    catch (e) { notify('No se pudo completar', e?.message || 'Error desconocido'); }
    finally { setBusy(false); }
  };

  const handlePdf = () => run(async (html) => {
    const f = FORMATS[formatKey];
    const { uri } = await Print.printToFileAsync({
      html, width: Math.round(f.page.w * MM_TO_PT), height: Math.round(f.page.h * MM_TO_PT),
    });
    const target = `${FileSystem.documentDirectory}cartel_${fileSafe(model.title)}_${Date.now()}.pdf`;
    await FileSystem.moveAsync({ from: uri, to: target });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(target, { mimeType: 'application/pdf', dialogTitle: 'Cartel para imprimir', UTI: 'com.adobe.pdf' });
    } else {
      notify('PDF generado', 'Compartir no está disponible en este dispositivo.');
    }
  });

  const handlePrint = () => run(async (html) => {
    const landscape = FORMATS[formatKey].landscape;
    const orientation = Print.Orientation ? (landscape ? Print.Orientation.landscape : Print.Orientation.portrait) : undefined;
    await Print.printAsync(orientation ? { html, orientation } : { html });
  });

  return (
    <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>🏷️ Cartelería</Text>
      <Text style={s.subtitle}>Creá carteles listos para imprimir con los precios actuales de la sucursal.</Text>
      <View style={s.branchBox}>
        <Text style={s.branchText}>Sucursal: {branchName}</Text>
        <Text style={s.branchHint}>Los precios corresponden a esta sucursal.</Text>
      </View>

      <View style={s.modeRow}>
        <TouchableOpacity style={[s.modeBtn, mode === 'producto' && s.modeBtnOn]} onPress={() => { setMode('producto'); setShowPreview(false); }}>
          <Text style={[s.modeText, mode === 'producto' && s.modeTextOn]}>PRODUCTO</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.modeBtn, mode === 'promocion' && s.modeBtnOn]}
          onPress={() => { setMode('promocion'); setShowPreview(false); if (onRefreshPromotions) onRefreshPromotions(); }}>
          <Text style={[s.modeText, mode === 'promocion' && s.modeTextOn]}>PROMOCIÓN</Text>
        </TouchableOpacity>
      </View>

      {mode === 'producto' ? (
        <View style={s.card}>
          <Text style={s.cardTitle}>1. Producto</Text>
          <TextInput style={s.input} placeholder="Buscar por nombre, marca, categoría o EAN" value={search} onChangeText={setSearch} />
          {matches.map(p => (
            <TouchableOpacity key={p.id} style={[s.listItem, p.id === productId && s.listItemOn]} onPress={() => { setProductId(p.id); setSearch(''); }}>
              <Text style={s.listName}>{p.name}{p.brand ? ` · ${p.brand}` : ''}</Text>
              <Text style={s.listMeta}>{formatMoney(p.price_per_unit)} {p.unit_type === 'kg' ? 'por kg' : 'c/u'}</Text>
            </TouchableOpacity>
          ))}
          {!matches.length ? <Text style={s.muted}>No hay productos que coincidan en esta sucursal.</Text> : null}
          {productId !== null && !product ? <Text style={s.error}>El producto elegido ya no está disponible en esta sucursal.</Text> : null}
          {product ? (
            <View style={s.selected}>
              <Text style={s.selectedTitle}>✓ {product.name}</Text>
              <Text style={s.meta}>Marca: {product.brand || '—'} · Categoría: {product.category || '—'}</Text>
              <Text style={s.meta}>Precio vigente ({branchName}): {productPrice(product) === null ? 'sin precio válido' : formatMoney(productPrice(product))} {product.unit_type === 'kg' ? 'por kg' : 'c/u'}</Text>
              <Text style={s.meta}>Unidad: {product.unit_type === 'kg' ? 'kg' : 'unidad'} · Stock (solo informativo, no se imprime): {product.stock ?? '—'}</Text>
              {product.visual_presentation ? <Text style={s.meta}>Presentación: {VISUAL_LABELS[product.visual_presentation] || product.visual_presentation}</Text> : null}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={s.card}>
          <Text style={s.cardTitle}>1. Promoción</Text>
          {!availablePromos.length ? <Text style={s.muted}>No hay promociones activas y habilitadas en esta sucursal.</Text> : null}
          {availablePromos.map(p => (
            <TouchableOpacity key={p.id} style={[s.listItem, p.id === promoId && s.listItemOn]} onPress={() => setPromoId(p.id)}>
              <Text style={s.listName}>🎁 {p.name}</Text>
              <Text style={s.listMeta}>{formatMoney(p.promo_price)} · {(p.items || []).map(i => `${formatQty(i.included_qty, i.unit_type)} ${i.product_name}`).join(' + ')}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={s.card}>
        <Text style={s.cardTitle}>2. Plantilla</Text>
        <View style={s.chips}>
          {Object.entries(TEMPLATES).map(([key, t]) => (
            <TouchableOpacity key={key} onPress={() => chooseTemplate(key)}
              style={[s.templateBtn, { backgroundColor: t.bg, borderColor: templateKey === key ? '#6f42c1' : t.border }, templateKey === key && s.templateOn]}>
              <Text style={{ color: t.priceBg ? t.priceBg : t.priceFg, fontWeight: '900', fontSize: 16 }}>$</Text>
              <Text style={{ color: t.fg, fontWeight: 'bold', fontSize: 12 }}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.label}>Etiqueta</Text>
        <View style={s.chips}>
          {BADGES.map(([key, label]) => <Chip key={key} label={label} active={badge === key} onPress={() => setBadge(key)} color="#d32f2f" />)}
        </View>

        {mode === 'producto' && product && product.unit_type === 'kg' ? (
          <>
            <Text style={s.label}>Precio por</Text>
            <View style={s.chips}>
              {KG_OPTIONS.map(([key, label]) => <Chip key={key} label={label} active={kgOption === key} onPress={() => setKgOption(key)} color="#007bff" />)}
            </View>
            {kgOption === 'custom' ? (
              <TextInput style={s.input} placeholder="Kilos, ej: 0,300 · 0,750 · 1,250" keyboardType="decimal-pad" value={customKg} onChangeText={setCustomKg} />
            ) : null}
            <Toggle label="Mostrar precio por kg debajo" value={showKgReference} onChange={setShowKgReference} />
            <Text style={s.hint}>El precio fraccionado es solo para el cartel: no cambia el precio del producto.</Text>
          </>
        ) : null}

        {mode === 'producto' ? (
          <>
            <Toggle label="Mostrar marca" value={showBrand} onChange={setShowBrand} />
            <Toggle label="Mostrar presentación (horma, barra…)" value={showPresentation} onChange={setShowPresentation} />
          </>
        ) : (
          <>
            <Toggle label="Mostrar precio normal y ahorro (si es confiable)" value={showSavings} onChange={setShowSavings} />
            {promo && showSavings && model.savingsInfo && !model.savingsInfo.ok ? (
              <Text style={s.hint}>No se muestra el ahorro: {model.savingsInfo.reason}</Text>
            ) : null}
          </>
        )}
        <Text style={s.label}>Texto secundario (opcional)</Text>
        <TextInput style={s.input} placeholder="Ej: Ideal para sándwiches" value={extraText} maxLength={60} onChangeText={setExtraText} />
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>3. Formato de impresión</Text>
        <View style={s.chips}>
          {Object.entries(FORMATS).map(([key, f]) => <Chip key={key} label={f.label} active={formatKey === key} onPress={() => setFormatKey(key)} color="#28a745" />)}
        </View>
        {FORMATS[formatKey].cuts.length ? <Text style={s.hint}>Incluye líneas de corte punteadas.</Text> : null}
      </View>

      {!ready ? <Text style={s.error}>{(model.errors || []).join(' ')}</Text> : null}

      <TouchableOpacity style={[s.actionBtn, { backgroundColor: ready ? '#6f42c1' : '#adb5bd' }]} disabled={!ready} onPress={() => setShowPreview(!showPreview)}>
        <Text style={s.actionText}>👁️ {showPreview ? 'Ocultar vista previa' : 'Vista previa'}</Text>
      </TouchableOpacity>

      {showPreview && ready ? (
        <View style={s.previewWrap} onLayout={(e) => setPreviewWidth(Math.max(200, Math.min(e.nativeEvent.layout.width - 8, 520)))}>
          <SheetPreview model={model} templateKey={templateKey} formatKey={formatKey} width={previewWidth} />
          <Text style={s.hint}>Vista previa de la hoja A4 completa ({FORMATS[formatKey].label}).</Text>
        </View>
      ) : null}

      <TouchableOpacity style={[s.actionBtn, { backgroundColor: ready && !busy ? '#007bff' : '#adb5bd' }]} disabled={!ready || busy} onPress={handlePdf}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.actionText}>📄 Generar / Compartir PDF</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={[s.actionBtn, { backgroundColor: ready && !busy ? '#343a40' : '#adb5bd' }]} disabled={!ready || busy} onPress={handlePrint}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.actionText}>🖨️ Imprimir</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#d32f2f' },
  subtitle: { fontSize: 13, color: '#555', marginTop: 2, marginBottom: 10 },
  branchBox: { backgroundColor: '#fff3cd', borderRadius: 8, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#ffe08a' },
  branchText: { fontWeight: 'bold', fontSize: 15, color: '#664d03' },
  branchHint: { fontSize: 11, color: '#664d03' },
  modeRow: { flexDirection: 'row', backgroundColor: '#e9ecef', borderRadius: 10, padding: 4, marginBottom: 12 },
  modeBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 8 },
  modeBtnOn: { backgroundColor: '#d32f2f' },
  modeText: { fontWeight: '900', fontSize: 15, color: '#333' },
  modeTextOn: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#e2e2e2' },
  cardTitle: { fontWeight: 'bold', fontSize: 15, marginBottom: 8, color: '#222' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#fff', marginBottom: 8 },
  listItem: { paddingVertical: 9, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  listItemOn: { backgroundColor: '#f3e8ff' },
  listName: { fontWeight: 'bold', fontSize: 13, color: '#222' },
  listMeta: { fontSize: 12, color: '#555' },
  selected: { backgroundColor: '#e8f4fd', borderRadius: 8, padding: 10, marginTop: 8 },
  selectedTitle: { fontWeight: 'bold', fontSize: 14, color: '#004085', marginBottom: 2 },
  meta: { fontSize: 12, color: '#333', marginTop: 2 },
  muted: { fontSize: 12, color: '#777', marginVertical: 4 },
  error: { fontSize: 13, color: '#c0392b', marginBottom: 8, fontWeight: 'bold' },
  hint: { fontSize: 11, color: '#777', marginTop: 4 },
  label: { fontWeight: 'bold', fontSize: 13, color: '#444', marginTop: 10, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, marginRight: 6, marginBottom: 6, backgroundColor: '#fff' },
  chipText: { fontWeight: 'bold', fontSize: 12 },
  templateBtn: { width: 74, height: 64, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 8, marginBottom: 8 },
  templateOn: { borderWidth: 3 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: '#6f42c1', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  checkboxOn: { backgroundColor: '#6f42c1' },
  checkMark: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  toggleLabel: { fontSize: 13, color: '#333', flex: 1 },
  actionBtn: { paddingVertical: 15, borderRadius: 10, alignItems: 'center', marginVertical: 5 },
  actionText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  previewWrap: { backgroundColor: '#dee2e6', borderRadius: 10, padding: 4, paddingVertical: 12, marginVertical: 8, alignItems: 'center' },
});
