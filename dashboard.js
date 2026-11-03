(function () {
  'use strict';
  const S = window.SURVEY;
  const F = S.FACTORES;
  const POLL_MS = 10000;
  const MIN_N = 5;        // celdas con menos respuestas se marcan como no concluyentes
  const LOW_SAMPLE = 50;  // por debajo, se recomienda leer conteos

  let rows = [];
  let meta = {};
  let version = '';
  let lastSync = null;
  let online = true;
  let tab = 'resumen';
  const codeUi = { filter: 'pendientes', q: '' };

  /* ---------- helpers ---------- */
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'style') n.setAttribute('style', v);
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, '');
      else n.setAttribute(k, v);
    }
    for (const k of kids.flat(3)) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  }
  const labelOf = (q, id) => { const o = (S[q].options || []).find(x => x.id === id); return o ? o.label : (id || '—'); };
  const fShort = id => (S.factorById[id] ? S.factorById[id].short : id);
  const pctTxt = (k, n) => (n ? `${Math.round((k / n) * 100)}%` : '—');
  const ratio = (k, n) => (n ? k / n : 0);
  const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const fmt1 = v => (v == null ? '—' : v.toFixed(1).replace('.', ','));
  const fmtDate = iso => new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* tooltip genérico: cualquier elemento con data-tip */
  const tipEl = document.getElementById('tip');
  document.addEventListener('mouseover', e => {
    const t = e.target.closest('[data-tip]');
    if (!t) { tipEl.classList.remove('show'); return; }
    tipEl.textContent = t.dataset.tip; tipEl.classList.add('show');
  });
  document.addEventListener('mousemove', e => {
    if (!tipEl.classList.contains('show')) return;
    const x = Math.min(e.clientX + 14, window.innerWidth - tipEl.offsetWidth - 8);
    const y = Math.min(e.clientY + 14, window.innerHeight - tipEl.offsetHeight - 8);
    tipEl.style.left = `${x}px`; tipEl.style.top = `${y}px`;
  });

  /* ---------- datos ---------- */
  async function load() {
    const r = await fetch('/api/admin/responses', { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    rows = j.rows; meta = j.meta; version = j.meta.version;
    lastSync = new Date(); online = true;
    render();
  }
  async function poll() {
    try {
      const r = await fetch('/api/admin/version', { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      online = true; lastSync = new Date();
      if (j.version !== version) await load();
    } catch { online = false; }
    updateLive();
  }
  function updateLive() {
    const live = document.getElementById('live');
    live.classList.toggle('off', !online);
    const secs = lastSync ? Math.round((Date.now() - lastSync) / 1000) : null;
    document.getElementById('liveText').textContent = !online ? 'Sin conexión, reintentando…'
      : secs == null ? 'Conectando…' : `En vivo · actualizado hace ${secs < 5 ? 'unos segundos' : `${secs} s`}`;
  }

  /* ---------- filtros ---------- */
  const filters = { p2: '', p3: '', p1: '', p8: '', from: '', to: '' };
  function fillSelect(id, q, extra) {
    const s = document.getElementById(id);
    s.replaceChildren(el('option', { value: '' }, 'Todos'), ...(extra || S[q].options).map(o => el('option', { value: o.id }, o.label)));
    s.addEventListener('change', () => { filters[q] = s.value; render(); });
  }
  fillSelect('fP2', 'p2'); fillSelect('fP3', 'p3'); fillSelect('fP1', 'p1');
  fillSelect('fP8', 'p8', [{ id: 'si', label: 'Sí (frecuente u ocasional)' }, ...S.p8.options]);
  document.getElementById('fFrom').addEventListener('change', e => { filters.from = e.target.value; render(); });
  document.getElementById('fTo').addEventListener('change', e => { filters.to = e.target.value; render(); });
  document.getElementById('fClear').addEventListener('click', () => {
    Object.keys(filters).forEach(k => { filters[k] = ''; });
    ['fP2', 'fP3', 'fP1', 'fP8', 'fFrom', 'fTo'].forEach(id => { document.getElementById(id).value = ''; });
    render();
  });

  function filtered() {
    return rows.filter(r => {
      const a = r.answers;
      if (filters.p2 && a.p2 !== filters.p2) return false;
      if (filters.p3 && a.p3 !== filters.p3) return false;
      if (filters.p1 && a.p1 !== filters.p1) return false;
      if (filters.p8 === 'si' && !(a.p8 === 'frecuente' || a.p8 === 'ocasional')) return false;
      if (filters.p8 && filters.p8 !== 'si' && a.p8 !== filters.p8) return false;
      const d = r.created_at.slice(0, 10);
      if (filters.from && d < filters.from) return false;
      if (filters.to && d > filters.to) return false;
      return true;
    });
  }

  /* ---------- componentes ---------- */
  function panel(title, sub, ...body) {
    return el('section', { class: 'panel' }, el('h2', null, title), sub ? el('p', { class: 'p-sub' }, sub) : null, body);
  }

  /* items: [{label, k, n, tip?}] — barra = k/n */
  function bars(items, { sort = true, unit = 'resp.' } = {}) {
    const list = sort ? [...items].sort((a, b) => ratio(b.k, b.n) - ratio(a.k, a.n) || b.k - a.k) : items;
    if (!list.length || list.every(i => !i.n)) return el('div', { class: 'empty' }, 'Sin respuestas todavía.');
    return el('div', { class: 'bars' }, list.map(i => {
      const tip = i.tip || `${i.label}: ${i.k} de ${i.n} ${i.unit || unit} (${pctTxt(i.k, i.n)})`;
      return el('div', { class: 'bar-row', 'data-tip': tip },
        el('span', { class: 'bl', title: i.label }, i.label),
        el('div', { class: 'bar-track' }, el('div', { class: 'bar-fill', style: `width:${ratio(i.k, i.n) * 100}%` })),
        el('span', { class: 'bv' }, pctTxt(i.k, i.n), el('small', null, `(${i.k})`)));
    }));
  }

  function kpi(label, value, foot, isText) {
    return el('div', { class: 'kpi' }, el('div', { class: 'k-label' }, label),
      el('div', { class: `k-value${isText ? ' text' : ''}` }, value), el('div', { class: 'k-foot' }, foot));
  }

  const SEQ = ['--seq-100', '--seq-200', '--seq-300', '--seq-400', '--seq-500', '--seq-600', '--seq-700'];
  function heatCell(k, n) {
    if (!n) return el('td', { class: 'cell muted' }, '—');
    const v = k / n;
    const idx = v === 0 ? -1 : Math.min(SEQ.length - 1, Math.floor(v * SEQ.length));
    const bg = idx < 0 ? 'transparent' : `var(${SEQ[idx]})`;
    const fg = idx >= 3 ? '#ffffff' : 'var(--text)';
    const low = n < MIN_N;
    return el('td', { class: `cell${low ? ' low' : ''}`, style: `background-color:${bg};color:${idx < 0 ? 'var(--text-3)' : fg}`,
      'data-tip': `${k} de ${n} (${pctTxt(k, n)})${low ? ' · muestra < 5, no concluyente' : ''}` }, pctTxt(k, n));
  }

  /* tabla cruzada: filas = factores P6, columnas = opciones de una pregunta de perfil; % por columna */
  function crossTab(data, colQ, cols) {
    cols = cols || S[colQ].options;
    const colN = cols.map(c => data.filter(r => r.answers[colQ] === c.id).length);
    const order = F.map(f => ({ f, k: data.filter(r => r.answers.p6 === f.id).length })).sort((a, b) => b.k - a.k).map(x => x.f);
    return el('div', null,
      el('div', { class: 'tbl-wrap' }, el('table', { class: 'tbl heat' },
        el('thead', null, el('tr', null, el('th', null, 'Causa más determinante (P6)'),
          cols.map((c, i) => el('th', { style: 'text-align:center' }, c.label, el('span', { class: 'th-sub' }, `n = ${colN[i]}`))))),
        el('tbody', null, order.map(f => el('tr', null, el('td', null, f.short),
          cols.map((c, i) => heatCell(data.filter(r => r.answers[colQ] === c.id && r.answers.p6 === f.id).length, colN[i]))))))),
      el('div', { class: 'legend-row' },
        el('span', null, '% de cada columna:'),
        el('span', { class: 'legend-ramp', 'aria-hidden': 'true' }, SEQ.map(v => el('span', { style: `background:var(${v})` }))),
        el('span', null, '0% → 100%'),
        el('span', { class: 'swatch-low', 'aria-hidden': 'true' }), el('span', null, `columna con menos de ${MIN_N} respuestas (no concluyente)`)));
  }

  /* ---------- sugerencias de codificación ---------- */
  function suggest(text) {
    const t = ` ${(text || '').toLowerCase()} `;
    return Object.entries(S.KEYWORDS).filter(([, words]) => words.some(w => t.includes(w))).map(([id]) => id);
  }

  async function saveCodes(r, codes) {
    const res = await fetch(`/api/admin/responses/${r.id}/codes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p4: codes }) });
    if (!res.ok) { toast('No se pudo guardar'); return; }
    const j = await res.json();
    r.codes = j.codes;
    await load();
  }

  /* ---------- vistas ---------- */
  function viewResumen(data) {
    const n = data.length;
    const reviewed = data.filter(r => r.codes.p4_reviewed);
    const pending = n - reviewed.length;
    const spontTerceros = reviewed.filter(r => (r.codes.p4 || []).includes('terceros')).length;
    const p6Counts = F.map(f => ({ f, k: data.filter(r => r.answers.p6 === f.id).length })).sort((a, b) => b.k - a.k);
    const top = p6Counts[0];
    const needs = data.filter(r => r.answers.p8 === 'frecuente' || r.answers.p8 === 'ocasional').length;
    const ret = data.filter(r => r.answers.p12 && r.answers.p12.terceros >= 4).length;

    const kpis = el('div', { class: 'kpis' },
      kpi('Respuestas', String(n), rows.length !== n ? `de ${rows.length} en total (filtro activo)` : 'total recibido'),
      kpi('Mencionan terceros espontáneamente (P4)', reviewed.length ? pctTxt(spontTerceros, reviewed.length) : '—',
        reviewed.length ? `${spontTerceros} de ${reviewed.length} codificadas${pending ? ` · ${pending} pendientes` : ''}` : `${pending} respuestas por codificar`),
      kpi('Causa más determinante (P6)', top && top.k ? top.f.short : '—', top && top.k ? `${top.k} de ${n} (${pctTxt(top.k, n)})${p6Counts[1] && p6Counts[1].k === top.k ? ' · empatada' : ''}` : 'sin datos', true),
      kpi('Necesitaban pagar a terceros (P8)', pctTxt(needs, n), `${needs} de ${n}`),
      kpi('Volverían con envío a terceros (P12 = 4–5)', pctTxt(ret, n), `${ret} de ${n} · intención declarada`));

    /* matriz de causas */
    const matrix = F.map(f => {
      const sp = reviewed.filter(r => (r.codes.p4 || []).includes(f.id)).length;
      const inf = data.filter(r => (r.answers.p5 || []).includes(f.id)).length;
      const main = data.filter(r => r.answers.p6 === f.id).length;
      const imp = S.p7.rows.includes(f.id) ? data.map(r => r.answers.p7 && r.answers.p7[f.id]).filter(Boolean) : null;
      const back = S.p12.rows.some(x => x.id === f.id) ? data.map(r => r.answers.p12 && r.answers.p12[f.id]).filter(Boolean) : null;
      return { f, sp, inf, main, imp, back };
    }).sort((a, b) => b.main - a.main || b.inf - a.inf);
    const maxMain = Math.max(...matrix.map(m => m.main));

    const matrixTbl = el('div', { class: 'tbl-wrap' }, el('table', { class: 'tbl' },
      el('thead', null, el('tr', null,
        el('th', null, 'Factor'),
        el('th', null, 'Espontánea', el('span', { class: 'th-sub' }, 'P4 · % codificadas')),
        el('th', null, 'Influyó', el('span', { class: 'th-sub' }, 'P5 · % resp.')),
        el('th', null, 'Más determinante', el('span', { class: 'th-sub' }, 'P6 · % resp.')),
        el('th', null, 'Importancia', el('span', { class: 'th-sub' }, 'P7 · media / mediana')),
        el('th', null, 'Importancia alta', el('span', { class: 'th-sub' }, 'P7 · % 4–5')),
        el('th', null, 'Volvería', el('span', { class: 'th-sub' }, 'P12 · % 4–5')))),
      el('tbody', null, matrix.map(m => el('tr', null,
        el('td', null, m.f.short),
        el('td', { 'data-tip': `${m.sp} de ${reviewed.length} codificadas` }, reviewed.length ? pctTxt(m.sp, reviewed.length) : el('span', { class: 'muted' }, '—')),
        el('td', { 'data-tip': `${m.inf} de ${n}` }, pctTxt(m.inf, n)),
        el('td', { class: m.main && m.main === maxMain ? 'hl' : null, 'data-tip': `${m.main} de ${n}` }, pctTxt(m.main, n)),
        el('td', null, m.imp ? `${fmt1(mean(m.imp))} / ${fmt1(median(m.imp))}` : el('span', { class: 'muted' }, 'n/a')),
        el('td', { 'data-tip': m.imp ? `${m.imp.filter(v => v >= 4).length} de ${m.imp.length}` : null }, m.imp ? pctTxt(m.imp.filter(v => v >= 4).length, m.imp.length) : el('span', { class: 'muted' }, 'n/a')),
        el('td', { 'data-tip': m.back ? `${m.back.filter(v => v >= 4).length} de ${m.back.length}` : null }, m.back ? pctTxt(m.back.filter(v => v >= 4).length, m.back.length) : el('span', { class: 'muted' }, 'n/a')))))));

    const p7Items = S.p7.rows.map(id => {
      const v = data.map(r => r.answers.p7 && r.answers.p7[id]).filter(Boolean);
      return { label: fShort(id), k: v.filter(x => x >= 4).length, n: v.length, tip: `${fShort(id)}: ${v.filter(x => x >= 4).length} de ${v.length} lo califican 4–5 · media ${fmt1(mean(v))}, mediana ${fmt1(median(v))}` };
    });
    const p12Items = S.p12.rows.map(r => {
      const v = data.map(x => x.answers.p12 && x.answers.p12[r.id]).filter(Boolean);
      return { label: r.label, k: v.filter(x => x >= 4).length, n: v.length,
        tip: `${r.label}: ${v.filter(x => x >= 4).length} de ${v.length} responden 4–5 · media ${fmt1(mean(v))}` };
    });
    const needers = data.filter(r => r.answers.p8 && r.answers.p8 !== 'no');

    /* plataformas actuales (P11): agrupación simple por texto normalizado */
    const plat = {};
    data.forEach(r => {
      const raw = (r.answers.p11 || '').trim(); if (!raw) return;
      const key = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
      if (!key) return;
      plat[key] = plat[key] || { label: raw, k: 0 }; plat[key].k++;
    });
    const withP11 = data.filter(r => (r.answers.p11 || '').trim()).length;
    const platItems = Object.values(plat).sort((a, b) => b.k - a.k).slice(0, 10).map(p => ({ label: p.label, k: p.k, n: withP11 }));

    return [
      kpis,
      panel('Matriz de causas', 'Cada factor medido de cinco formas. Ordenada por "más determinante". La columna espontánea es la evidencia más limpia: nadie sugirió la respuesta.', matrixTbl),
      el('div', { class: 'grid2' },
        panel('Causa más determinante', 'P6 · una respuesta por persona', bars(F.map(f => ({ label: f.short, k: data.filter(r => r.answers.p6 === f.id).length, n })))),
        panel('Mención espontánea', `P4 codificada · base: ${reviewed.length} respuestas revisadas${pending ? ` (${pending} pendientes)` : ''}`,
          reviewed.length ? bars(F.map(f => ({ label: f.short, k: reviewed.filter(r => (r.codes.p4 || []).includes(f.id)).length, n: reviewed.length, unit: 'codificadas' }))) : el('div', { class: 'empty' }, 'Codifica las respuestas en la pestaña "Respuestas abiertas".'))),
      el('div', { class: 'grid2' },
        panel('Factores que influyeron', 'P5 · selección múltiple, % de encuestados', bars(F.map(f => ({ label: f.short, k: data.filter(r => (r.answers.p5 || []).includes(f.id)).length, n })))),
        panel('Importancia alta por factor', 'P7 · % que califica 4 o 5 (pasa el cursor para ver media y mediana)', bars(p7Items))),
      el('div', { class: 'grid2' },
        panel('Potencial de recuperación por mejora', 'P12 · % que responde 4 o 5. Intención declarada: úsalo para priorizar, no para proyectar.', bars(p12Items)),
        panel('Necesidad de pagos a terceros', `P8 · y volumen mensual entre quienes lo necesitaban (P9, n = ${needers.length})`,
          bars(S.p8.options.map(o => ({ label: o.label, k: data.filter(r => r.answers.p8 === o.id).length, n })), { sort: false }),
          el('div', { style: 'height:16px' }),
          bars(S.p9.options.map(o => ({ label: `${o.label} pagos/mes`, k: needers.filter(r => r.answers.p9 === o.id).length, n: needers.length })), { sort: false }))),
      el('div', { class: 'grid3' },
        panel('Uso principal', 'P2', bars(S.p2.options.map(o => ({ label: o.label, k: data.filter(r => r.answers.p2 === o.id).length, n })))),
        panel('Frecuencia', 'P3', bars(S.p3.options.map(o => ({ label: o.label, k: data.filter(r => r.answers.p3 === o.id).length, n })), { sort: false })),
        panel('Antigüedad', 'P1', bars(S.p1.options.map(o => ({ label: o.label, k: data.filter(r => r.answers.p1 === o.id).length, n })), { sort: false }))),
      panel('Dónde operan hoy', `P11 · menciones agrupadas por texto (n = ${withP11}). Revisa variantes de un mismo nombre.`, bars(platItems))
    ];
  }

  function viewCruces(data) {
    const needCols = [{ id: 'frecuente', label: 'Sí, frecuente' }, { id: 'ocasional', label: 'Sí, ocasional' }, { id: 'no', label: 'No' }];
    return [
      panel('Causa principal × uso principal', 'P6 × P2 · % de cada columna. Si "Envío a terceros" pesa solo en pagos o tesorería, el hallazgo es de segmento.', crossTab(data, 'p2')),
      panel('Causa principal × frecuencia', 'P6 × P3', crossTab(data, 'p3')),
      panel('Causa principal × antigüedad', 'P6 × P1', crossTab(data, 'p1')),
      panel('Causa principal × necesidad de pagos a terceros', 'P6 × P8', crossTab(data, 'p8', needCols))
    ];
  }

  function viewCodificar(data) {
    const q = codeUi.q.trim().toLowerCase();
    const list = data.filter(r => {
      if (codeUi.filter === 'pendientes' && r.codes.p4_reviewed) return false;
      if (codeUi.filter === 'codificadas' && !r.codes.p4_reviewed) return false;
      if (q) {
        const a = r.answers;
        const hay = [a.p4, a.p10, a.p11, a.p13, r.ref].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const segBtn = (id, label) => el('button', { type: 'button', 'aria-pressed': String(codeUi.filter === id), onclick: () => { codeUi.filter = id; render(); } }, label);
    const search = el('input', { type: 'search', placeholder: 'Buscar en respuestas abiertas o código de cliente…', value: codeUi.q,
      oninput: e => { codeUi.q = e.target.value; clearTimeout(search._t); search._t = setTimeout(() => { render(); const s = document.querySelector('.code-tools input'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 250); } });

    return [
      el('div', { class: 'banner' }, el('strong', null, 'Cómo codificar: '),
        'lee la razón espontánea (P4) y marca una o más categorías. Las sugerencias punteadas vienen de palabras clave y no cuentan hasta que las confirmes. Las respuestas asistidas (P5/P6) se ocultan aquí para no sesgar la codificación.'),
      el('div', { class: 'code-tools' }, search, el('div', { class: 'seg' }, segBtn('pendientes', 'Pendientes'), segBtn('codificadas', 'Codificadas'), segBtn('todas', 'Todas'))),
      list.length ? list.map(r => respCard(r)) : el('div', { class: 'empty' }, codeUi.filter === 'pendientes' ? 'No hay respuestas pendientes de codificar. 🎉' : 'Sin resultados.')
    ];
  }

  function respCard(r) {
    const a = r.answers;
    const sug = suggest(a.p4);
    const reviewed = !!r.codes.p4_reviewed;
    const sel = new Set(reviewed ? r.codes.p4 || [] : []);
    const chips = el('div', { class: 'chips' }, F.map(f => {
      const b = el('button', { type: 'button', class: `chip${!reviewed && sug.includes(f.id) ? ' suggested' : ''}`, 'aria-pressed': String(sel.has(f.id)),
        onclick: () => { sel.has(f.id) ? sel.delete(f.id) : sel.add(f.id); b.setAttribute('aria-pressed', String(sel.has(f.id))); } }, f.short);
      return b;
    }));
    const extra = [];
    if (a.p10) extra.push(el('div', null, el('b', null, 'Cómo resolvía pagos a terceros (P10): '), a.p10));
    if (a.p11) extra.push(el('div', null, el('b', null, 'Opera hoy con (P11): '), a.p11));
    if (a.p13) extra.push(el('div', null, el('b', null, 'Qué necesitaría para volver (P13): '), a.p13));

    return el('article', { class: 'resp' },
      el('div', { class: 'resp-head' },
        el('span', { class: `pill ${reviewed ? 'ok' : 'pending'}` }, reviewed ? 'Codificada' : 'Pendiente'),
        el('span', null, fmtDate(r.created_at)),
        r.ref ? el('span', { class: 'pill' }, `Cliente: ${r.ref}`) : null,
        el('span', { class: 'pill' }, labelOf('p2', a.p2)),
        el('span', { class: 'pill' }, labelOf('p3', a.p3)),
        el('span', { class: 'pill' }, labelOf('p1', a.p1))),
      el('p', { class: `resp-text${a.p4 ? '' : ' empty-text'}` }, a.p4 || 'Sin texto'),
      chips,
      extra.length ? el('div', { class: 'resp-extra' }, extra) : null,
      el('div', { class: 'resp-foot' },
        el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
          !reviewed && sug.length ? el('button', { type: 'button', class: 'btn sm', onclick: () => saveCodes(r, sug) }, `Aceptar sugerencia (${sug.map(fShort).join(', ')})`) : null,
          el('button', { type: 'button', class: 'btn sm primary', onclick: () => saveCodes(r, [...sel]) }, reviewed ? 'Actualizar' : 'Guardar codificación')),
        el('button', { type: 'button', class: 'linkbtn', onclick: async () => {
          if (!window.confirm('¿Eliminar esta respuesta? Úsalo solo para respuestas de prueba. No se puede deshacer.')) return;
          const res = await fetch(`/api/admin/responses/${r.id}`, { method: 'DELETE' });
          if (res.ok) { toast('Respuesta eliminada'); load(); } else toast('No se pudo eliminar');
        } }, 'Eliminar')));
  }

  function viewMetodo() {
    return [panel('Cómo leer este dashboard', null, el('ul', { class: 'method' },
      el('li', null, el('b', null, 'Espontánea (P4) primero. '), 'Es la única medida que no está influida por la lista de opciones. Solo cuenta lo que una persona codificó; las sugerencias automáticas no entran en la métrica.'),
      el('li', null, el('b', null, 'P6 para el ranking. '), 'Tiene una respuesta por persona, así que no tiene dobles conteos. P5 mide amplitud (puede sumar más de 100%).'),
      el('li', null, el('b', null, 'P7 para intensidad. '), 'Se reporta media, mediana y % de 4–5. La escala es ordinal: la mediana y el % 4–5 son más robustos que la media.'),
      el('li', null, el('b', null, 'P12 es intención declarada. '), 'Las preguntas hipotéticas sobreestiman el retorno. Compara las mejoras entre sí; no proyectes cuántos usuarios volverán.'),
      el('li', null, el('b', null, 'Muestras pequeñas. '), `Con menos de ${LOW_SAMPLE} respuestas, lee los conteos (entre paréntesis) junto a los porcentajes. En los cruces, las columnas con menos de ${MIN_N} respuestas aparecen rayadas: no son concluyentes.`),
      el('li', null, el('b', null, 'Orden aleatorio. '), 'El formulario muestra las opciones de P5 y P6 en orden aleatorio para cada persona ("Otro" siempre al final), y bloquea la edición de P4 una vez la persona ve las opciones.'),
      el('li', null, el('b', null, 'Tasa de respuesta. '), 'Registra a cuántos usuarios enviaste la encuesta. Responden más quienes tienen algo que decir; una tasa baja limita la generalización.'),
      el('li', null, el('b', null, 'Enlaces personalizados. '), 'Si agregas ?ref=CODIGO al enlace (p. ej. /?ref=U12345), la respuesta queda asociada a ese cliente y un segundo envío reemplaza al anterior. Sirve para cruzar con volumen transaccional en el CSV.')))];
  }

  /* ---------- render principal ---------- */
  function render() {
    const data = filtered();
    const pending = rows.filter(r => !r.codes.p4_reviewed).length;
    document.getElementById('pendBadge').textContent = String(pending);
    document.getElementById('fCount').textContent = `${data.length} de ${rows.length} respuestas`;

    const banners = [];
    if (meta.onRailway && !meta.persistent) banners.push(el('div', { class: 'banner critical' }, el('strong', null, 'Los datos no son persistentes. '), 'Este servicio no tiene un volumen. Agrega un volumen en Railway (ruta /data) o perderás las respuestas en el próximo despliegue.'));
    if (data.length && data.length < LOW_SAMPLE) banners.push(el('div', { class: 'banner' }, el('strong', null, `Muestra pequeña (n = ${data.length}). `), 'Lee los conteos junto a los porcentajes y evita conclusiones de los cruces.'));
    document.getElementById('banners').replaceChildren(...banners);

    const view = document.getElementById('view');
    const y = window.scrollY;
    const content = tab === 'resumen' ? viewResumen(data) : tab === 'cruces' ? viewCruces(data) : tab === 'codificar' ? viewCodificar(data) : viewMetodo();
    view.replaceChildren(...[content].flat(2).filter(Boolean));
    window.scrollTo(0, y);
    updateLive();
  }

  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    tab = t.dataset.tab;
    document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', String(x === t)));
    try { localStorage.setItem('dashTab', tab); } catch { /* sin almacenamiento */ }
    render();
  }));
  try {
    const saved = localStorage.getItem('dashTab');
    if (saved && document.querySelector(`.tab[data-tab="${saved}"]`)) document.querySelector(`.tab[data-tab="${saved}"]`).click();
  } catch { /* sin almacenamiento */ }

  document.getElementById('copyLink').addEventListener('click', async () => {
    const link = `${location.origin}/`;
    try { await navigator.clipboard.writeText(link); toast(`Enlace copiado: ${link}`); } catch { toast(link); }
  });

  load().catch(() => { online = false; updateLive(); });
  setInterval(poll, POLL_MS);
  setInterval(updateLive, 1000);
})();
