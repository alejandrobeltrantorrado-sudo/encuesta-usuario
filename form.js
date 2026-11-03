(function () {
  'use strict';
  const S = window.SURVEY;
  const params = new URLSearchParams(location.search);
  const ref = (params.get('ref') || params.get('id') || '').slice(0, 80);

  const state = { p5: [], p7: {}, p12: {} };
  let step = 0;
  let p4Locked = false;

  /* Orden aleatorio de factores (fijo durante la sesión). "Otro" siempre al final. */
  const shuffled = S.FACTORES.filter(f => f.id !== 'otro');
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  shuffled.push(S.factorById.otro);

  /* ---------- helpers DOM ---------- */
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, '');
      else n.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(k));
    return n;
  }

  function radios(key, options, onChange) {
    return el('div', { class: 'opts', role: 'radiogroup' }, options.map(o =>
      el('label', { class: 'opt' },
        el('input', { type: 'radio', name: key, value: o.id, checked: state[key] === o.id,
          onchange: () => { state[key] = o.id; onChange && onChange(); } }),
        el('span', null, o.label))));
  }

  function otherBox(key) {
    return el('input', { type: 'text', class: 'other-input', placeholder: '¿Cuál?', value: state[key] || '', maxlength: 200,
      oninput: e => { state[key] = e.target.value; } });
  }

  function question(id, title, help, ...body) {
    return el('fieldset', { class: 'q', 'data-q': id },
      el('legend', null, title),
      help ? el('p', { class: 'help' }, help) : null,
      body);
  }

  function scaleGrid(key, rows) {
    return el('table', { class: 'grid-q' },
      el('thead', null, el('tr', null, el('th', null, ''), [1, 2, 3, 4, 5].map(n => el('th', { scope: 'col' }, String(n))))),
      el('tbody', null, rows.map(r => el('tr', null,
        el('td', { class: 'row-label' }, r.label),
        [1, 2, 3, 4, 5].map(n => el('td', null,
          el('label', { class: 'scale-btn', title: `${r.label}: ${n}` },
            el('input', { type: 'radio', name: `${key}_${r.id}`, value: n, checked: state[key][r.id] === n,
              'aria-label': `${r.label}: ${n}`, onchange: () => { state[key][r.id] = n; } }),
            String(n))))))));
  }

  /* ---------- pasos ---------- */
  const steps = [
    {
      label: 'Sobre tu uso de Buda',
      render: () => [
        el('h1', null, 'Ayúdanos a entender qué pasó'),
        el('p', { class: 'lead' }, 'Son unos 5 minutos. Tus respuestas van directo al equipo que define el producto.'),
        el('div', { style: 'height:20px' }),
        question('p1', `1. ${S.p1.title}`, null, radios('p1', S.p1.options)),
        question('p2', `2. ${S.p2.title}`, null,
          radios('p2', S.p2.options, () => render()),
          state.p2 === 'otro' ? otherBox('p2_otro') : null),
        question('p3', `3. ${S.p3.title}`, null, radios('p3', S.p3.options))
      ],
      validate: () => ['p1', 'p2', 'p3'].filter(k => !state[k])
    },
    {
      label: 'Tu razón principal',
      render: () => [
        question('p4', `4. ${S.p4.title}`,
          p4Locked ? 'Ya registramos esta respuesta. Puedes continuar.' : 'Cuéntanos con tus propias palabras. No hay respuestas correctas.',
          el('textarea', { name: 'p4', maxlength: 2000, readonly: p4Locked, oninput: e => { state.p4 = e.target.value; } }, state.p4 || ''))
      ],
      validate: () => ((state.p4 || '').trim().length < 2 ? ['p4'] : []),
      onLeave: () => { p4Locked = true; }
    },
    {
      label: 'Factores de tu decisión',
      render: () => {
        const marked = shuffled.filter(f => state.p5.includes(f.id));
        if (state.p6 && !state.p5.includes(state.p6)) delete state.p6;
        if (marked.length === 1) state.p6 = marked[0].id;
        return [
          question('p5', `5. ${S.p5.title}`, 'Puedes marcar varios.',
            el('div', { class: 'opts' }, shuffled.map(f =>
              el('label', { class: 'opt' },
                el('input', { type: 'checkbox', name: 'p5', value: f.id, checked: state.p5.includes(f.id), onchange: e => {
                  if (e.target.checked) state.p5.push(f.id); else state.p5 = state.p5.filter(x => x !== f.id);
                  render();
                } }),
                el('span', null, f.label)))),
            state.p5.includes('otro') ? otherBox('p5_otro') : null),
          question('p6', `6. ${S.p6.title}`, marked.length ? null : 'Primero marca al menos un factor en la pregunta 5.',
            marked.length ? radios('p6', marked) : null),
          question('p7', `7. ${S.p7.title}`, S.p7.scale,
            scaleGrid('p7', S.p7.rows.map(id => ({ id, label: S.factorById[id].short }))))
        ];
      },
      validate: () => {
        const bad = [];
        if (!state.p5.length) bad.push('p5');
        if (!state.p6 || !state.p5.includes(state.p6)) bad.push('p6');
        if (S.p7.rows.some(r => !state.p7[r])) bad.push('p7');
        return bad;
      }
    },
    {
      label: 'Pagos a terceros',
      render: () => [
        question('p8', `8. ${S.p8.title}`, null, radios('p8', S.p8.options, () => render())),
        state.p8 && state.p8 !== 'no' ? [
          question('p9', `9. ${S.p9.title}`, null, radios('p9', S.p9.options)),
          question('p10', `10. ${S.p10.title}`, 'Opcional',
            el('textarea', { name: 'p10', maxlength: 2000, oninput: e => { state.p10 = e.target.value; } }, state.p10 || ''))
        ] : null
      ],
      validate: () => {
        const bad = [];
        if (!state.p8) bad.push('p8');
        if (state.p8 && state.p8 !== 'no' && !state.p9) bad.push('p9');
        return bad;
      }
    },
    {
      label: 'Hoy y a futuro',
      render: () => [
        question('p11', `11. ${S.p11.title}`, 'Opcional',
          el('input', { type: 'text', name: 'p11', maxlength: 300, value: state.p11 || '', placeholder: 'Ej.: otra plataforma, banco, ninguna…',
            oninput: e => { state.p11 = e.target.value; } })),
        question('p12', `12. ${S.p12.title}`, S.p12.scale, scaleGrid('p12', S.p12.rows)),
        question('p13', `13. ${S.p13.title}`, 'Opcional',
          el('textarea', { name: 'p13', maxlength: 2000, oninput: e => { state.p13 = e.target.value; } }, state.p13 || ''))
      ],
      validate: () => (S.p12.rows.some(r => !state.p12[r.id]) ? ['p12'] : [])
    }
  ];

  /* ---------- render y navegación ---------- */
  const host = document.getElementById('stepHost');
  const errorBox = document.getElementById('error');
  const backBtn = document.getElementById('back');
  const nextBtn = document.getElementById('next');

  function render() {
    const scrollY = window.scrollY;
    const a = document.activeElement;
    const focusedName = a && a.name;
    const focusedVal = a && a.value;
    host.replaceChildren(...[steps[step].render()].flat(3).filter(Boolean));
    document.getElementById('bar').style.width = `${((step + 1) / steps.length) * 100}%`;
    document.getElementById('stepLabel').textContent = `Paso ${step + 1} de ${steps.length} · ${steps[step].label}`;
    backBtn.style.visibility = step === 0 ? 'hidden' : 'visible';
    nextBtn.textContent = step === steps.length - 1 ? 'Enviar respuestas' : 'Siguiente';
    window.scrollTo(0, scrollY);
    if (focusedName) {
      const f = host.querySelector(`input[name="${CSS.escape(focusedName)}"][value="${CSS.escape(String(focusedVal))}"]`);
      if (f) f.focus({ preventScroll: true });
    }
  }

  function showErrors(bad) {
    host.querySelectorAll('.q').forEach(q => q.classList.toggle('invalid', bad.includes(q.dataset.q)));
    errorBox.textContent = bad.length ? 'Responde las preguntas marcadas en rojo para continuar.' : '';
    if (bad.length) {
      const first = host.querySelector(`.q[data-q="${bad[0]}"]`);
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  backBtn.addEventListener('click', () => { if (step > 0) { step--; errorBox.textContent = ''; render(); window.scrollTo(0, 0); } });

  document.getElementById('form').addEventListener('submit', async e => {
    e.preventDefault();
    const bad = steps[step].validate();
    showErrors(bad);
    if (bad.length) return;
    if (steps[step].onLeave) steps[step].onLeave();
    if (step < steps.length - 1) { step++; render(); window.scrollTo(0, 0); return; }

    nextBtn.disabled = true; nextBtn.textContent = 'Enviando…';
    const answers = { ...state };
    if (answers.p8 === 'no') { delete answers.p9; delete answers.p10; }
    try {
      const r = await fetch('/api/responses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, ref, website: e.target.website.value })
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'No se pudo enviar');
      }
      document.getElementById('form').hidden = true;
      document.querySelector('.progress').hidden = true;
      document.getElementById('stepLabel').hidden = true;
      document.getElementById('done').hidden = false;
      window.scrollTo(0, 0);
    } catch (err) {
      errorBox.textContent = `${err.message}. Revisa tu conexión e intenta de nuevo.`;
      nextBtn.disabled = false; nextBtn.textContent = 'Enviar respuestas';
    }
  });

  render();
})();
