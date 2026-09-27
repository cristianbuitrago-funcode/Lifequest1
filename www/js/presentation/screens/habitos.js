/*
 * Pestaña Hábitos: alta de hábitos, check-in diario y escalera de rachas.
 */
(function (LQ) {
  "use strict";

  const { state, store, Game, Rules, ui } = LQ;
  const { HABIT_LADDER } = LQ.config;
  const { todayStr, escapeHtml, fmtDate, addDays } = LQ.utils;

  function render(){
    const el = document.getElementById('view-habitos');
    el.innerHTML = `
      <div class="panel">
        <div class="section-head"><h2>Nuevo hábito</h2></div>
        <div class="grid2">
          <div class="field"><label for="hTitle">Título</label><input type="text" id="hTitle" placeholder="Ej: Meditar 10 minutos"></div>
          <div class="field"><label for="hCat">Categoría</label><select id="hCat">${ui.categoryOptions()}</select></div>
        </div>
        <button class="btn" id="hAddBtn">Añadir hábito</button>
      </div>
      <div class="panel" id="habitWheelPanel" hidden>
        <h2>Rueda de hábitos</h2>
        <div class="sub" id="habitWheelSub"></div>
        <div class="radar-wrap"><canvas id="habitRadar" width="340" height="300"></canvas></div>
        <div class="wheel-summary" id="habitWheelSummary"></div>
      </div>
      <div id="habitList"></div>
    `;
    document.getElementById('hAddBtn').onclick = async () => {
      const title = document.getElementById('hTitle').value.trim();
      if (!title) return;
      await store.addHabit({title, categoryId: document.getElementById('hCat').value});
      render();
    };
    renderList();
  }

  // -------------------------------------------------------------------------
  // Rueda de hábitos: constancia de los últimos 30 días
  // -------------------------------------------------------------------------
  const WINDOW = 30;

  /** Días cumplidos y días posibles (desde que existe el hábito, máx. 30). */
  function consistency(h, today){
    const log = h.log || {};
    let possible = 0, done = 0;
    for (let i = 0; i < WINDOW; i++){
      const ds = fmtDate(addDays(new Date(), -i));
      if (h.createdAt && ds < h.createdAt) break;
      possible++;
      if (log[ds]) done++;
    }
    return { done, possible: Math.max(1, possible), pct: done / Math.max(1, possible) };
  }

  function renderWheel(){
    const panel = document.getElementById('habitWheelPanel');
    if (!panel) return;
    const habits = state.habits;
    panel.hidden = !habits.length;
    if (!habits.length) return;
    const today = todayStr();
    const canvas = document.getElementById('habitRadar');
    const sub = document.getElementById('habitWheelSub');
    const summary = document.getElementById('habitWheelSummary');
    const stats = habits.map(h => Object.assign({ h }, consistency(h, today)));

    if (habits.length >= 3){
      // Un eje por hábito (máx. 8).
      const shown = stats.slice(0, 8);
      sub.textContent = 'Qué tan constante eres con cada hábito (últimos ' + WINDOW + ' días)';
      ui.drawRadar(canvas, shown.map(x => x.h.title), shown.map(x => x.pct),
        { suffixes: shown.map(x => Math.round(x.pct * 100) + ' %'), radius: 88, maxLabel: 16 });
    } else {
      // Con 1 o 2 hábitos la rueda se arma por categoría.
      const cats = state.settings.categories;
      const days = cats.map(c => stats.filter(x => x.h.categoryId === c.id).reduce((s, x) => s + x.done, 0));
      const max = Math.max(1, ...days);
      sub.textContent = 'Días cumplidos por categoría (últimos ' + WINDOW + ' días). Con 3 hábitos o más verás uno por eje.';
      ui.drawRadar(canvas, cats.map(c => c.name), days.map(d => d / max));
    }

    const best = stats.slice().sort((a, b) => b.pct - a.pct)[0];
    const worst = stats.slice().sort((a, b) => a.pct - b.pct)[0];
    const avg = Math.round(stats.reduce((s, x) => s + x.pct, 0) / stats.length * 100);
    summary.innerHTML = `
      <div class="money-chip ok">Promedio<b class="num">${avg} %</b></div>
      <div class="money-chip">Mejor<b>${escapeHtml(best.h.title)}</b></div>
      ${habits.length > 1 && worst.h !== best.h ? `<div class="money-chip soon">A mejorar<b>${escapeHtml(worst.h.title)}</b></div>` : ''}`;
  }

  function renderList(){
    renderWheel();
    const box = document.getElementById('habitList');
    if (!box) return;
    if (!state.habits.length){ box.innerHTML = '<div class="panel"><div class="empty">Aún no tienes hábitos. Crea uno arriba.</div></div>'; return; }
    const today = todayStr();
    box.innerHTML = state.habits.map(h => {
      const info = Rules.habitStreakInfo(h.log||{});
      const doneToday = !!(h.log||{})[today];
      const ladderHtml = HABIT_LADDER.map(t => `
        <div class="ladder-tier ${info.streak>=t.days?'done':''}">
          <div class="ladder-dot"></div>
          <div class="ladder-text"><b>${t.label}</b> · ${t.days} días seguidos → +${t.reward} 🪙</div>
        </div>`).join('');
      return `
      <div class="panel">
        <div class="section-head">
          <h2 style="color:${ui.catColor(h.categoryId)}">${escapeHtml(h.title)}</h2>
          <button class="icon-btn" data-action="delete-habit" data-id="${escapeHtml(h.id)}" aria-label="Eliminar">${ui.svgTrash()}</button>
        </div>
        <div class="sub">${escapeHtml(ui.catName(h.categoryId))} · racha actual: <b class="num">${info.streak}</b> días</div>
        <button class="btn ${doneToday?'ghost':''}" data-action="habit-check-in" data-id="${escapeHtml(h.id)}">${doneToday ? '✓ Hecho hoy (toca para deshacer)' : 'Marcar hoy'}</button>
        <div class="ladder">${ladderHtml}</div>
      </div>`;
    }).join('');
  }

  ui.actions['habit-check-in'] = async (id) => {
    const r = await Game.habitCheckIn(id);
    if (r && r.bonus > 0){ ui.sound.play('long'); ui.showToast('¡Racha de hábito! +' + r.bonus + ' 🪙'); }
    else if (r && r.streak > 0) ui.sound.play('short');
    ui.renderAll();
  };
  ui.actions['delete-habit'] = async (id) => { await store.deleteHabit(id); renderList(); };

  ui.views.habitos = { render, renderList };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
