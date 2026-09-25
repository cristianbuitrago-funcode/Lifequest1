/*
 * Pestaña Hábitos: alta de hábitos, check-in diario y escalera de rachas.
 */
(function (LQ) {
  "use strict";

  const { state, store, Game, Rules, ui } = LQ;
  const { HABIT_LADDER } = LQ.config;
  const { todayStr, escapeHtml } = LQ.utils;

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

  function renderList(){
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
    if (r && r.bonus > 0) ui.showToast('¡Racha de hábito! +' + r.bonus + ' 🪙');
    ui.renderAll();
  };
  ui.actions['delete-habit'] = async (id) => { await store.deleteHabit(id); renderList(); };

  ui.views.habitos = { render, renderList };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
