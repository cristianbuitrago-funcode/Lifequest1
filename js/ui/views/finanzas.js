/*
 * Pestaña Finanzas: resumen del mes, registro de movimientos y calendario de saldo.
 */
(function (LQ) {
  "use strict";

  const { state, store, ui } = LQ;
  const { todayStr, escapeHtml } = LQ.utils;

  function render(){
    const el = document.getElementById('view-finanzas');
    const today = todayStr();
    const monthPrefix = today.slice(0,7);
    const monthTx = state.finance.filter(f=>f.date && f.date.slice(0,7)===monthPrefix);
    const income = monthTx.filter(f=>f.type==='ingreso').reduce((s,f)=>s+f.amount,0);
    const expense = monthTx.filter(f=>f.type==='gasto').reduce((s,f)=>s+f.amount,0);
    const balance = state.finance.reduce((s,f)=> s + (f.type==='ingreso'?f.amount:-f.amount), 0);

    el.innerHTML = `
      <div class="stat-tiles">
        <div class="stat-tile pos"><div class="v num">$${income.toLocaleString()}</div><div class="l">Ingresos del mes</div></div>
        <div class="stat-tile neg"><div class="v num">$${expense.toLocaleString()}</div><div class="l">Gastos del mes</div></div>
        <div class="stat-tile"><div class="v num">$${balance.toLocaleString()}</div><div class="l">Saldo total</div></div>
      </div>
      <div class="panel">
        <h2>Registrar movimiento</h2>
        <div class="grid2">
          <div class="field"><label for="fType">Tipo</label><select id="fType"><option value="gasto">Gasto</option><option value="ingreso">Ingreso</option></select></div>
          <div class="field"><label for="fAmount">Monto</label><input type="number" id="fAmount" min="0" step="0.01" placeholder="0"></div>
          <div class="field"><label for="fCat">Categoría</label><select id="fCat">${ui.categoryOptions()}</select></div>
          <div class="field"><label for="fDate">Fecha</label><input type="date" id="fDate" value="${today}"></div>
        </div>
        <div class="field"><label for="fNote">Nota (opcional)</label><input type="text" id="fNote" placeholder="Ej: Mercado de la semana"></div>
        <button class="btn" id="fAddBtn">Guardar movimiento</button>
      </div>
      <div class="panel">
        <h2>Calendario de saldo — ${monthPrefix}</h2>
        <div class="sub">Verde: día con ingresos netos · Rojo: día con gastos netos</div>
        <div class="cal-grid" id="finCalGrid"></div>
      </div>
      <div class="panel">
        <h2>Movimientos recientes</h2>
        <div id="finList"></div>
      </div>
    `;
    document.getElementById('fAddBtn').onclick = async () => {
      const amount = parseFloat(document.getElementById('fAmount').value);
      if (!amount || amount<=0) return;
      await store.addFinance({
        type: document.getElementById('fType').value,
        amount,
        categoryId: document.getElementById('fCat').value,
        note: document.getElementById('fNote').value.trim(),
        date: document.getElementById('fDate').value || today
      });
      render();
    };
    renderCalendar(monthPrefix);
    renderList();
  }

  function renderCalendar(monthPrefix){
    const grid = document.getElementById('finCalGrid');
    if (!grid) return;
    const today = todayStr();
    const [y,m] = monthPrefix.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    let html = '';
    for (let day=1; day<=daysInMonth; day++){
      const ds = monthPrefix + '-' + String(day).padStart(2,'0');
      const net = state.finance.filter(f=>f.date===ds).reduce((s,f)=> s + (f.type==='ingreso'?f.amount:-f.amount), 0);
      const cls = net>0 ? 'pos' : (net<0 ? 'neg' : '');
      const todayCls = ds===today ? 'today' : '';
      html += `<div class="cal-day ${cls} ${todayCls}"><div class="d">${day}</div><div class="v">${net!==0 ? (net>0?'+':'') + net.toLocaleString() : '·'}</div></div>`;
    }
    grid.innerHTML = html;
  }

  function renderList(){
    const box = document.getElementById('finList');
    if (!box) return;
    const items = state.finance.slice(0,10);
    if (!items.length){ box.innerHTML = '<div class="empty">Aún no hay movimientos.</div>'; return; }
    box.innerHTML = items.map(f => `
      <div class="fin-item">
        <div class="quest-main">
          <div class="quest-title">${escapeHtml(f.note || ui.catName(f.categoryId))}</div>
          <div class="quest-meta"><span class="tag">${escapeHtml(ui.catName(f.categoryId))}</span><span class="tag">${escapeHtml(f.date)}</span></div>
        </div>
        <div class="quest-reward" style="color:${f.type==='ingreso'?'var(--success)':'var(--danger)'}">${f.type==='ingreso'?'+':'-'}$${f.amount.toLocaleString()}</div>
        <button class="icon-btn" data-action="delete-finance" data-id="${escapeHtml(f.id)}" aria-label="Eliminar">${ui.svgTrash()}</button>
      </div>
    `).join('');
  }

  ui.actions['delete-finance'] = async (id) => { await store.deleteFinance(id); render(); };

  ui.views.finanzas = { render };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
