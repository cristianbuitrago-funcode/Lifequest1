/*
 * Pestaña DECIDIA — "Convierte tus decisiones en escenarios."
 *
 * Herramienta independiente del juego: no da XP ni monedas y no usa misiones.
 * Usa lo general de la app: el router (ui.views.decidia), el store genérico
 * (colección `decisions`), el tema (variables CSS) y los toasts/modales.
 *
 * Vistas internas: inicio · escenario (editor) · comparador · asistente "No sé".
 * Al cambiar un valor solo se recalculan los resultados (no se redibujan los
 * campos), así no se pierde el foco ni el arrastre de los deslizadores.
 */
(function (LQ) {
  "use strict";

  const { state, store, ui } = LQ;
  const { escapeHtml } = LQ.utils;
  const D = LQ.Decidia;
  const COLLECTION = 'decisions';

  // ---------------------------------------------------------------- estado
  let view = 'home';          // home | scenario | compare | wizard
  let draft = null;           // copia de trabajo de la decisión abierta
  let isSaved = false;        // ¿ya existe en el store? (entonces se autoguarda)
  let whatIf = null;          // { variableId: valor } mientras "¿Y si…?" está abierto
  let showFuture = false;
  let horizon = 'month';
  let wizard = { cat: null, step: 0, answers: {} };
  let homeText = '';
  let saveTimer = null;
  let bound = false;
  const shown = {};           // últimos números mostrados (para animarlos)

  const root = () => document.getElementById('view-decidia');
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const byId = (list, id) => (list || []).find(x => x.id === id);
  const valStr = (v) => (v == null ? '' : String(v));

  function fmt(value, unit){
    const v = num(value);
    if (unit === 'money') return (v < 0 ? '−' : '') + ui.money(Math.abs(Math.round(v)));
    if (unit === 'hours') return v.toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' h';
    if (unit === 'percent') return v.toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' %';
    if (unit === 'scale') return '★'.repeat(Math.max(0, Math.min(5, Math.round(v)))) + '☆'.repeat(Math.max(0, 5 - Math.round(v)));
    return v.toLocaleString('es-CO', { maximumFractionDigits: 2 });
  }
  function signed(value, unit){ return (value > 0 ? '+' : value < 0 ? '−' : '') + fmt(Math.abs(value), unit); }
  const baseUnit = () => { const b = draft && byId(draft.variables, draft.baseId); return b ? b.unit : 'money'; };

  // ------------------------------------------------------------ render raíz
  /**
   * Punto de entrada del router y de ui.renderAll(). Si ya está abierto el
   * editor, no lo redibuja (se perdería el foco o el arrastre de un
   * deslizador): solo refresca los resultados.
   */
  function render(){
    const el = root();
    if (!el) return;
    if ((view === 'scenario' || view === 'compare') && draft && el.dataset.painted === view + ':' + draft.id + ':' + isSaved){
      if (view === 'scenario') updateResults(false); else updateCompare();
      return;
    }
    paint();
  }

  function paint(){
    const el = root();
    if (!el) return;
    bindOnce(el);
    el.classList.add('decidia');
    el.dataset.painted = draft && (view === 'scenario' || view === 'compare') ? view + ':' + draft.id + ':' + isSaved : '';
    if (view === 'scenario' && draft) renderScenario(el);
    else if (view === 'compare' && draft) renderCompare(el);
    else if (view === 'wizard') renderWizard(el);
    else renderHome(el);
  }

  function go(next){
    view = next;
    paint();
    window.scrollTo(0, 0);
  }

  /** Abre una decisión guardada (o una nueva sin guardar). */
  function open(decision, saved){
    draft = clone(decision);
    isSaved = !!saved;
    whatIf = null; showFuture = false;
    go(draft.type === 'compare' ? 'compare' : 'scenario');
  }

  // ------------------------------------------------------------------ inicio
  function renderHome(el){
    const list = state.decisions || [];
    el.innerHTML = `
      <div class="decidia-hero">
        <div class="decidia-brand"><span class="decidia-logo">🧠</span><div><h2>DECIDIA</h2><div class="decidia-tag">Convierte tus decisiones en escenarios.</div></div></div>
        <label class="decidia-ask" for="dcAsk">¿Qué estás intentando decidir?</label>
        <textarea id="dcAsk" rows="3" maxlength="240" placeholder="Ej: Tengo $100.000 y estoy pensando en comprar unos audífonos de $70.000.">${escapeHtml(homeText)}</textarea>
        <button class="btn decidia-cta" data-c="create">✨ Crear decisión</button>
        <div class="decidia-alt">
          <button class="decidia-pill" data-c="wizard">❓ No sé</button>
          <button class="decidia-pill" data-c="compare-new">⚖️ Comparar</button>
        </div>
        <div class="decidia-privacy">🔒 Todo se calcula en tu teléfono. DECIDIA no usa IA externa ni analítica; tus decisiones solo se copian a tu cuenta si inicias sesión.</div>
      </div>
      <div class="panel">
        <div class="section-head"><h2>Mis decisiones</h2><span class="tag">${list.length}</span></div>
        ${list.length ? `<div class="decision-list">${list.map(d => `
          <button class="decision-item" data-c="open" data-id="${escapeHtml(d.id)}">
            <span class="decision-emoji">${escapeHtml(d.emoji || (d.type === 'compare' ? '⚖️' : '🧠'))}</span>
            <span class="decision-main">
              <b>${escapeHtml(d.title || 'Sin título')}</b>
              <small>${d.type === 'compare'
                ? '⚖️ Comparación · ' + (d.aspects || []).length + ' aspectos'
                : '🔀 ' + (d.options || []).length + ' opciones · ' + (d.variables || []).length + ' variables'} · ${escapeHtml(dateLabel(d.updatedAt))}</small>
            </span>
            <span class="decision-go">›</span>
          </button>`).join('')}</div>`
        : '<div class="empty">Aún no tienes decisiones. Escribe arriba lo que estás pensando o toca <b>❓ No sé</b>.</div>'}
      </div>`;
  }

  function dateLabel(ms){
    if (!ms) return '';
    const d = new Date(ms);
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  }

  // -------------------------------------------------------------- escenario
  function renderScenario(el){
    const d = draft;
    el.innerHTML = `
      <div class="decidia-bar">
        <button class="decidia-back" data-c="home">← Decisiones</button>
        <span class="decidia-save-state" id="dcSaveState">${isSaved ? '✓ Guardado' : 'Sin guardar'}</span>
      </div>
      <div class="panel decision-head">
        <div class="decision-kicker">${escapeHtml(d.emoji || '🧠')} Decisión</div>
        <input type="text" class="decision-title" data-f="dec.title" value="${escapeHtml(d.title)}" placeholder="¿Qué vas a decidir?" maxlength="80" aria-label="Título de la decisión">
        <textarea class="decision-desc" data-f="dec.desc" rows="2" maxlength="300" placeholder="Situación (opcional)">${escapeHtml(d.description || '')}</textarea>
      </div>

      <div class="scenario-grid" id="dcCards"></div>

      <div class="decidia-tools">
        <button class="decidia-tool ${whatIf ? 'is-on' : ''}" data-c="whatif">🔀 ¿Y SI…?</button>
        <button class="decidia-tool ${showFuture ? 'is-on' : ''}" data-c="future">🔮 VER A FUTURO</button>
      </div>
      <div id="dcWhatIf"></div>
      <div id="dcFuture"></div>

      <div class="panel">
        <div class="section-head"><h2>Variables</h2></div>
        <div class="sub">Los datos de tu situación. Cambia un valor y los escenarios se actualizan al instante.</div>
        <div id="dcVars"></div>
        <div class="variable-presets">
          ${[['💰', 'Dinero disponible', 'money'], ['💵', 'Precio', 'money'], ['📅', 'Tiempo (meses)', 'number'], ['📦', 'Durabilidad (años)', 'number'],
             ['⏳', 'Horas por semana', 'hours'], ['🔁', 'Veces por semana', 'number'], ['🔢', 'Otra variable', 'number']]
            .map(([e, n, u]) => `<button class="chip" data-c="add-var" data-emoji="${e}" data-name="${escapeHtml(n)}" data-unit="${u}">${e} ${escapeHtml(n)}</button>`).join('')}
        </div>
      </div>

      <div class="panel">
        <div class="section-head"><h2>Opciones</h2><button class="btn ghost small" data-c="add-opt">+ Opción</button></div>
        <div class="sub">Qué pasa con tus variables en cada opción: pagos únicos o que se repiten.</div>
        <div id="dcOpts"></div>
      </div>

      <div class="panel">
        <div class="section-head"><h2>Otros aspectos</h2><button class="btn ghost small" data-c="add-asp">+ Aspecto</button></div>
        <div class="sub">Lo que no es dinero ni tiempo: durabilidad, comodidad, prioridad personal…</div>
        <div id="dcAsps"></div>
      </div>

      <div class="decidia-footer">
        ${isSaved ? '' : '<button class="btn" data-c="save">💾 Guardar decisión</button>'}
        <button class="btn ghost small" data-c="duplicate">Duplicar</button>
        ${isSaved ? '<button class="btn ghost small decidia-danger" data-c="delete">Eliminar</button>' : ''}
      </div>`;
    renderVars(); renderOpts(); renderAsps(); renderWhatIf(); updateResults(false);
  }

  function renderVars(){
    const box = document.getElementById('dcVars');
    if (!box) return;
    const d = draft;
    box.innerHTML = d.variables.length ? d.variables.map(v => `
      <div class="variable-row ${d.baseId === v.id ? 'is-base' : ''}" data-var="${escapeHtml(v.id)}">
        <div class="variable-top">
          <span class="variable-emoji">${escapeHtml(v.emoji || '🔢')}</span>
          <input type="text" class="variable-name" data-f="var.name" data-id="${escapeHtml(v.id)}" value="${escapeHtml(v.name)}" maxlength="40" aria-label="Nombre de la variable">
          <button class="icon-btn" data-c="del-var" data-id="${escapeHtml(v.id)}" aria-label="Quitar variable">${ui.svgTrash()}</button>
        </div>
        <div class="variable-control">
          <input type="range" data-f="var.value" data-id="${escapeHtml(v.id)}" min="${v.min}" max="${Math.max(v.max, v.value)}" step="${v.step}" value="${v.value}" aria-label="${escapeHtml(v.name)}">
          <input type="number" class="variable-num" data-f="var.value" data-id="${escapeHtml(v.id)}" step="${v.step}" value="${v.value}" inputmode="decimal" aria-label="${escapeHtml(v.name)} (número)">
        </div>
        <div class="variable-meta">
          <select data-f="var.unit" data-id="${escapeHtml(v.id)}" aria-label="Tipo">
            ${Object.keys(D.UNITS).map(u => `<option value="${u}" ${u === v.unit ? 'selected' : ''}>${D.UNITS[u].label}</option>`).join('')}
          </select>
          <label class="variable-base"><input type="radio" name="dcBase" data-f="var.base" data-id="${escapeHtml(v.id)}" ${d.baseId === v.id ? 'checked' : ''}> Es lo que tienes (base)</label>
          <span class="variable-fmt" data-fmt="${escapeHtml(v.id)}">${fmt(v.value, v.unit)}</span>
        </div>
      </div>`).join('')
      : '<div class="empty">Añade las variables de tu situación con los botones de abajo.</div>';
  }

  function varOptions(selected, allowNone, noneLabel){
    return (allowNone ? `<option value="" ${!selected ? 'selected' : ''}>${noneLabel}</option>` : '') +
      draft.variables.map(v => `<option value="${escapeHtml(v.id)}" ${v.id === selected ? 'selected' : ''}>${escapeHtml(v.emoji || '')} ${escapeHtml(v.name)}</option>`).join('');
  }

  function renderOpts(){
    const box = document.getElementById('dcOpts');
    if (!box) return;
    box.innerHTML = draft.options.map(o => `
      <div class="option-card" style="--opt:${escapeHtml(o.color || '#3fb8f0')}">
        <div class="option-top">
          <input type="text" class="option-emoji" data-f="opt.emoji" data-id="${escapeHtml(o.id)}" value="${escapeHtml(o.emoji || '')}" maxlength="4" aria-label="Emoji">
          <input type="text" class="option-name" data-f="opt.name" data-id="${escapeHtml(o.id)}" value="${escapeHtml(o.name)}" maxlength="40" aria-label="Nombre de la opción">
          ${draft.options.length > 1 ? `<button class="icon-btn" data-c="del-opt" data-id="${escapeHtml(o.id)}" aria-label="Quitar opción">${ui.svgTrash()}</button>` : ''}
        </div>
        ${(o.items || []).map(it => {
          const fixed = !(it.refs || []).length;
          return `
          <div class="option-item" data-opt="${escapeHtml(o.id)}" data-item="${escapeHtml(it.id)}">
            <select class="item-sign" data-f="item.sign" aria-label="Suma o resta">
              <option value="-1" ${it.sign < 0 ? 'selected' : ''}>− Resta</option>
              <option value="1" ${it.sign > 0 ? 'selected' : ''}>+ Suma</option>
            </select>
            <input type="text" class="item-label" data-f="item.label" value="${escapeHtml(it.label)}" maxlength="40" placeholder="Concepto" aria-label="Concepto">
            <select data-f="item.ref1" aria-label="Valor">${varOptions(fixed ? '' : it.refs[0], true, 'Cantidad fija')}</select>
            ${fixed
              ? `<input type="number" class="item-fixed" data-f="item.factor" value="${num(it.factor)}" inputmode="decimal" aria-label="Cantidad fija">`
              : `<select data-f="item.ref2" aria-label="Multiplicar por">${varOptions(it.refs[1] || '', true, '× nada')}</select>`}
            <select data-f="item.every" aria-label="Frecuencia">
              ${Object.keys(D.EVERY_LABELS).map(k => `<option value="${k}" ${k === it.every ? 'selected' : ''}>${D.EVERY_LABELS[k]}</option>`).join('')}
            </select>
            <button class="icon-btn" data-c="del-item" data-opt="${escapeHtml(o.id)}" data-id="${escapeHtml(it.id)}" aria-label="Quitar">${ui.svgTrash()}</button>
          </div>`;
        }).join('')}
        <button class="btn ghost small" data-c="add-item" data-id="${escapeHtml(o.id)}">+ Efecto</button>
        <textarea class="option-notes" data-f="opt.notes" data-id="${escapeHtml(o.id)}" rows="1" maxlength="200" placeholder="Notas (opcional)">${escapeHtml(o.notes || '')}</textarea>
      </div>`).join('');
  }

  function renderAsps(){
    const box = document.getElementById('dcAsps');
    if (!box) return;
    const d = draft;
    if (!d.aspects.length){ box.innerHTML = '<div class="hint">Opcional. Ej: durabilidad, comodidad o qué tan importante es para ti.</div>'; return; }
    box.innerHTML = d.aspects.map(a => `
      <div class="aspect-row">
        <div class="variable-top">
          <span class="variable-emoji">${escapeHtml(a.emoji || '•')}</span>
          <input type="text" class="variable-name" data-f="asp.name" data-id="${escapeHtml(a.id)}" value="${escapeHtml(a.name)}" maxlength="40" aria-label="Aspecto">
          <select data-f="asp.unit" data-id="${escapeHtml(a.id)}" aria-label="Tipo">
            ${Object.keys(D.UNITS).map(u => `<option value="${u}" ${u === a.unit ? 'selected' : ''}>${D.UNITS[u].label}</option>`).join('')}
          </select>
          <button class="icon-btn" data-c="del-asp" data-id="${escapeHtml(a.id)}" aria-label="Quitar aspecto">${ui.svgTrash()}</button>
        </div>
        <div class="aspect-values">
          ${d.options.map(o => `<label class="aspect-val" style="--opt:${escapeHtml(o.color || '#3fb8f0')}"><span data-opt-name="${escapeHtml(o.id)}">${escapeHtml(o.emoji || '')} ${escapeHtml(o.name)}</span>
            <input type="number" data-f="opt.aspect" data-opt="${escapeHtml(o.id)}" data-id="${escapeHtml(a.id)}" value="${o.aspects && o.aspects[a.id] != null ? o.aspects[a.id] : ''}" inputmode="decimal" ${a.unit === 'scale' ? 'min="1" max="5"' : ''}></label>`).join('')}
        </div>
      </div>`).join('');
  }

  // -------------------------------------------------- resultados (en vivo)
  function updateResults(animate){
    if (view !== 'scenario' || !draft) return;
    const base = D.evaluate(draft);
    const now = whatIf ? D.evaluate(draft, whatIf) : base;
    const delta = whatIf ? D.diff(base, now) : null;
    renderCards(now, delta, animate !== false);
    renderFuture(now);
  }

  function renderCards(res, delta, animate){
    const box = document.getElementById('dcCards');
    if (!box) return;
    const unit = baseUnit();
    if (!res.options.length){ box.innerHTML = '<div class="panel"><div class="empty">Añade al menos una opción.</div></div>'; return; }
    box.innerHTML = res.options.map(o => {
      const bigLabel = res.hasBase ? 'Te queda' : 'Cambio único';
      const big = res.hasBase ? o.balanceNow : o.once;
      const dl = delta && delta[o.id];
      const changed = dl && (dl.balanceNow || dl.year);
      const monthly = o.projection.find(p => p.id === 'month');
      return `
      <article class="scenario-card ${changed ? 'is-changed' : ''} ${big < 0 && res.hasBase ? 'is-negative' : ''}" style="--opt:${escapeHtml(o.color || '#3fb8f0')}">
        <header><span class="scenario-emoji">${escapeHtml(o.emoji || '')}</span><h3>${escapeHtml(o.name)}</h3></header>
        <div class="scenario-big-label">${bigLabel}</div>
        <div class="scenario-big num" data-anim="${escapeHtml(o.id)}:big" data-unit="${unit}" data-val="${big}">${fmt(big, unit)}</div>
        ${dl && dl.balanceNow ? `<div class="scenario-delta">${signed(dl.balanceNow, unit)} con "¿Y si…?"</div>` : ''}
        <dl class="scenario-facts">
          <div><dt>Gasto inicial</dt><dd class="num">${fmt(o.outflow, unit)}</dd></div>
          ${o.recurring ? `<div><dt>Cada mes</dt><dd class="num">${signed(monthly.flow, unit)}</dd></div>` : ''}
          ${o.lines.filter(l => l.every !== 'once').map(l => `<div><dt>${escapeHtml(l.label)}</dt><dd class="num">${signed(l.amount, unit)} ${D.EVERY_LABELS[l.every]}</dd></div>`).join('')}
          ${draft.aspects.map(a => o.aspects[a.id] != null && o.aspects[a.id] !== ''
            ? `<div><dt>${escapeHtml(a.emoji || '')} ${escapeHtml(a.name)}</dt><dd>${fmt(o.aspects[a.id], a.unit)}</dd></div>` : '').join('')}
        </dl>
        <ul class="scenario-notes">${D.describe(o, draft).map(t => `<li>${escapeHtml(t)}</li>`).join('')}${o.notes ? `<li>📝 ${escapeHtml(o.notes)}</li>` : ''}</ul>
      </article>`;
    }).join('');
    if (animate) animateNumbers(box);
    else box.querySelectorAll('[data-anim]').forEach(n => { shown[n.dataset.anim] = num(n.dataset.val); });
  }

  /** Cuenta desde el valor anterior hasta el nuevo (~300 ms). */
  function animateNumbers(box){
    const reduce = globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    box.querySelectorAll('[data-anim]').forEach(n => {
      const key = n.dataset.anim, to = num(n.dataset.val), unit = n.dataset.unit;
      const from = key in shown ? shown[key] : to;
      shown[key] = to;
      if (reduce || from === to) return;
      n.classList.add('is-bumping');
      const t0 = performance.now(), dur = 300;
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        n.textContent = fmt(from + (to - from) * e, unit);
        if (k < 1) requestAnimationFrame(step); else { n.textContent = fmt(to, unit); n.classList.remove('is-bumping'); }
      };
      requestAnimationFrame(step);
    });
  }

  // ------------------------------------------------------------- ¿Y SI…?
  function renderWhatIf(){
    const box = document.getElementById('dcWhatIf');
    if (!box) return;
    if (!whatIf){ box.innerHTML = ''; return; }
    const vars = draft.variables;
    box.innerHTML = `
      <div class="panel decidia-whatif">
        <h2>🔀 ¿Y si…?</h2>
        <div class="sub">Prueba otros valores. Tu decisión no cambia hasta que toques <b>Aplicar</b>.</div>
        ${vars.length ? vars.map(v => {
          const cur = v.id in whatIf ? whatIf[v.id] : v.value;
          return `
          <div class="whatif-row ${cur !== v.value ? 'is-changed' : ''}" data-wi="${escapeHtml(v.id)}">
            <div class="whatif-label"><span data-wi-name>${escapeHtml(v.emoji || '')} ${escapeHtml(v.name)}</span>
              <span class="whatif-vals"><s>${fmt(v.value, v.unit)}</s> → <b data-wifmt>${fmt(cur, v.unit)}</b></span></div>
            <input type="range" data-f="wi.value" data-id="${escapeHtml(v.id)}" min="${v.min}" max="${Math.max(v.max, cur, v.value)}" step="${v.step}" value="${cur}" aria-label="${escapeHtml(v.name)}">
          </div>`;
        }).join('') : '<div class="empty">Añade variables para probar escenarios.</div>'}
        <div class="row" style="margin-top:12px">
          <button class="btn small" data-c="wi-apply">Aplicar a la decisión</button>
          <button class="btn ghost small" data-c="wi-reset">Restablecer</button>
          <button class="btn ghost small" data-c="wi-save">Guardar este escenario</button>
        </div>
        ${(draft.scenarios || []).length ? `<div class="whatif-saved"><span>Escenarios guardados:</span>
          ${draft.scenarios.map(s => `<span class="chip whatif-chip"><button data-c="wi-load" data-id="${escapeHtml(s.id)}">${escapeHtml(s.name)}</button><button data-c="wi-del" data-id="${escapeHtml(s.id)}" aria-label="Borrar">×</button></span>`).join('')}</div>` : ''}
      </div>`;
  }

  // -------------------------------------------------------- VER A FUTURO
  function renderFuture(res){
    const box = document.getElementById('dcFuture');
    if (!box) return;
    if (!showFuture){ box.innerHTML = ''; return; }
    const unit = baseUnit();
    const h = D.HORIZONS.find(x => x.id === horizon) || D.HORIZONS[1];
    const rows = res.options.map(o => ({ o, p: o.projection.find(x => x.id === h.id) }));
    const value = (r) => res.hasBase ? r.p.balance : r.p.total;
    const max = Math.max(1, ...rows.map(r => Math.abs(value(r))));
    box.innerHTML = `
      <div class="panel decidia-future">
        <h2>🔮 Ver a futuro</h2>
        <div class="chips">${D.HORIZONS.map(x => `<button class="chip ${x.id === h.id ? 'active' : ''}" data-c="horizon" data-id="${x.id}">${x.label}</button>`).join('')}</div>
        <div class="future-bars">
          ${rows.map(r => `
            <div class="future-row" style="--opt:${escapeHtml(r.o.color || '#3fb8f0')}">
              <div class="future-name">${escapeHtml(r.o.emoji || '')} ${escapeHtml(r.o.name)}</div>
              <div class="future-track"><div class="future-fill ${value(r) < 0 ? 'is-negative' : ''}" style="width:${Math.round(Math.abs(value(r)) / max * 100)}%"></div></div>
              <div class="future-val num">${fmt(value(r), unit)}</div>
              <div class="future-sub">${res.hasBase ? 'Saldo' : 'Total'} en ${h.label.toLowerCase()} · lo que se repite: ${signed(r.p.flow, unit)}</div>
            </div>`).join('')}
        </div>
        <div class="future-table" role="table">
          <div class="future-head" role="row"><span role="columnheader">Horizonte</span>${res.options.map(o => `<span role="columnheader">${escapeHtml(o.emoji || '')} ${escapeHtml(o.name)}</span>`).join('')}</div>
          ${D.HORIZONS.map(x => `<div class="future-line ${x.id === h.id ? 'is-active' : ''}" role="row"><span role="cell">${x.label}</span>${res.options.map(o => {
            const p = o.projection.find(y => y.id === x.id);
            return `<span class="num" role="cell">${fmt(res.hasBase ? p.balance : p.total, unit)}</span>`;
          }).join('')}</div>`).join('')}
        </div>
        <div class="hint">Calculado con tus variables: lo diario ×7, ×30, ×182 y ×365; lo semanal ×1, ×30/7, ×26 y ×52; lo mensual ×7/30, ×1, ×6 y ×12.</div>
      </div>`;
  }

  // ----------------------------------------------------------- comparador
  function renderCompare(el){
    const d = draft;
    const [a, b] = d.sides;
    el.innerHTML = `
      <div class="decidia-bar">
        <button class="decidia-back" data-c="home">← Decisiones</button>
        <span class="decidia-save-state" id="dcSaveState">${isSaved ? '✓ Guardado' : 'Sin guardar'}</span>
      </div>
      <div class="panel decision-head">
        <div class="decision-kicker">⚖️ Comparar</div>
        <input type="text" class="decision-title" data-f="dec.title" value="${escapeHtml(d.title)}" placeholder="Ej: Bus vs Bicicleta" maxlength="80" aria-label="Título">
      </div>
      <div class="comparison-sides">
        <input type="text" class="comparison-side side-a" data-f="cmp.side" data-id="${escapeHtml(a.id)}" value="${escapeHtml(a.name)}" maxlength="30" aria-label="Opción A">
        <span class="comparison-vs">VS</span>
        <input type="text" class="comparison-side side-b" data-f="cmp.side" data-id="${escapeHtml(b.id)}" value="${escapeHtml(b.name)}" maxlength="30" aria-label="Opción B">
      </div>
      <div class="panel">
        <div class="section-head"><h2>¿Qué quieres comparar?</h2></div>
        <div class="variable-presets">
          ${D.ASPECT_PRESETS.map(p => `<button class="chip" data-c="cmp-add" data-emoji="${p.emoji}" data-name="${escapeHtml(p.name)}" data-unit="${p.unit}">${p.emoji} ${escapeHtml(p.name)}</button>`).join('')}
          <button class="chip" data-c="cmp-add" data-emoji="📝" data-name="Otro aspecto" data-unit="text">📝 Otro</button>
        </div>
        <div id="dcCmpRows"></div>
      </div>
      <div id="dcCmpResult"></div>
      <div class="decidia-footer">
        ${isSaved ? '' : '<button class="btn" data-c="save">💾 Guardar comparación</button>'}
        ${isSaved ? '<button class="btn ghost small decidia-danger" data-c="delete">Eliminar</button>' : ''}
      </div>`;
    renderCompareRows();
    updateCompare();
  }

  function renderCompareRows(){
    const box = document.getElementById('dcCmpRows');
    if (!box) return;
    const [a, b] = draft.sides;
    box.innerHTML = draft.aspects.length ? draft.aspects.map(asp => {
      const type = asp.unit === 'text' ? 'text' : 'number';
      const attrs = asp.unit === 'scale' ? 'min="1" max="5"' : '';
      return `
      <div class="comparison-edit">
        <div class="variable-top">
          <span class="variable-emoji">${escapeHtml(asp.emoji || '•')}</span>
          <input type="text" class="variable-name" data-f="cmp.name" data-id="${escapeHtml(asp.id)}" value="${escapeHtml(asp.name)}" maxlength="40" aria-label="Aspecto">
          <button class="icon-btn" data-c="cmp-del" data-id="${escapeHtml(asp.id)}" aria-label="Quitar">${ui.svgTrash()}</button>
        </div>
        <div class="comparison-inputs">
          <label><span class="side-a-txt" data-side-name="${escapeHtml(a.id)}">${escapeHtml(a.name)}</span><input type="${type}" data-f="cmp.val" data-id="${escapeHtml(asp.id)}" data-side="${escapeHtml(a.id)}" value="${escapeHtml(valStr(asp.values[a.id]))}" ${attrs} ${type === 'number' ? 'inputmode="decimal"' : 'maxlength="60"'}></label>
          <label><span class="side-b-txt" data-side-name="${escapeHtml(b.id)}">${escapeHtml(b.name)}</span><input type="${type}" data-f="cmp.val" data-id="${escapeHtml(asp.id)}" data-side="${escapeHtml(b.id)}" value="${escapeHtml(valStr(asp.values[b.id]))}" ${attrs} ${type === 'number' ? 'inputmode="decimal"' : 'maxlength="60"'}></label>
        </div>
        <div class="comparison-weight" role="group" aria-label="Importancia para ti">
          <span>¿Cuánto te importa?</span>
          ${[1, 2, 3, 4, 5].map(n => `<button class="weight-dot ${n <= asp.weight ? 'on' : ''}" data-c="cmp-weight" data-id="${escapeHtml(asp.id)}" data-w="${n}" aria-label="${n} de 5">●</button>`).join('')}
        </div>
      </div>`;
    }).join('') : '<div class="empty">Elige arriba los aspectos que te importan.</div>';
  }

  function updateCompare(){
    const box = document.getElementById('dcCmpResult');
    if (!box || view !== 'compare') return;
    const c = D.compare(draft);
    if (!c.rows.length){ box.innerHTML = ''; return; }
    box.innerHTML = `
      <div class="panel comparison-result">
        <h2>Diferencias</h2>
        <div class="sub">${c.differences} de ${c.rows.length} aspectos son distintos. Ordenados por lo que más te importa. Tú decides.</div>
        ${c.rows.map(r => `
          <div class="comparison-row ${r.equal ? 'is-equal' : ''}">
            <div class="comparison-label">${escapeHtml(r.emoji || '')} ${escapeHtml(r.name)} <span class="comparison-imp">${'●'.repeat(r.weight)}</span></div>
            ${r.unit === 'text' ? `
              <div class="comparison-text"><span class="side-a-txt">${escapeHtml(c.a.name)}:</span> ${escapeHtml(r.a || '—')}</div>
              <div class="comparison-text"><span class="side-b-txt">${escapeHtml(c.b.name)}:</span> ${escapeHtml(r.b || '—')}</div>` : `
              <div class="comparison-bar"><span class="side-a-txt">${escapeHtml(c.a.name)}</span><div class="comparison-track"><div class="comparison-fill side-a-bg" style="width:${Math.round(r.pctA * 100)}%"></div></div><b class="num">${fmt(r.a, r.unit)}</b></div>
              <div class="comparison-bar"><span class="side-b-txt">${escapeHtml(c.b.name)}</span><div class="comparison-track"><div class="comparison-fill side-b-bg" style="width:${Math.round(r.pctB * 100)}%"></div></div><b class="num">${fmt(r.b, r.unit)}</b></div>
              <div class="comparison-diff">${r.equal ? 'Iguales' : 'Diferencia: ' + fmt(Math.abs(r.delta), r.unit === 'scale' ? 'number' : r.unit) + (r.unit === 'scale' ? ' puntos' : '')}</div>`}
          </div>`).join('')}
      </div>`;
  }

  // ------------------------------------------------------ asistente "No sé"
  function renderWizard(el){
    const w = wizard;
    if (!w.cat){
      el.innerHTML = `
        <div class="decidia-bar"><button class="decidia-back" data-c="home">← Volver</button></div>
        <div class="panel decidia-wizard">
          <div class="decision-kicker">❓ No sé</div>
          <h2>¿Qué estás intentando resolver?</h2>
          <div class="sub">Elige un tema y te haré unas preguntas cortas para armar tu decisión.</div>
          <div class="wizard-grid">
            ${D.WIZARD_ORDER.map(k => `<button class="wizard-tile" data-c="wz-cat" data-id="${k}"><span>${D.WIZARD[k].emoji}</span>${escapeHtml(D.WIZARD[k].label)}</button>`).join('')}
          </div>
        </div>`;
      return;
    }
    const def = D.WIZARD[w.cat];
    const q = def.questions[w.step];
    const total = def.questions.length;
    const value = q.key in w.answers ? w.answers[q.key] : q.value;
    const input = q.unit === 'text'
      ? `<input type="text" id="wzInput" class="wizard-input" maxlength="60" placeholder="${escapeHtml(q.placeholder || '')}" value="${escapeHtml(value)}">`
      : q.unit === 'scale'
        ? `<div class="wizard-scale">${[1, 2, 3, 4, 5].map(n => `<button class="weight-dot big ${n <= value ? 'on' : ''}" data-c="wz-scale" data-w="${n}">★</button>`).join('')}</div><input type="hidden" id="wzInput" value="${value}">`
        : `<input type="number" id="wzInput" class="wizard-input num" inputmode="decimal" value="${num(value)}">
           <div class="wizard-fmt" id="wzFmt">${fmt(value, q.unit)}</div>`;
    el.innerHTML = `
      <div class="decidia-bar"><button class="decidia-back" data-c="wz-prev">← ${w.step ? 'Atrás' : 'Temas'}</button></div>
      <div class="panel decidia-wizard">
        <div class="decision-kicker">${def.emoji} ${escapeHtml(def.label)} · ${w.step + 1} de ${total}</div>
        <div class="wizard-dots">${def.questions.map((_, i) => `<span class="${i <= w.step ? 'on' : ''}"></span>`).join('')}</div>
        ${w.step === 0 ? `<div class="sub">${escapeHtml(def.intro)}</div>` : ''}
        <h2 class="wizard-q">${escapeHtml(q.label)}</h2>
        ${input}
        <button class="btn decidia-cta" data-c="wz-next">${w.step === total - 1 ? '✨ Crear escenario' : 'Siguiente'}</button>
      </div>`;
    const inp = document.getElementById('wzInput');
    if (inp && inp.type !== 'hidden'){ inp.focus(); inp.select && inp.select(); }
  }

  function wizardValue(){
    const q = D.WIZARD[wizard.cat].questions[wizard.step];
    const inp = document.getElementById('wzInput');
    wizard.answers[q.key] = q.unit === 'text' ? (inp ? inp.value : '') : num(inp ? inp.value : q.value);
  }

  // --------------------------------------------------------------- guardado
  function markDirty(){
    if (!isSaved) return;
    const s = document.getElementById('dcSaveState');
    if (s) s.textContent = 'Guardando…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 500);
  }

  async function persist(){
    clearTimeout(saveTimer);
    if (!draft) return;
    const data = clone(draft);
    try{
      if (isSaved && byId(state.decisions, draft.id)){
        await store.updateRecord(COLLECTION, draft.id, data);
      } else {
        const rec = await store.addRecord(COLLECTION, Object.assign(data, { createdAt: Date.now() }));
        draft.id = rec.id; draft.createdAt = rec.createdAt;
        isSaved = true;
      }
      const s = document.getElementById('dcSaveState');
      if (s) s.textContent = '✓ Guardado';
    }catch(e){
      console.error('DECIDIA: no se pudo guardar', e);
      ui.showToast('No se pudo guardar la decisión');
    }
  }

  /** Sale del editor; si hay una decisión nueva sin guardar, pregunta. */
  async function leave(){
    if (draft && !isSaved && !confirm('Esta decisión no está guardada. ¿Salir sin guardar?')) return false;
    if (isSaved) await persist();
    draft = null; whatIf = null;
    go('home');
    return true;
  }

  // ------------------------------------------------------------ eventos
  function bindOnce(el){
    if (bound) return;
    bound = true;
    el.addEventListener('input', onInput);
    el.addEventListener('change', onChange);
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b && el.contains(b)) onClick(b); });
  }

  function onInput(e){
    const t = e.target, f = t.dataset.f;
    if (t.id === 'dcAsk'){ homeText = t.value; return; }
    if (t.id === 'wzInput' && wizard.cat){
      const q = D.WIZARD[wizard.cat].questions[wizard.step];
      const out = document.getElementById('wzFmt');
      if (out) out.textContent = fmt(t.value, q.unit);
      return;
    }
    if (!f || !draft) return;
    const id = t.dataset.id;
    switch (f){
      case 'dec.title': draft.title = t.value; break;
      case 'dec.desc': draft.description = t.value; break;
      case 'var.value': {
        const v = byId(draft.variables, id); if (!v) return;
        v.value = num(t.value);
        // Sincroniza el deslizador con la caja numérica de la misma variable.
        const row = t.closest('.variable-row');
        row.querySelectorAll('[data-f="var.value"]').forEach(x => { if (x !== t) x.value = v.value; });
        const range = row.querySelector('input[type=range]');
        if (v.value > num(range.max)){ v.max = D.variable('', '', v.unit, v.value).max; range.max = v.max; }
        const lab = row.querySelector('[data-fmt]'); if (lab) lab.textContent = fmt(v.value, v.unit);
        updateResults(true);
        break;
      }
      case 'var.name': { const v = byId(draft.variables, id); if (v) v.name = t.value; break; }
      case 'opt.name': { const o = byId(draft.options, id); if (o) o.name = t.value; break; }
      case 'opt.emoji': { const o = byId(draft.options, id); if (o) o.emoji = t.value; break; }
      case 'opt.notes': { const o = byId(draft.options, id); if (o) o.notes = t.value; break; }
      case 'opt.aspect': {
        const o = byId(draft.options, t.dataset.opt); if (!o) return;
        o.aspects = o.aspects || {};
        if (t.value === '') delete o.aspects[id]; else o.aspects[id] = num(t.value);
        updateResults(false);
        break;
      }
      case 'item.label': case 'item.factor': {
        const it = itemOf(t); if (!it) return;
        if (f === 'item.label') it.label = t.value; else { it.factor = num(t.value); updateResults(true); }
        break;
      }
      case 'wi.value': {
        const v = byId(draft.variables, id); if (!v || !whatIf) return;
        whatIf[id] = num(t.value);
        const row = t.closest('.whatif-row');
        row.classList.toggle('is-changed', whatIf[id] !== v.value);
        row.querySelector('[data-wifmt]').textContent = fmt(whatIf[id], v.unit);
        updateResults(true);
        return;   // "¿Y si…?" no modifica la decisión: no se guarda
      }
      case 'asp.name': { const a = byId(draft.aspects, id); if (a) a.name = t.value; break; }
      case 'cmp.side': { const s = byId(draft.sides, id); if (s) s.name = t.value; updateCompare(); break; }
      case 'cmp.name': { const a = byId(draft.aspects, id); if (a) a.name = t.value; updateCompare(); break; }
      case 'cmp.val': {
        const a = byId(draft.aspects, id); if (!a) return;
        a.values[t.dataset.side] = a.unit === 'text' ? t.value : (t.value === '' ? null : num(t.value));
        updateCompare();
        break;
      }
      default: return;
    }
    markDirty();
  }

  function relabel(){
    const el = root();
    if (!el || !draft) return;
    (draft.variables || []).forEach(v => {
      el.querySelectorAll('option[value="' + CSS.escape(v.id) + '"]').forEach(o => { o.textContent = (v.emoji || '') + ' ' + v.name; });
      const wi = el.querySelector('[data-wi="' + CSS.escape(v.id) + '"] [data-wi-name]');
      if (wi) wi.textContent = (v.emoji || '') + ' ' + v.name;
    });
    (draft.options || []).forEach(o => el.querySelectorAll('[data-opt-name="' + CSS.escape(o.id) + '"]').forEach(n => { n.textContent = (o.emoji || '') + ' ' + o.name; }));
    (draft.sides || []).forEach(sd => el.querySelectorAll('[data-side-name="' + CSS.escape(sd.id) + '"]').forEach(n => { n.textContent = sd.name; }));
  }

  function itemOf(t){
    const row = t.closest('.option-item'); if (!row) return null;
    const o = byId(draft.options, row.dataset.opt);
    return o ? byId(o.items, row.dataset.item) : null;
  }

  function onChange(e){
    const t = e.target, f = t.dataset.f;
    if (!f || !draft) return;
    const id = t.dataset.id;
    switch (f){
      case 'var.unit': {
        const v = byId(draft.variables, id); if (!v) return;
        const u = D.UNITS[t.value];
        Object.assign(v, { unit: t.value, min: u.min, step: u.step, max: Math.max(u.max, v.value) });
        if (t.value === 'scale') v.value = Math.min(5, Math.max(1, Math.round(v.value)));
        renderVars(); renderWhatIf(); updateResults(false);
        break;
      }
      case 'var.base': draft.baseId = id; renderVars(); updateResults(false); break;
      case 'item.sign': case 'item.ref1': case 'item.ref2': case 'item.every': {
        const it = itemOf(t); if (!it) return;
        if (f === 'item.sign') it.sign = num(t.value) < 0 ? -1 : 1;
        if (f === 'item.every') it.every = t.value;
        if (f === 'item.ref1'){
          if (!t.value){ it.refs = []; it.factor = it.factor || 0; }
          else { it.refs = [t.value].concat(it.refs.slice(1)); it.factor = 1; }
          renderOpts();
        }
        if (f === 'item.ref2') it.refs = [it.refs[0]].concat(t.value ? [t.value] : []);
        updateResults(true);
        break;
      }
      case 'asp.unit': { const a = byId(draft.aspects, id); if (a) a.unit = t.value; renderAsps(); updateResults(false); break; }
      case 'var.name': case 'opt.name': case 'opt.emoji': case 'opt.notes': case 'item.label': case 'asp.name':
        // Los nombres se actualizan en su sitio (sin redibujar los campos, para
        // no quitarle el foco al campo que el usuario acaba de tocar).
        relabel();
        updateResults(false);
        return;
      case 'cmp.side': relabel(); updateCompare(); return;
      default: return;
    }
    markDirty();
  }

  async function onClick(b){
    const c = b.dataset.c, id = b.dataset.id;
    switch (c){
      // --- inicio
      case 'create': {
        const text = (document.getElementById('dcAsk') || {}).value || '';
        if (!text.trim()){ ui.showToast('Escribe primero qué estás intentando decidir'); document.getElementById('dcAsk').focus(); return; }
        homeText = '';
        open(D.fromText(text), false);
        ui.showToast('Escenario creado: ajusta los valores y guárdalo');
        return;
      }
      case 'wizard': wizard = { cat: null, step: 0, answers: {} }; go('wizard'); return;
      case 'compare-new': {
        const d = D.newCompareDecision({ title: '' });
        d.aspects = D.defaultAspects();
        open(d, false);
        return;
      }
      case 'open': { const d = byId(state.decisions, id); if (d) open(d, true); return; }
      case 'home': await leave(); return;

      // --- asistente
      case 'wz-cat': wizard = { cat: id, step: 0, answers: {} }; render(); return;
      case 'wz-scale': {
        const inp = document.getElementById('wzInput'); inp.value = b.dataset.w;
        b.parentElement.querySelectorAll('.weight-dot').forEach((x, i) => x.classList.toggle('on', i < num(b.dataset.w)));
        return;
      }
      case 'wz-prev':
        if (!wizard.cat) return go('home');
        if (wizard.step === 0){ wizard.cat = null; render(); return; }
        wizardValue(); wizard.step--; render(); return;
      case 'wz-next': {
        wizardValue();
        const total = D.WIZARD[wizard.cat].questions.length;
        if (wizard.step < total - 1){ wizard.step++; render(); return; }
        open(D.fromWizard(wizard.cat, wizard.answers), false);
        ui.showToast('Listo: tu decisión está armada. Revisa y guárdala.');
        return;
      }

      // --- editor de escenarios
      case 'save': await persist(); ui.showToast('Decisión guardada'); paint(); return;
      case 'duplicate': {
        const copy = clone(draft);
        delete copy.id; delete copy.updatedAt; delete copy.createdAt;
        copy.title = (copy.title || 'Decisión') + ' (copia)';
        open(copy, false);
        return;
      }
      case 'delete':
        if (!confirm('¿Eliminar "' + (draft.title || 'esta decisión') + '"?')) return;
        clearTimeout(saveTimer);
        await store.deleteRecord(COLLECTION, draft.id);
        draft = null; isSaved = false;
        ui.showToast('Decisión eliminada');
        go('home');
        return;
      case 'add-var': {
        const v = D.variable(b.dataset.name, b.dataset.emoji, b.dataset.unit, b.dataset.unit === 'money' ? 50000 : b.dataset.unit === 'scale' ? 3 : 1);
        draft.variables.push(v);
        if (!draft.baseId && b.dataset.name === 'Dinero disponible') draft.baseId = v.id;
        renderVars(); renderOpts(); renderWhatIf(); updateResults(false);
        break;
      }
      case 'del-var':
        draft.variables = draft.variables.filter(v => v.id !== id);
        if (draft.baseId === id) draft.baseId = null;
        draft.options.forEach(o => o.items.forEach(it => { if ((it.refs || []).includes(id)){ it.refs = it.refs.filter(r => r !== id); if (!it.refs.length) it.factor = 0; } }));
        if (whatIf) delete whatIf[id];
        renderVars(); renderOpts(); renderWhatIf(); updateResults(false);
        break;
      case 'add-opt': {
        const o = D.option('Opción ' + String.fromCharCode(65 + draft.options.length), '🔹');
        o.color = D.COLORS[draft.options.length % D.COLORS.length];
        draft.options.push(o);
        renderOpts(); renderAsps(); updateResults(false);
        break;
      }
      case 'del-opt':
        if (draft.options.length <= 1) return;
        draft.options = draft.options.filter(o => o.id !== id);
        renderOpts(); renderAsps(); updateResults(false);
        break;
      case 'add-item': {
        const o = byId(draft.options, id); if (!o) return;
        const ref = draft.variables.find(v => v.id !== draft.baseId);
        o.items.push(D.item('Nuevo efecto', -1, 'once', ref ? [ref.id] : [], ref ? 1 : 10000));
        renderOpts(); updateResults(true);
        break;
      }
      case 'del-item': {
        const o = byId(draft.options, b.dataset.opt); if (!o) return;
        o.items = o.items.filter(it => it.id !== id);
        renderOpts(); updateResults(true);
        break;
      }
      case 'add-asp':
        draft.aspects.push({ id: D.newId('a'), name: 'Prioridad personal', emoji: '⭐', unit: 'scale' });
        renderAsps(); updateResults(false);
        break;
      case 'del-asp':
        draft.aspects = draft.aspects.filter(a => a.id !== id);
        draft.options.forEach(o => { if (o.aspects) delete o.aspects[id]; });
        renderAsps(); updateResults(false);
        break;

      // --- ¿Y SI…? y futuro
      case 'whatif':
        whatIf = whatIf ? null : {};
        b.classList.toggle('is-on', !!whatIf);
        renderWhatIf(); updateResults(false);
        if (whatIf) document.getElementById('dcWhatIf').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      case 'wi-reset': whatIf = {}; renderWhatIf(); updateResults(true); return;
      case 'wi-apply': {
        const n = Object.keys(whatIf || {}).length;
        Object.keys(whatIf || {}).forEach(k => { const v = byId(draft.variables, k); if (v) v.value = whatIf[k]; });
        whatIf = {};
        renderVars(); renderWhatIf(); updateResults(false);
        ui.showToast(n ? 'Cambios aplicados a la decisión' : 'No hay cambios que aplicar');
        break;
      }
      case 'wi-save': {
        if (!whatIf || !Object.keys(whatIf).length){ ui.showToast('Mueve algún valor primero'); return; }
        const name = prompt('Nombre para este escenario', 'Escenario ' + ((draft.scenarios || []).length + 1));
        if (!name) return;
        draft.scenarios = (draft.scenarios || []).concat({ id: D.newId('sc'), name: name.slice(0, 30), overrides: Object.assign({}, whatIf) });
        renderWhatIf();
        break;
      }
      case 'wi-load': {
        const s = byId(draft.scenarios, id); if (!s) return;
        whatIf = Object.assign({}, s.overrides);
        renderWhatIf(); updateResults(true);
        return;
      }
      case 'wi-del': draft.scenarios = draft.scenarios.filter(s => s.id !== id); renderWhatIf(); break;
      case 'future':
        showFuture = !showFuture;
        b.classList.toggle('is-on', showFuture);
        updateResults(false);
        if (showFuture) document.getElementById('dcFuture').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      case 'horizon': horizon = id; updateResults(false); return;

      // --- comparador
      case 'cmp-add':
        draft.aspects.push({ id: D.newId('a'), name: b.dataset.name, emoji: b.dataset.emoji, unit: b.dataset.unit, weight: 3, values: {} });
        renderCompareRows(); updateCompare();
        break;
      case 'cmp-del': draft.aspects = draft.aspects.filter(a => a.id !== id); renderCompareRows(); updateCompare(); break;
      case 'cmp-weight': {
        const a = byId(draft.aspects, id); if (!a) return;
        a.weight = num(b.dataset.w);
        b.parentElement.querySelectorAll('.weight-dot').forEach((x, i) => x.classList.toggle('on', i < a.weight));
        updateCompare();
        break;
      }
      default: return;
    }
    markDirty();
  }

  /** Botón "atrás" de Android: dentro de DECIDIA vuelve al inicio del módulo. */
  function back(){
    if (view === 'home') return false;
    if (view === 'wizard'){ onClick({ dataset: { c: 'wz-prev' } }); return true; }
    leave();
    return true;
  }

  ui.views.decidia = { render, back };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
