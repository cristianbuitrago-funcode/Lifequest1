/*
 * Pestaña Resumen: estadísticas del mes, Mapa de evolución (hasta 6 pilares
 * con meta, hecho y nivel 1–10), historial y actividad.
 */
(function (LQ) {
  "use strict";

  const { state, store, ui } = LQ;
  const E = LQ.Evolution;
  const { todayStr, fmtDate, addDays, escapeHtml } = LQ.utils;

  let evoMonth = E.monthKey();

  function render(){
    const el = document.getElementById('view-resumen');
    const today = todayStr();
    const monthPrefix = today.slice(0,7);
    const monthCompletions = state.completions.filter(c=>c.date && c.date.slice(0,7)===monthPrefix);
    const monthXp = monthCompletions.reduce((s,c)=>s+(c.xp||0),0);
    const monthQuests = monthCompletions.length;
    const activeDaily = state.quests.filter(q=>q.recurrence==='diaria' && q.active).length;

    el.innerHTML = `
      <div class="stat-tiles">
        <div class="stat-tile"><div class="v num">${monthXp}</div><div class="l">XP este mes</div></div>
        <div class="stat-tile"><div class="v num">${monthQuests}</div><div class="l">Misiones cumplidas</div></div>
        <div class="stat-tile"><div class="v num">${activeDaily}</div><div class="l">Misiones diarias activas</div></div>
      </div>
      <div class="panel" id="evoPanel"></div>
      <div class="panel">
        <h2>Historial de 28 días</h2>
        <div class="sub">Misiones cumplidas por día</div>
        <div class="cal-grid" id="calGrid"></div>
      </div>
      <div class="panel">
        <h2>Actividad reciente</h2>
        <div id="recentList"></div>
      </div>
    `;
    renderEvolution();
    renderHistoryGrid();
    renderRecentList();
  }

  // -------------------------------------------------------------------------
  // Mapa de evolución
  // -------------------------------------------------------------------------
  function renderEvolution(){
    const box = document.getElementById('evoPanel');
    if (!box) return;
    const current = evoMonth === E.monthKey();
    const pillars = E.evolution(state, evoMonth);
    // La rueda necesita al menos 3 ejes: se completan con pilares vacíos.
    const axes = pillars.concat(Array.from({ length: Math.max(0, 3 - pillars.length) }, (_, i) => ({ name: 'Pilar ' + (pillars.length + i + 1), level: 0, color: '' })));
    box.innerHTML = `
      <div class="section-head">
        <h2>Mapa de evolución</h2>
        <div class="month-nav">
          <button class="icon-btn" data-evo-month="-1" aria-label="Mes anterior">‹</button>
          <span>${escapeHtml(E.monthLabel(evoMonth))}</span>
          <button class="icon-btn" data-evo-month="1" aria-label="Mes siguiente" ${current ? 'disabled' : ''}>›</button>
        </div>
      </div>
      <div class="sub">Hacia qué áreas de tu vida va tu energía. Cuanto más lejos del centro, mayor el avance en ese pilar.</div>
      <div class="radar-wrap"><canvas id="radarCanvas" width="340" height="310"></canvas></div>
      <div class="evo-table" role="table" aria-label="Pilares del mes">
        <div class="evo-row evo-headrow" role="row"><span role="columnheader">Pilar</span><span role="columnheader">Meta</span><span role="columnheader">Hecho</span><span role="columnheader">Nivel</span></div>
        ${pillars.map(p => `
          <div class="evo-row" role="row" style="--pil:${escapeHtml(p.color)}">
            <span class="evo-name" role="cell"><i class="evo-dot"></i><span><b>${escapeHtml(p.name)}</b><small>${escapeHtml(E.sourceLabel(p, state))}</small></span></span>
            <span class="num" role="cell">${p.meta}</span>
            <span class="evo-done" role="cell">${!p.auto && current
              ? `<button class="evo-step" data-evo-add="${escapeHtml(p.id)}" data-d="-1" aria-label="Restar a ${escapeHtml(p.name)}">−</button><b class="num">${p.done}</b><button class="evo-step" data-evo-add="${escapeHtml(p.id)}" data-d="1" aria-label="Sumar a ${escapeHtml(p.name)}">+</button>`
              : `<b class="num">${p.done}</b>`}</span>
            <span class="evo-level" role="cell"><b class="num">${p.level}</b><i><em style="width:${p.level * 10}%"></em></i></span>
          </div>`).join('')}
      </div>
      <button class="btn ghost small" id="evoEdit" style="margin-top:12px">✏️ Elegir mis pilares</button>
      <div class="hint">Nivel = lo hecho frente a tu meta del mes, de 1 a 10. Los pilares ligados a un hábito o a una categoría se llenan solos.</div>`;
    ui.drawRadar(document.getElementById('radarCanvas'), axes.map(p => p.name), axes.map(p => (p.level || 0) / 10),
      { rings: 10, ringLabels: true, colors: axes.map(p => p.color || ''), suffixes: axes.map(p => p.color ? 'nivel ' + p.level : ''), radius: 96, maxLabel: 14 });

    box.querySelectorAll('[data-evo-month]').forEach(b => b.onclick = () => {
      const next = E.shiftMonth(evoMonth, Number(b.dataset.evoMonth));
      if (next > E.monthKey()) return;
      evoMonth = next; renderEvolution();
    });
    box.querySelectorAll('[data-evo-add]').forEach(b => b.onclick = async () => {
      const evo = state.settings.evolution;
      evo.manual = evo.manual || {};
      const m = evo.manual[evoMonth] = Object.assign({}, evo.manual[evoMonth]);
      m[b.dataset.evoAdd] = Math.max(0, (Number(m[b.dataset.evoAdd]) || 0) + Number(b.dataset.d));
      await store.saveSettings();
      renderEvolution();
    });
    document.getElementById('evoEdit').onclick = editPillars;
  }

  /** Editor de pilares: hasta 6, con color, nombre, de dónde sale lo "hecho" y meta mensual. */
  function editPillars(){
    let rows = E.pillarsOf(state.settings).map(p => Object.assign({}, p, { source: Object.assign({}, p.source) }));
    const sourceOptions = (sel) => {
      const v = sel.type === 'manual' ? 'manual' : sel.type + ':' + sel.id;
      const opt = (val, label) => `<option value="${escapeHtml(val)}" ${val === v ? 'selected' : ''}>${escapeHtml(label)}</option>`;
      return opt('manual', '✍️ Lo cuento yo') +
        (state.habits.length ? `<optgroup label="Días de un hábito">${state.habits.map(h => opt('habit:' + h.id, '🔁 ' + h.title)).join('')}</optgroup>` : '') +
        `<optgroup label="Misiones de una categoría">${LQ.Family.visibleCategories(state.settings).map(c => opt('category:' + c.id, '⚔️ ' + c.name)).join('')}</optgroup>`;
    };
    ui.openModal('Tus pilares', (body, close) => {
      const draw = () => {
        body.innerHTML = `
          <div class="sub">Elige hasta ${E.MAX_PILLARS} áreas (ej.: entreno, lectura, sueño, ingresos extra), su meta del mes y de dónde sale lo hecho.</div>
          ${rows.map((p, i) => `
            <div class="pillar-edit" data-i="${i}">
              <input type="color" data-k="color" value="${escapeHtml(p.color || E.COLORS[i % E.COLORS.length])}" aria-label="Color">
              <input type="text" data-k="name" value="${escapeHtml(p.name)}" maxlength="24" placeholder="Pilar ${i + 1}" aria-label="Nombre del pilar">
              <button class="icon-btn" data-del="${i}" aria-label="Quitar pilar">${ui.svgTrash()}</button>
              <select data-k="source" aria-label="De dónde sale lo hecho">${sourceOptions(p.source || { type: 'manual' })}</select>
              <label class="pillar-meta">Meta del mes <input type="number" data-k="meta" min="1" max="999" value="${Number(p.meta) || 10}" inputmode="numeric"></label>
            </div>`).join('')}
          ${rows.length < E.MAX_PILLARS ? '<button class="btn ghost small" id="pilAdd">+ Añadir pilar</button>' : ''}
          <div class="row" style="margin-top:14px"><button class="btn" id="pilSave">Guardar</button></div>`;
        body.querySelectorAll('.pillar-edit').forEach(row => {
          const i = Number(row.dataset.i);
          row.querySelectorAll('[data-k]').forEach(inp => inp.oninput = () => {
            const k = inp.dataset.k;
            if (k === 'source'){
              const [type, id] = inp.value.split(':');
              rows[i].source = type === 'manual' ? { type: 'manual' } : { type, id };
            } else rows[i][k] = k === 'meta' ? Math.max(1, parseInt(inp.value, 10) || 1) : inp.value;
          });
        });
        body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { rows.splice(Number(b.dataset.del), 1); draw(); });
        const add = body.querySelector('#pilAdd');
        if (add) add.onclick = () => {
          rows.push({ id: 'p' + Date.now().toString(36), name: '', color: E.COLORS[rows.length % E.COLORS.length], source: { type: 'manual' }, meta: 10 });
          draw();
        };
        body.querySelector('#pilSave').onclick = async () => {
          state.settings.evolution.pillars = rows
            .map((p, i) => Object.assign({}, p, { name: String(p.name || '').trim() || 'Pilar ' + (i + 1) }))
            .slice(0, E.MAX_PILLARS);
          await store.saveSettings();
          close();
          renderEvolution();
          ui.showToast('Pilares guardados');
        };
      };
      draw();
    });
  }

  function renderHistoryGrid(){
    const grid = document.getElementById('calGrid');
    if (!grid) return;
    const today = todayStr();
    let html = '';
    for (let i=27;i>=0;i--){
      const d = addDays(new Date(), -i);
      const ds = fmtDate(d);
      const count = state.completions.filter(c=>c.date===ds).length;
      const cls = count>0 ? 'pos' : '';
      const todayCls = ds===today ? 'today' : '';
      html += `<div class="cal-day ${cls} ${todayCls}"><div class="d">${d.getDate()}</div><div class="v">${count>0?count:'·'}</div></div>`;
    }
    grid.innerHTML = html;
  }

  function renderRecentList(){
    const box = document.getElementById('recentList');
    if (!box) return;
    const items = state.completions.slice(0,8);
    if (!items.length){ box.innerHTML = '<div class="empty">Aún no has completado misiones.</div>'; return; }
    box.innerHTML = items.map(c => `
      <div class="quest-item">
        <div class="quest-check" style="color:${ui.catColor(c.categoryId)}">${ui.svgCheck()}</div>
        <div class="quest-main">
          <div class="quest-title">${escapeHtml(c.questTitle||'')}</div>
          <div class="quest-meta"><span class="tag">${escapeHtml(ui.catName(c.categoryId))}</span><span class="tag">${escapeHtml(c.date)}</span></div>
        </div>
        <div class="quest-reward">+${c.xp} XP<br>+${c.coins} 🪙</div>
      </div>
    `).join('');
    box.querySelectorAll('.quest-check svg').forEach(s=>s.style.opacity=1);
  }

  ui.views.resumen = { render };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
