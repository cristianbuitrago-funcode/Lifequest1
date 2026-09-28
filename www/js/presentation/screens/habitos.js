/*
 * Pestaña Hábitos: Rastreador de hábitos del mes (cuadrícula hábito × día,
 * gráfico de hábitos, escalera de recompensas y reflexión), alta de hábitos,
 * check-in diario y escalera de rachas de cada hábito.
 */
(function (LQ) {
  "use strict";

  const { state, store, Game, Rules, ui } = LQ;
  const E = LQ.Evolution;
  const { HABIT_LADDER } = LQ.config;
  const { todayStr, escapeHtml } = LQ.utils;

  let month = E.monthKey();          // mes que se está viendo
  let saveTimer = null;

  function render(){
    const el = document.getElementById('view-habitos');
    el.innerHTML = `
      <div class="tracker-head">
        <h2 class="tracker-title">Rastreador de hábitos</h2>
        <div class="month-nav">
          <button class="icon-btn" id="trkPrev" aria-label="Mes anterior">‹</button>
          <span id="trkMonth"></span>
          <button class="icon-btn" id="trkNext" aria-label="Mes siguiente">›</button>
        </div>
      </div>
      <div id="habitTracker"></div>
      <div class="panel">
        <div class="section-head"><h2>Nuevo hábito</h2></div>
        <div class="grid2">
          <div class="field"><label for="hTitle">Título</label><input type="text" id="hTitle" placeholder="Ej: Meditar 10 minutos"></div>
          <div class="field"><label for="hCat">Categoría</label><select id="hCat">${ui.categoryOptions()}</select></div>
        </div>
        <button class="btn" id="hAddBtn">Añadir hábito</button>
      </div>
      <div class="panel">
        <div class="section-head"><h2>Reflexión del mes</h2></div>
        <div class="sub">¿Qué te funcionó este mes y qué vas a cambiar el próximo?</div>
        <textarea id="trkReflection" rows="3" maxlength="600" placeholder="Escribe aquí tu reflexión…"></textarea>
      </div>
      <div id="habitList"></div>
      <div class="tracker-motto">Misión del mes: progreso visible, recompensa conquistada.</div>
    `;
    document.getElementById('hAddBtn').onclick = async () => {
      const title = document.getElementById('hTitle').value.trim();
      if (!title) return;
      await store.addHabit({title, categoryId: document.getElementById('hCat').value});
      render();
    };
    document.getElementById('trkPrev').onclick = () => { month = E.shiftMonth(month, -1); renderReflection(); renderList(); };
    document.getElementById('trkNext').onclick = () => {
      if (month >= E.monthKey()) return;
      month = E.shiftMonth(month, 1); renderReflection(); renderList();
    };
    document.getElementById('trkReflection').oninput = (e) => {
      notesFor(month).reflection = e.target.value;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => store.saveSettings(), 600);
    };
    renderReflection();
    renderList();
  }

  /** Notas del mes (premios, cobros y reflexión) guardadas en los ajustes. */
  function notesFor(key){
    const all = state.settings.habitMonths || (state.settings.habitMonths = {});
    if (!all[key]) all[key] = E.monthNotes(state.settings, key);
    return all[key];
  }

  function renderReflection(){
    const ta = document.getElementById('trkReflection');
    if (ta && document.activeElement !== ta) ta.value = E.monthNotes(state.settings, month).reflection;
  }

  // -------------------------------------------------------------------------
  // Rastreador del mes
  // -------------------------------------------------------------------------
  function renderTracker(){
    const box = document.getElementById('habitTracker');
    if (!box) return;
    const label = document.getElementById('trkMonth');
    if (label) label.textContent = E.monthLabel(month);
    const next = document.getElementById('trkNext');
    if (next) next.disabled = month >= E.monthKey();

    const t = E.tracker(state, month);
    const today = todayStr();
    const isCurrent = month === E.monthKey();
    const todayIdx = isCurrent ? Number(today.slice(8)) - 1 : -1;
    const days = Array.from({ length: t.days }, (_, i) => i + 1);

    const grid = t.rows.length ? `
      <div class="tracker-scroll" id="trkScroll">
        <table class="tracker-grid">
          <thead><tr><th class="tracker-name">Hábito</th>${days.map((d, i) => `<th class="${i === todayIdx ? 'is-today' : ''}">${d}</th>`).join('')}<th class="tracker-sum">Total</th></tr></thead>
          <tbody>${t.rows.map(r => `
            <tr style="--hab:${ui.catColor(r.habit.categoryId)}">
              <th class="tracker-name" scope="row">${escapeHtml(r.habit.title)}</th>
              ${r.cells.map((on, i) => i === todayIdx
                ? `<td class="is-today"><button class="tracker-cell ${on ? 'on' : ''}" data-action="habit-check-in" data-id="${escapeHtml(r.habit.id)}" aria-label="${on ? 'Hecho hoy: toca para deshacer' : 'Marcar hoy'}: ${escapeHtml(r.habit.title)}">${on ? '✓' : ''}</button></td>`
                : `<td><span class="tracker-cell ${on ? 'on' : ''} ${i > todayIdx && isCurrent ? 'future' : ''}">${on ? '✓' : ''}</span></td>`).join('')}
              <td class="tracker-sum num">${r.done}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="hint">${isCurrent ? 'Toca la casilla de hoy (resaltada) para marcar o desmarcar un hábito.' : 'Así terminó ' + E.monthLabel(month) + '.'}</div>`
      : '<div class="empty">Crea tu primer hábito abajo y aparecerá aquí, con una casilla por cada día del mes.</div>';

    // Gráfico: cuántos hábitos se hicieron cada día.
    const maxY = t.maxPerDay;
    const chart = `
      <div class="habit-chart" role="img" aria-label="Hábitos hechos por día">
        <div class="habit-chart-y">${Array.from({ length: maxY + 1 }, (_, i) => `<span>${maxY - i}</span>`).join('')}</div>
        <div class="habit-chart-bars" style="--days:${t.days}">
          ${t.perDay.map((n, i) => `<div class="habit-bar ${i === todayIdx ? 'is-today' : ''}" title="Día ${i + 1}: ${n}"><i style="height:${Math.round(n / maxY * 100)}%"></i><em>${i + 1}</em></div>`).join('')}
        </div>
      </div>`;

    // Escalera de recompensas: 1 hábito hecho = 1 bloque; marcos 20 / 40 / 60.
    const l = E.ladder(state.settings, month, t.total);
    let prev = 0;
    const ladder = l.milestones.map(m => {
      const from = prev; prev = m.at;
      const blocks = Array.from({ length: m.at - from }, (_, i) => `<i class="${from + i < l.filled ? 'on' : ''}"></i>`).join('');
      const status = m.claimedAt ? '<span class="reward-state done">✓ Cobrada</span>'
        : m.reached ? `<button class="btn small" data-claim="${m.at}">🎁 Cobrar</button>`
        : `<span class="reward-state">Faltan ${m.at - t.total}</span>`;
      return `
        <div class="reward-step ${m.reached ? 'reached' : ''} ${m.claimedAt ? 'claimed' : ''}">
          <div class="reward-top"><b>Recompensa ${m.index + 1} · marco ${m.at}</b>${status}</div>
          <div class="reward-blocks">${blocks}</div>
          <input type="text" class="reward-input" data-reward="${m.index}" maxlength="60" value="${escapeHtml(m.reward)}" placeholder="Escribe el premio que quieres cobrar" aria-label="Premio del marco ${m.at}">
        </div>`;
    }).reverse().join('');

    box.innerHTML = `
      <div class="panel">
        <div class="section-head"><h2>Hábitos del mes</h2></div>
        ${grid}
      </div>
      ${t.rows.length ? `
      <div class="panel">
        <div class="section-head"><h2>Gráfico de hábitos</h2><span class="tag num">${t.total} hechos</span></div>
        <div class="sub">Cuántos hábitos cumpliste cada día. Cada uno suma un bloque a tu escalera.</div>
        ${chart}
      </div>
      <div class="panel">
        <div class="section-head"><h2>Escalera de recompensas</h2><span class="tag num">${Math.min(t.total, l.top)} / ${l.top}</span></div>
        <div class="sub">Cada hábito cumplido = 1 bloque. Al llegar a un marco, cobra el premio que tú elegiste.</div>
        <div class="reward-ladder">${ladder}</div>
      </div>` : ''}`;

    // Deja visible el día de hoy en la cuadrícula.
    const scroll = document.getElementById('trkScroll');
    const cell = scroll && scroll.querySelector('th.is-today');
    if (cell) scroll.scrollLeft = Math.max(0, cell.offsetLeft - scroll.clientWidth / 2);

    box.querySelectorAll('[data-reward]').forEach(inp => {
      inp.oninput = () => {
        const n = notesFor(month);
        n.rewards = n.rewards || ['', '', ''];
        n.rewards[Number(inp.dataset.reward)] = inp.value;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => store.saveSettings(), 600);
      };
    });
    box.querySelectorAll('[data-claim]').forEach(btn => {
      btn.onclick = async () => {
        const at = Number(btn.dataset.claim);
        const n = notesFor(month);
        n.claimed = Object.assign({}, n.claimed, { [at]: Date.now() });
        await store.saveSettings();
        const m = E.ladder(state.settings, month, t.total).milestones.find(x => x.at === at);
        ui.sound && ui.sound.play && ui.sound.play('long');
        ui.celebrate({ icon: '🎁', title: '¡Recompensa conquistada!',
          message: m && m.reward ? 'Te ganaste: ' + m.reward : 'Llegaste al marco ' + at + '. ¡Date tu premio!' });
        renderTracker();
      };
    });
  }

  // -------------------------------------------------------------------------
  // Tarjetas de cada hábito (racha y escalera de monedas)
  // -------------------------------------------------------------------------
  function renderList(){
    renderTracker();
    const box = document.getElementById('habitList');
    if (!box) return;
    if (!state.habits.length){ box.innerHTML = ''; return; }
    const today = todayStr();
    box.innerHTML = '<h2 class="tracker-subtitle">Tus hábitos</h2>' + state.habits.map(h => {
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
  ui.actions['delete-habit'] = async (id) => {
    const h = state.habits.find(x => x.id === id);
    if (h && !confirm('¿Eliminar "' + h.title + '"? Se borra también su historial del rastreador.')) return;
    await store.deleteHabit(id); renderList();
  };

  ui.views.habitos = { render, renderList };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
