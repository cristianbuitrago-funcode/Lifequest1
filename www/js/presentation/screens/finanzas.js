/*
 * Pestaña Finanzas, con tres secciones:
 *   - Resumen: estadísticas del mes, registro de movimientos y calendario de saldo.
 *   - Pagos: obligaciones con frecuencia, estado y "cuánto necesito para estar al día".
 *   - Distribución: reparto de cada ingreso entre sobres (automático o manual).
 */
(function (LQ) {
  "use strict";

  const { state, store, ui } = LQ;
  const { todayStr, escapeHtml } = LQ.utils;
  const FR = LQ.FinanceRules;
  const { BILL_FREQUENCIES, BILL_STATUS_LABELS } = LQ.config;

  let section = 'resumen';     // sección visible
  let editingBillId = null;    // pago en edición (formulario)
  let billFormOpen = false;
  let draftBuckets = null;     // edición de sobres sin guardar

  const money = (n) => ui.money(n);

  function render(){
    const el = document.getElementById('view-finanzas');
    el.innerHTML = `
      <div class="segmented" role="tablist" aria-label="Secciones de finanzas">
        ${seg('resumen', '📊', 'Resumen')}
        ${seg('pagos', '🧾', 'Pagos', overdueCount())}
        ${seg('distribucion', '🪙', 'Distribución')}
      </div>
      <div id="finSection"></div>`;
    el.querySelectorAll('[data-fin-section]').forEach(b => {
      b.onclick = () => { section = b.dataset.finSection; render(); };
    });
    const box = document.getElementById('finSection');
    if (section === 'pagos') renderPagos(box);
    else if (section === 'distribucion') renderDistribucion(box);
    else renderResumen(box);
  }

  function seg(id, emoji, label, badge){
    return `<button class="seg-btn ${section === id ? 'active' : ''}" role="tab" aria-selected="${section === id}" data-fin-section="${id}">
      <span aria-hidden="true">${emoji}</span> ${label}${badge ? ` <span class="seg-badge">${badge}</span>` : ''}</button>`;
  }

  function overdueCount(){
    const today = todayStr();
    return state.bills.filter(b => b.active !== false && FR.billStatus(b, today) === 'vencido').length;
  }

  function bucketOptions(selected, emptyLabel){
    return `<option value="">${emptyLabel || '— Ninguno —'}</option>` + state.settings.distribution.buckets
      .map(b => `<option value="${escapeHtml(b.id)}" ${b.id === selected ? 'selected' : ''}>${escapeHtml(b.emoji || '')} ${escapeHtml(b.name)}</option>`).join('');
  }
  function bucketName(id){
    if (id === '_libre') return '🪙 Sin asignar';
    const b = state.settings.distribution.buckets.find(x => x.id === id);
    return b ? (b.emoji ? b.emoji + ' ' : '') + b.name : 'Sobre eliminado';
  }

  function relDays(date, today){
    const d = FR.daysBetween(today, date);
    if (d === 0) return 'hoy';
    if (d === 1) return 'mañana';
    if (d === -1) return 'ayer';
    return d > 0 ? 'en ' + d + ' días' : 'hace ' + (-d) + ' días';
  }
  function shortDate(date){
    return FR.parseDate(date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  }

  // =========================================================================
  // Resumen (lo que ya existía, con reparto de ingresos y sobres)
  // =========================================================================
  function renderResumen(el){
    const today = todayStr();
    const monthPrefix = today.slice(0,7);
    const monthTx = state.finance.filter(f=>f.date && f.date.slice(0,7)===monthPrefix);
    const income = monthTx.filter(f=>f.type==='ingreso').reduce((s,f)=>s+f.amount,0);
    const expense = monthTx.filter(f=>f.type==='gasto').reduce((s,f)=>s+f.amount,0);
    const balance = state.finance.reduce((s,f)=> s + (f.type==='ingreso'?f.amount:-f.amount), 0);
    const dist = state.settings.distribution;

    el.innerHTML = `
      <div class="stat-tiles">
        <div class="stat-tile pos"><div class="v num">${money(income)}</div><div class="l">Ingresos del mes</div></div>
        <div class="stat-tile neg"><div class="v num">${money(expense)}</div><div class="l">Gastos del mes</div></div>
        <div class="stat-tile"><div class="v num">${money(balance)}</div><div class="l">Saldo total</div></div>
      </div>
      <div class="panel">
        <h2>Registrar movimiento</h2>
        <div class="grid2">
          <div class="field"><label for="fType">Tipo</label><select id="fType"><option value="gasto">Gasto</option><option value="ingreso">Ingreso</option></select></div>
          <div class="field"><label for="fAmount">Monto</label><input type="number" id="fAmount" min="0" step="0.01" placeholder="0" inputmode="decimal"></div>
          <div class="field"><label for="fCat">Categoría</label><select id="fCat">${ui.categoryOptions()}</select></div>
          <div class="field"><label for="fDate">Fecha</label><input type="date" id="fDate" value="${today}"></div>
          <div class="field" id="fBucketField"><label for="fBucket">Pagar desde el sobre</label><select id="fBucket">${bucketOptions('', 'Sin sobre')}</select></div>
          <div class="field" id="fDistField" hidden><label for="fDist">Distribuir el ingreso</label><select id="fDist">
            <option value="auto" ${dist.autoOnIncome && dist.mode === 'auto' ? 'selected' : ''}>Automático (porcentajes)</option>
            <option value="manual" ${dist.autoOnIncome && dist.mode === 'manual' ? 'selected' : ''}>Manual (lo reparto yo)</option>
            <option value="none" ${!dist.autoOnIncome ? 'selected' : ''}>No distribuir</option>
          </select></div>
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
    const typeEl = document.getElementById('fType');
    const syncType = () => {
      document.getElementById('fBucketField').hidden = typeEl.value !== 'gasto';
      document.getElementById('fDistField').hidden = typeEl.value !== 'ingreso';
    };
    typeEl.onchange = syncType;
    syncType();

    document.getElementById('fAddBtn').onclick = async () => {
      const amount = parseFloat(document.getElementById('fAmount').value);
      if (!amount || amount<=0){ ui.showToast('Escribe un monto mayor que 0'); return; }
      const entry = {
        amount,
        categoryId: document.getElementById('fCat').value,
        note: document.getElementById('fNote').value.trim(),
        date: document.getElementById('fDate').value || today
      };
      if (typeEl.value === 'ingreso'){
        const mode = document.getElementById('fDist').value;
        await handleIncome(entry, mode === 'none' ? null : mode);
        return;
      }
      await store.addFinance(Object.assign({ type: 'gasto', bucketId: document.getElementById('fBucket').value || null }, entry));
      render();
    };
    renderFinCal(monthPrefix);
    renderFinList();
  }

  function renderFinCal(monthPrefix){
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
      html += `<div class="cal-day ${cls} ${todayCls}"><div class="d">${day}</div><div class="v">${net!==0 ? (net>0?'+':'') + net.toLocaleString('es-CO') : '·'}</div></div>`;
    }
    grid.innerHTML = html;
  }

  function renderFinList(){
    const box = document.getElementById('finList');
    if (!box) return;
    const items = state.finance.slice(0,10);
    if (!items.length){ box.innerHTML = '<div class="empty">Aún no hay movimientos.</div>'; return; }
    box.innerHTML = items.map(f => {
      const tags = [`<span class="tag">${escapeHtml(ui.catName(f.categoryId))}</span>`, `<span class="tag">${escapeHtml(f.date)}</span>`];
      if (f.bucketId) tags.push(`<span class="tag">${escapeHtml(bucketName(f.bucketId))}</span>`);
      if (f.type === 'ingreso' && state.allocations.some(a => a.incomeId === f.id)) tags.push('<span class="tag tag-ok">Distribuido</span>');
      return `
      <div class="fin-item">
        <div class="quest-main">
          <div class="quest-title">${escapeHtml(f.note || ui.catName(f.categoryId))}</div>
          <div class="quest-meta">${tags.join('')}</div>
        </div>
        <div class="quest-reward" style="color:${f.type==='ingreso'?'var(--success)':'var(--danger)'}">${f.type==='ingreso'?'+':'-'}${money(f.amount)}</div>
        <button class="icon-btn" data-action="delete-finance" data-id="${escapeHtml(f.id)}" aria-label="Eliminar">${ui.svgTrash()}</button>
      </div>`;
    }).join('');
  }

  // =========================================================================
  // Pagos
  // =========================================================================
  function renderPagos(el){
    const today = todayStr();
    const bills = state.bills.filter(b => b.active !== false);
    const sum = FR.billsSummary(bills, today, 30);
    const stats = state.profile.stats;
    const cycleTotal = bills.filter(b => FR.billStatus(b, today) !== 'pagado').length;
    const paidNow = bills.filter(b => FR.billStatus(b, today) === 'pagado').length;
    const pct = bills.length ? Math.round(paidNow / bills.length * 100) : 0;

    el.innerHTML = `
      <div class="panel needed-card ${sum.overdue.count ? 'is-late' : ''}">
        <div class="needed-top">
          <div>
            <div class="needed-label">Para estar al día (próximos 30 días)</div>
            <div class="needed-value num">${money(sum.needed)}</div>
          </div>
          <div class="needed-icon" aria-hidden="true">${sum.overdue.count ? '⚠️' : '🛡️'}</div>
        </div>
        <div class="money-chips">
          <span class="money-chip late">Vencido <b class="num">${money(sum.overdue.amount)}</b></span>
          <span class="money-chip soon">7 días <b class="num">${money(sum.next7.amount)}</b></span>
          <span class="money-chip ok">30 días <b class="num">${money(sum.next30.amount)}</b></span>
        </div>
        <div class="progress-row">
          <div class="progress"><div class="progress-fill" style="width:${pct}%"></div></div>
          <span>${paidNow}/${bills.length} al día</span>
        </div>
        <div class="needed-foot">🔥 Racha de pagos a tiempo: <b>${stats.billStreak || 0}</b> · Mejor: ${stats.bestBillStreak || 0} · Pagos registrados: ${stats.billsPaid || 0}</div>
      </div>

      <div class="panel">
        <div class="section-head">
          <h2>Próximos pagos</h2>
          <span class="sub" style="margin:0">${cycleTotal} pendiente${cycleTotal === 1 ? '' : 's'}</span>
        </div>
        <div id="upcomingList"></div>
      </div>

      <div class="panel">
        <div class="section-head">
          <h2>Mis pagos</h2>
          <button class="btn small" id="newBillBtn">${billFormOpen && !editingBillId ? 'Cerrar' : '+ Nuevo pago'}</button>
        </div>
        <div id="billForm" ${billFormOpen ? '' : 'hidden'}></div>
        <div id="billList"></div>
      </div>`;

    renderUpcoming(sum, today);
    renderBillForm();
    renderBillList(today);
    document.getElementById('newBillBtn').onclick = () => {
      billFormOpen = !(billFormOpen && !editingBillId);
      editingBillId = null;
      render();
    };
  }

  function renderUpcoming(sum, today){
    const box = document.getElementById('upcomingList');
    const items = sum.upcoming.slice(0, 8);
    if (!items.length){
      box.innerHTML = `<div class="empty">${state.bills.length ? '¡Todo al día! No tienes pagos en los próximos 30 días. 🎉' : 'Registra tus pagos (internet, teléfono, transporte…) para ver aquí los próximos.'}</div>`;
      return;
    }
    box.innerHTML = `<div class="timeline">` + items.map(u => {
      const soon = !u.overdue && FR.daysBetween(today, u.date) <= 3;
      return `<div class="timeline-item ${u.overdue ? 'late' : soon ? 'soon' : ''}">
        <div class="timeline-date"><b>${FR.parseDate(u.date).getDate()}</b><span>${FR.parseDate(u.date).toLocaleDateString('es-CO', { month: 'short' })}</span></div>
        <div class="quest-main"><div class="quest-title">${escapeHtml(u.name)}</div>
          <div class="quest-meta"><span class="tag">${u.overdue ? 'Venció ' : 'Vence '}${relDays(u.date, today)}</span></div></div>
        <div class="quest-reward num">${money(u.amount)}</div>
      </div>`;
    }).join('') + `</div>`;
  }

  function renderBillForm(){
    const box = document.getElementById('billForm');
    if (!billFormOpen){ box.innerHTML = ''; return; }
    const b = editingBillId ? state.bills.find(x => x.id === editingBillId) : null;
    const freq = b ? b.frequency : 'mensual';
    box.innerHTML = `
      <div class="subpanel">
        <h3>${b ? 'Editar pago' : 'Nuevo pago'}</h3>
        <div class="grid2">
          <div class="field"><label for="bName">Nombre del pago</label><input type="text" id="bName" placeholder="Ej: Internet" value="${b ? escapeHtml(b.name) : ''}"></div>
          <div class="field"><label for="bAmount">Valor</label><input type="number" id="bAmount" min="0" step="0.01" inputmode="decimal" placeholder="100000" value="${b ? b.amount : ''}"></div>
          <div class="field"><label for="bCat">Categoría</label><select id="bCat">${ui.categoryOptions()}</select></div>
          <div class="field"><label for="bDue">${b ? 'Próxima fecha límite' : 'Fecha límite'}</label><input type="date" id="bDue" value="${b ? b.dueDate : todayStr()}"></div>
          <div class="field"><label for="bFreq">Frecuencia</label><select id="bFreq">
            ${Object.entries(BILL_FREQUENCIES).map(([k, v]) => `<option value="${k}" ${k === freq ? 'selected' : ''}>${v}</option>`).join('')}
          </select></div>
          <div class="field" id="bCustomField" ${freq === 'personalizado' ? '' : 'hidden'}><label for="bCustom">Repetir cada (días)</label><input type="number" id="bCustom" min="1" step="1" value="${b && b.customDays ? b.customDays : 10}"></div>
          <div class="field"><label for="bBucket">Pagar desde el sobre (opcional)</label><select id="bBucket">${bucketOptions(b ? b.bucketId : '', 'Sin sobre')}</select></div>
        </div>
        <div class="hint">El estado (pendiente, pagado o vencido) se calcula solo con la fecha y tus pagos.</div>
        <div class="row" style="margin-top:10px">
          <button class="btn" id="bSaveBtn">${b ? 'Guardar cambios' : 'Añadir pago'}</button>
          <button class="btn ghost" id="bCancelBtn">Cancelar</button>
        </div>
      </div>`;
    if (b) document.getElementById('bCat').value = b.categoryId || '';
    document.getElementById('bFreq').onchange = (e) => { document.getElementById('bCustomField').hidden = e.target.value !== 'personalizado'; };
    document.getElementById('bCancelBtn').onclick = () => { billFormOpen = false; editingBillId = null; render(); };
    document.getElementById('bSaveBtn').onclick = async () => {
      const input = {
        name: document.getElementById('bName').value,
        amount: parseFloat(document.getElementById('bAmount').value),
        categoryId: document.getElementById('bCat').value,
        dueDate: document.getElementById('bDue').value,
        frequency: document.getElementById('bFreq').value,
        customDays: parseInt(document.getElementById('bCustom').value, 10),
        bucketId: document.getElementById('bBucket').value || null
      };
      const r = editingBillId ? await LQ.Finance.updateBill(editingBillId, input) : await LQ.Finance.addBill(input);
      if (!r.ok){ ui.showToast(r.error); return; }
      ui.showToast(editingBillId ? 'Pago actualizado' : 'Pago añadido');
      billFormOpen = false; editingBillId = null;
      render();
    };
  }

  function renderBillList(today){
    const box = document.getElementById('billList');
    const bills = state.bills.filter(b => b.active !== false);
    if (!bills.length){
      box.innerHTML = '<div class="empty">Aún no registras pagos. Ejemplo: Internet — $100.000 — mensual.</div>';
      return;
    }
    const order = { vencido: 0, pendiente: 1, pagado: 2 };
    const sorted = bills.slice().sort((a, b) => order[FR.billStatus(a, today)] - order[FR.billStatus(b, today)] || (a.dueDate < b.dueDate ? -1 : 1));
    box.innerHTML = sorted.map(b => {
      const status = FR.billStatus(b, today);
      const recurring = FR.isRecurring(b);
      const when = status === 'pagado'
        ? (recurring ? 'Próximo: ' + shortDate(b.dueDate) : 'Pagado el ' + shortDate(b.paidAt))
        : (status === 'vencido' ? 'Venció ' : 'Vence ') + relDays(b.dueDate, today) + ' · ' + shortDate(b.dueDate);
      const freqLabel = b.frequency === 'personalizado' ? 'Cada ' + b.customDays + ' días' : BILL_FREQUENCIES[b.frequency];
      return `
      <div class="bill-card status-${status}">
        <div class="bill-main">
          <div class="bill-title">${escapeHtml(b.name)}</div>
          <div class="quest-meta">
            <span class="status-chip ${status}">${BILL_STATUS_LABELS[status]}</span>
            <span class="tag">${escapeHtml(freqLabel)}</span>
            <span class="tag" style="color:${ui.catColor(b.categoryId)}">${escapeHtml(ui.catName(b.categoryId))}</span>
          </div>
          <div class="bill-when">${escapeHtml(when)}</div>
        </div>
        <div class="bill-side">
          <div class="bill-amount num">${money(b.amount)}</div>
          <div class="bill-actions">
            ${status === 'pagado' ? `<span class="paid-check" aria-label="Pagado">✓</span>` :
              `<button class="btn small ${status === 'vencido' ? 'danger' : ''}" data-action="pay-bill" data-id="${escapeHtml(b.id)}">Marcar pagado</button>`}
            <button class="icon-btn" data-action="edit-bill" data-id="${escapeHtml(b.id)}" aria-label="Editar"><svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <button class="icon-btn" data-action="delete-bill" data-id="${escapeHtml(b.id)}" aria-label="Eliminar">${ui.svgTrash()}</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // =========================================================================
  // Distribución del dinero
  // =========================================================================
  function renderDistribucion(el){
    const dist = state.settings.distribution;
    const balances = LQ.Finance.balances();
    const buckets = dist.buckets;
    const totalBalance = Object.values(balances).reduce((s, b) => s + b.balance, 0);

    el.innerHTML = `
      <div class="panel">
        <h2>Distribución del dinero</h2>
        <div class="sub">Reparte cada ingreso en sobres para saber cuánto puedes gastar en cada cosa.</div>
        <div class="mode-toggle" role="radiogroup" aria-label="Modo de distribución">
          <button class="mode-btn ${dist.mode === 'auto' ? 'active' : ''}" data-mode="auto" role="radio" aria-checked="${dist.mode === 'auto'}">
            <b>⚙️ Automático</b><span>Según tus porcentajes</span></button>
          <button class="mode-btn ${dist.mode === 'manual' ? 'active' : ''}" data-mode="manual" role="radio" aria-checked="${dist.mode === 'manual'}">
            <b>✋ Manual</b><span>Tú decides cada vez</span></button>
        </div>
        <div class="grid2" style="margin-top:12px">
          <div class="field"><label for="dAmount">Recibí</label><input type="number" id="dAmount" min="0" step="0.01" inputmode="decimal" placeholder="100000"></div>
          <div class="field"><label for="dNote">Concepto (opcional)</label><input type="text" id="dNote" placeholder="Ej: Salario"></div>
        </div>
        <button class="btn" id="dGoBtn">${dist.mode === 'auto' ? 'Registrar y distribuir' : 'Registrar y repartir…'}</button>
        <label class="check-row"><input type="checkbox" id="dAutoOnIncome" ${dist.autoOnIncome ? 'checked' : ''}> Distribuir también los ingresos registrados en Resumen</label>
      </div>

      <div class="panel">
        <div class="section-head"><h2>Mis sobres</h2><span class="num sub" style="margin:0">${money(totalBalance)} disponibles</span></div>
        <div class="bucket-grid">
          ${buckets.map(b => bucketCard(b.id, (b.emoji ? b.emoji + ' ' : '') + b.name, b.percent, balances[b.id])).join('')}
          ${balances._libre && balances._libre.allocated ? bucketCard('_libre', '🪙 Sin asignar', null, balances._libre) : ''}
        </div>
      </div>

      <div class="panel">
        <h2>Porcentajes del modo automático</h2>
        <div class="sub">Cambia nombres, emojis y porcentajes. La suma debe ser exactamente 100 %.</div>
        <div id="bucketEditor"></div>
      </div>

      <div class="panel">
        <h2>Últimos repartos</h2>
        <div id="allocList"></div>
      </div>`;

    el.querySelectorAll('[data-mode]').forEach(btn => {
      btn.onclick = async () => { await LQ.Finance.saveDistribution({ mode: btn.dataset.mode }); render(); };
    });
    document.getElementById('dAutoOnIncome').onchange = async (e) => {
      await LQ.Finance.saveDistribution({ autoOnIncome: e.target.checked });
      ui.showToast(e.target.checked ? 'Los ingresos se distribuirán al registrarlos' : 'Los ingresos de Resumen ya no se distribuyen');
    };
    document.getElementById('dGoBtn').onclick = async () => {
      const amount = parseFloat(document.getElementById('dAmount').value);
      if (!amount || amount <= 0){ ui.showToast('Escribe cuánto recibiste'); return; }
      await handleIncome({ amount, note: document.getElementById('dNote').value.trim() || 'Ingreso', date: todayStr() }, dist.mode);
    };
    renderBucketEditor();
    renderAllocations();
  }

  function bucketCard(id, title, percent, bal){
    bal = bal || { allocated: 0, spent: 0, balance: 0 };
    const used = bal.allocated ? Math.min(100, Math.round(bal.spent / bal.allocated * 100)) : 0;
    const cls = bal.balance < 0 ? 'neg' : used >= 85 ? 'warn' : '';
    return `<div class="bucket-card ${cls}">
      <div class="bucket-head"><span class="bucket-title">${escapeHtml(title)}</span>${percent != null ? `<span class="tag">${percent}%</span>` : ''}</div>
      <div class="bucket-balance num">${money(bal.balance)}</div>
      <div class="progress small"><div class="progress-fill" style="width:${used}%"></div></div>
      <div class="bucket-foot">Asignado ${money(bal.allocated)} · Gastado ${money(bal.spent)}</div>
    </div>`;
  }

  function renderBucketEditor(){
    const box = document.getElementById('bucketEditor');
    if (!draftBuckets) draftBuckets = JSON.parse(JSON.stringify(state.settings.distribution.buckets));
    const v = FR.validateBuckets(draftBuckets);
    const total = draftBuckets.reduce((s, b) => s + (Number(b.percent) || 0), 0);
    box.innerHTML = `
      <div class="settings-list">
        ${draftBuckets.map((b, i) => `
          <div class="bucket-row" data-i="${i}">
            <input type="text" class="emoji-input" value="${escapeHtml(b.emoji || '')}" maxlength="4" aria-label="Emoji">
            <input type="text" class="name-input" value="${escapeHtml(b.name)}" aria-label="Nombre">
            <div class="pct-input"><input type="number" min="0" max="100" step="0.5" value="${b.percent}" aria-label="Porcentaje"><span>%</span></div>
            <button class="icon-btn" data-remove="${i}" aria-label="Quitar">${ui.svgTrash()}</button>
          </div>`).join('')}
      </div>
      <div class="total-bar ${v.ok ? 'ok' : 'bad'}">
        <div class="progress"><div class="progress-fill" style="width:${Math.min(100, total)}%"></div></div>
        <span><b class="num">${FR.round2(total)} %</b> ${v.ok ? '✓ Perfecto' : '· ' + escapeHtml(v.error)}</span>
      </div>
      <div class="row">
        <button class="btn ghost small" id="addBucketBtn">+ Añadir sobre</button>
        <button class="btn small" id="saveBucketsBtn" ${v.ok ? '' : 'disabled'}>Guardar porcentajes</button>
        <button class="btn ghost small" id="resetBucketsBtn">Deshacer cambios</button>
      </div>`;

    box.querySelectorAll('.bucket-row').forEach(row => {
      const i = +row.dataset.i;
      row.querySelector('.emoji-input').oninput = (e) => { draftBuckets[i].emoji = e.target.value.trim(); };
      row.querySelector('.name-input').oninput = (e) => { draftBuckets[i].name = e.target.value; };
      row.querySelector('.name-input').onchange = () => renderBucketEditor();
      row.querySelector('.pct-input input').onchange = (e) => { draftBuckets[i].percent = parseFloat(e.target.value) || 0; renderBucketEditor(); };
    });
    box.querySelectorAll('[data-remove]').forEach(btn => {
      btn.onclick = () => { draftBuckets.splice(+btn.dataset.remove, 1); renderBucketEditor(); };
    });
    document.getElementById('addBucketBtn').onclick = () => {
      draftBuckets.push({ id: 'sobre-' + LQ.utils.uid(), emoji: '📦', name: 'Nuevo sobre', percent: 0 });
      renderBucketEditor();
    };
    document.getElementById('resetBucketsBtn').onclick = () => { draftBuckets = null; renderBucketEditor(); };
    document.getElementById('saveBucketsBtn').onclick = async () => {
      const r = await LQ.Finance.saveDistribution({ buckets: draftBuckets.map(b => Object.assign({}, b, { name: b.name.trim() })) });
      if (!r.ok){ ui.showToast(r.error); return; }
      draftBuckets = null;
      ui.showToast('Porcentajes guardados');
      render();
    };
  }

  function renderAllocations(){
    const box = document.getElementById('allocList');
    const items = state.allocations.slice(0, 5);
    if (!items.length){ box.innerHTML = '<div class="empty">Cuando registres un ingreso, aquí verás cómo se repartió.</div>'; return; }
    box.innerHTML = items.map(a => `
      <div class="alloc-item">
        <div class="alloc-head"><b class="num">${money(a.amount)}</b><span class="tag">${a.mode === 'auto' ? 'Automático' : 'Manual'}</span><span class="tag">${escapeHtml(a.date)}</span></div>
        <div class="alloc-parts">${a.parts.map(p => `<span>${escapeHtml(bucketName(p.bucketId))} <b class="num">${money(p.amount)}</b></span>`).join('')}</div>
      </div>`).join('');
  }

  // =========================================================================
  // Registrar ingreso + reparto (compartido por Resumen y Distribución)
  // =========================================================================
  async function handleIncome(entry, mode){
    if (mode === 'manual'){
      openManualDistribution(entry);
      return;
    }
    const r = await LQ.Finance.registerIncome(entry, mode);
    if (!r.ok){
      ui.showToast(r.error);
      if (mode === 'auto'){ section = 'distribucion'; render(); }
      return;
    }
    if (r.parts){
      ui.celebrate({
        icon: '💸',
        title: '¡Dinero distribuido!',
        message: money(entry.amount) + ' repartidos en tus sobres.',
        extraHtml: `<div class="celebrate-split">${r.parts.map(p => `<div><span>${escapeHtml(bucketName(p.bucketId))}</span><b class="num">${money(p.amount)}</b></div>`).join('')}</div>`
      });
    } else {
      ui.showToast('Ingreso registrado');
    }
    render();
  }

  function openManualDistribution(entry){
    const buckets = state.settings.distribution.buckets;
    ui.openModal('Repartir ' + money(entry.amount), (body, close) => {
      body.innerHTML = `
        <div class="remaining" id="mRemaining"></div>
        <div class="settings-list">
          ${buckets.map(b => `
            <div class="manual-row">
              <span>${escapeHtml(b.emoji || '')} ${escapeHtml(b.name)}</span>
              <input type="number" min="0" step="0.01" inputmode="decimal" placeholder="0" data-bucket="${escapeHtml(b.id)}" aria-label="Monto para ${escapeHtml(b.name)}">
            </div>`).join('')}
        </div>
        <div class="hint">Lo que no repartas quedará en "Sin asignar".</div>
        <div class="row" style="margin-top:12px">
          <button class="btn" id="mConfirm">Confirmar reparto</button>
          <button class="btn ghost" id="mAuto">Usar mis porcentajes</button>
        </div>`;
      const inputs = [...body.querySelectorAll('[data-bucket]')];
      const parts = () => inputs.map(i => ({ bucketId: i.dataset.bucket, amount: parseFloat(i.value) || 0 }));
      const update = () => {
        const c = FR.checkManual(entry.amount, parts());
        const el = body.querySelector('#mRemaining');
        el.className = 'remaining ' + (c.ok ? (c.remaining === 0 ? 'done' : '') : 'over');
        el.innerHTML = c.ok
          ? `Disponible por repartir: <b class="num">${money(c.remaining)}</b>`
          : `Te pasaste por <b class="num">${money(-c.remaining)}</b>. No puedes repartir más de lo que recibiste.`;
        body.querySelector('#mConfirm').disabled = !c.ok;
      };
      inputs.forEach(i => { i.oninput = update; });
      update();
      body.querySelector('#mAuto').onclick = () => {
        const v = FR.validateBuckets(buckets);
        if (!v.ok){ ui.showToast('Tus porcentajes no suman 100 %'); return; }
        FR.autoDistribute(entry.amount, buckets).forEach((p, i) => { inputs[i].value = p.amount; });
        update();
      };
      body.querySelector('#mConfirm').onclick = async () => {
        const r = await LQ.Finance.registerIncome(entry, 'manual', parts());
        if (!r.ok){ ui.showToast(r.error); return; }
        close();
        ui.celebrate({
          icon: '💸',
          title: '¡Dinero repartido!',
          message: 'Tú decidiste a dónde va cada peso.',
          extraHtml: `<div class="celebrate-split">${r.parts.map(p => `<div><span>${escapeHtml(bucketName(p.bucketId))}</span><b class="num">${money(p.amount)}</b></div>`).join('')}
            ${FR.checkManual(entry.amount, r.parts).remaining > 0 ? `<div><span>🪙 Sin asignar</span><b class="num">${money(FR.checkManual(entry.amount, r.parts).remaining)}</b></div>` : ''}</div>`
        });
        render();
      };
    });
  }

  // =========================================================================
  // Acciones (botones con data-action)
  // =========================================================================
  ui.actions['delete-finance'] = async (id) => { await LQ.Finance.deleteFinanceEntry(id); render(); };

  ui.actions['pay-bill'] = async (id, el) => {
    const r = await LQ.Finance.payBill(id);
    if (!r) return;
    ui.renderCharacterCard();
    ui.celebrate({
      title: '🎉 ¡Felicidades!',
      message: r.onTime ? '¡Mantienes tus pagos al día!' : 'Pago registrado. ¡Bien hecho por ponerte al día!',
      rewards: ['+' + r.xp + ' XP', r.coins ? '+' + r.coins + ' 🪙' : null, r.onTime && r.streak > 1 ? '🔥 ' + r.streak + ' pagos a tiempo seguidos' : null].filter(Boolean),
      actions: r.leveledUp ? [{ label: 'Ver mi nuevo nivel', primary: true, onClick: () => ui.celebrateLevelUp(r.level) }] : []
    });
    ui.renderAll();
    render();
  };
  ui.actions['edit-bill'] = (id) => { editingBillId = id; billFormOpen = true; render(); document.getElementById('billForm').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  ui.actions['delete-bill'] = async (id) => {
    const b = state.bills.find(x => x.id === id);
    if (!b || !confirm('¿Eliminar el pago "' + b.name + '"? Los movimientos ya registrados se conservan.')) return;
    await LQ.Finance.deleteBill(id);
    if (editingBillId === id){ editingBillId = null; billFormOpen = false; }
    render();
  };

  ui.views.finanzas = { render, showSection: (s) => { section = s; render(); } };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
