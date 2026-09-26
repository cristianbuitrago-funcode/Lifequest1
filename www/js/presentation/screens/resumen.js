/*
 * Pestaña Resumen: estadísticas del mes, radar de pilares, historial y actividad.
 */
(function (LQ) {
  "use strict";

  const { state, ui } = LQ;
  const { todayStr, fmtDate, addDays, escapeHtml } = LQ.utils;

  function render(){
    const el = document.getElementById('view-resumen');
    const today = todayStr();
    const monthPrefix = today.slice(0,7);
    const monthCompletions = state.completions.filter(c=>c.date && c.date.slice(0,7)===monthPrefix);
    const monthXp = monthCompletions.reduce((s,c)=>s+(c.xp||0),0);
    const monthQuests = monthCompletions.length;
    const activeDaily = state.quests.filter(q=>q.recurrence==='diaria' && q.active).length;

    const cats = state.settings.categories;
    const totals = cats.map(c => monthCompletions.filter(x=>x.categoryId===c.id).reduce((s,x)=>s+(x.xp||0),0));
    const max = Math.max(1, ...totals);

    el.innerHTML = `
      <div class="stat-tiles">
        <div class="stat-tile"><div class="v num">${monthXp}</div><div class="l">XP este mes</div></div>
        <div class="stat-tile"><div class="v num">${monthQuests}</div><div class="l">Misiones cumplidas</div></div>
        <div class="stat-tile"><div class="v num">${activeDaily}</div><div class="l">Misiones diarias activas</div></div>
      </div>
      <div class="panel">
        <h2>Mapa de pilares</h2>
        <div class="sub">XP ganada este mes por categoría</div>
        <div class="radar-wrap"><canvas id="radarCanvas" width="320" height="300"></canvas></div>
      </div>
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
    drawRadar(cats, totals, max);
    renderHistoryGrid();
    renderRecentList();
  }

  function drawRadar(cats, totals, max){
    const canvas = document.getElementById('radarCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width/2, cy = canvas.height/2 + 6, R = 108;
    const n = cats.length;
    const styles = getComputedStyle(document.documentElement);
    const lineColor = styles.getPropertyValue('--line').trim();
    const muted = styles.getPropertyValue('--muted').trim();
    const accent = styles.getPropertyValue('--accent').trim();
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if (!n) return;

    // rings
    for (let ring=1; ring<=4; ring++){
      ctx.beginPath();
      for (let i=0;i<=n;i++){
        const a = (Math.PI*2*i/n) - Math.PI/2;
        const r = R*ring/4;
        const x = cx + Math.cos(a)*r, y = cy + Math.sin(a)*r;
        i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
      }
      ctx.strokeStyle = lineColor; ctx.lineWidth = 1; ctx.stroke();
    }
    // axes + labels
    ctx.fillStyle = muted; ctx.font = '11px Manrope, sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    for (let i=0;i<n;i++){
      const a = (Math.PI*2*i/n) - Math.PI/2;
      const x = cx + Math.cos(a)*R, y = cy + Math.sin(a)*R;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(x,y); ctx.strokeStyle=lineColor; ctx.stroke();
      const lx = cx + Math.cos(a)*(R+22), ly = cy + Math.sin(a)*(R+22);
      ctx.fillText(cats[i].name, lx, ly);
    }
    // data polygon
    ctx.beginPath();
    for (let i=0;i<=n;i++){
      const idx = i % n;
      const a = (Math.PI*2*idx/n) - Math.PI/2;
      const v = totals[idx]/max;
      const r = R*Math.max(0.04, v);
      const x = cx + Math.cos(a)*r, y = cy + Math.sin(a)*r;
      i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    }
    ctx.closePath();
    ctx.fillStyle = accent + '33';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();
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
