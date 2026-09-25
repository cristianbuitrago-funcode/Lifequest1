/*
 * Pestaña Misiones: alta de misiones y lista de activas.
 */
(function (LQ) {
  "use strict";

  const { state, store, Game, Rules, ui } = LQ;
  const { DIFF_LABELS } = LQ.config;
  const { todayStr, escapeHtml } = LQ.utils;

  function render(){
    const el = document.getElementById('view-misiones');
    const rt = state.settings.rewardTable;
    el.innerHTML = `
      <div class="panel">
        <div class="section-head"><h2>Nueva misión</h2></div>
        <div class="grid2">
          <div class="field"><label for="qTitle">Título</label><input type="text" id="qTitle" placeholder="Ej: Hacer ejercicio 20 min"></div>
          <div class="field"><label for="qCat">Categoría</label><select id="qCat">${ui.categoryOptions()}</select></div>
          <div class="field"><label for="qDiff">Dificultad</label><select id="qDiff">
            <option value="facil">Fácil (+${rt.facil.xp} XP)</option>
            <option value="media">Media (+${rt.media.xp} XP)</option>
            <option value="dificil">Difícil (+${rt.dificil.xp} XP)</option>
            <option value="epica">Épica (+${rt.epica.xp} XP)</option>
          </select></div>
          <div class="field"><label for="qRec">Repetición</label><select id="qRec"><option value="diaria">Diaria</option><option value="unica">Única vez</option></select></div>
        </div>
        <button class="btn" id="qAddBtn">Añadir misión</button>
      </div>
      <div class="panel">
        <h2>Misiones activas</h2>
        <div class="sub">Toca el círculo al completarla</div>
        <div id="questList"></div>
      </div>
    `;
    document.getElementById('qAddBtn').onclick = async () => {
      const title = document.getElementById('qTitle').value.trim();
      if (!title) return;
      await store.addQuest({
        title,
        categoryId: document.getElementById('qCat').value,
        difficulty: document.getElementById('qDiff').value,
        recurrence: document.getElementById('qRec').value
      });
      render();
    };
    renderList();
  }

  function renderList(){
    const box = document.getElementById('questList');
    if (!box) return;
    const active = state.quests.filter(q=>q.active);
    if (!active.length){ box.innerHTML = '<div class="empty">No tienes misiones activas. Añade una arriba.</div>'; return; }
    const today = todayStr();
    box.innerHTML = active.map(q => {
      const doneToday = q.recurrence==='diaria' && q.lastCompletedDate===today;
      const r = Rules.reward(q.difficulty, state.settings);
      const color = ui.catColor(q.categoryId);
      return `
      <div class="quest-item">
        <button class="quest-check" aria-label="Completar" style="${doneToday?('background:'+color+';color:#fff;border-color:'+color+';'):''}" data-action="complete-quest" data-id="${escapeHtml(q.id)}" ${doneToday?'disabled':''}>
          ${doneToday ? ui.svgCheck().replace('<svg ', '<svg style="opacity:1" ') : ''}
        </button>
        <div class="quest-main">
          <div class="quest-title">${escapeHtml(q.title)}</div>
          <div class="quest-meta">
            <span class="tag" style="color:${color}"><span class="cat-swatch" style="background:${color}"></span>${escapeHtml(ui.catName(q.categoryId))}</span>
            <span class="tag diff-${escapeHtml(q.difficulty)}">${DIFF_LABELS[q.difficulty] || ''}</span>
            <span class="tag">${q.recurrence==='diaria'?'Diaria':'Única'}</span>
          </div>
        </div>
        <div class="quest-reward">+${r.xp} XP<br>+${r.coins} 🪙</div>
        <button class="icon-btn" data-action="delete-quest" data-id="${escapeHtml(q.id)}" aria-label="Eliminar">${ui.svgTrash()}</button>
      </div>`;
    }).join('');
  }

  ui.actions['complete-quest'] = async (id) => {
    const r = await Game.completeQuest(id);
    if (!r) return;
    ui.showToast('+' + r.xp + ' XP · +' + r.coins + ' 🪙 — "' + r.title + '"');
    ui.renderAll();
  };
  ui.actions['delete-quest'] = async (id) => { await store.deleteQuest(id); renderList(); };

  ui.views.misiones = { render, renderList };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
