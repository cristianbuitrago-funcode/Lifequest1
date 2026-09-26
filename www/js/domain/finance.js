/*
 * Acciones de finanzas: pagos y distribución del dinero.
 * Aplican las reglas de finance/rules.js al estado y lo persisten. Sin DOM:
 * devuelven un resultado y la UI decide qué mostrar.
 */
(function (LQ) {
  "use strict";

  const { todayStr } = LQ.utils;
  const FR = LQ.FinanceRules;
  const state = LQ.state;
  const store = LQ.store;

  // -------------------------------------------------------------------------
  // Pagos
  // -------------------------------------------------------------------------
  function cleanBill(input){
    const bill = {
      name: String(input.name || '').trim(),
      categoryId: input.categoryId || (state.settings.categories[0] || {}).id || null,
      amount: FR.round2(input.amount),
      dueDate: input.dueDate || todayStr(),
      frequency: LQ.config.BILL_FREQUENCIES[input.frequency] ? input.frequency : 'mensual',
      bucketId: input.bucketId || null
    };
    if (bill.frequency === 'personalizado') bill.customDays = Math.max(1, Math.round(Number(input.customDays) || 1));
    if (bill.frequency === 'mensual') bill.anchorDay = FR.parseDate(bill.dueDate).getDate();
    return bill;
  }

  function validateBill(bill){
    if (!bill.name) return 'Escribe el nombre del pago.';
    if (!(bill.amount > 0)) return 'El valor debe ser mayor que 0.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bill.dueDate)) return 'Elige la fecha límite.';
    return null;
  }

  async function addBill(input){
    const bill = cleanBill(input);
    const error = validateBill(bill);
    if (error) return { ok:false, error };
    const doc = await store.addRecord('bills', Object.assign(bill, { active: true, createdAt: todayStr(), paidAt: null, paidThrough: null, lastPaidDate: null }));
    return { ok:true, bill: doc };
  }

  async function updateBill(id, input){
    const current = state.bills.find(b => b.id === id); if (!current) return { ok:false, error:'No existe ese pago.' };
    const bill = cleanBill(Object.assign({}, current, input));
    const error = validateBill(bill);
    if (error) return { ok:false, error };
    // Si cambia la fecha o la frecuencia, empieza un ciclo nuevo.
    if (bill.dueDate !== current.dueDate || bill.frequency !== current.frequency){
      Object.assign(bill, { paidAt: null, paidThrough: null });
    }
    return { ok:true, bill: await store.updateRecord('bills', id, bill) };
  }

  function deleteBill(id){ return store.deleteRecord('bills', id); }

  /**
   * Marca el vencimiento actual como pagado: registra el gasto en Finanzas,
   * avanza al siguiente ciclo y da la recompensa (XP + monedas).
   */
  async function payBill(id){
    const bill = state.bills.find(b => b.id === id);
    if (!bill) return null;
    const today = todayStr();
    if (FR.billStatus(bill, today) === 'pagado') return null;

    const { patch, onTime, paidDue } = FR.payPatch(bill, today);
    await store.addFinance({
      type: 'gasto', amount: bill.amount, categoryId: bill.categoryId,
      note: 'Pago: ' + bill.name, date: today, billId: bill.id, bucketId: bill.bucketId || null
    });
    await store.updateRecord('bills', id, patch);

    const stats = state.profile.stats;
    stats.billsPaid = (stats.billsPaid || 0) + 1;
    if (onTime){
      stats.billsOnTime = (stats.billsOnTime || 0) + 1;
      stats.billStreak = (stats.billStreak || 0) + 1;
      stats.bestBillStreak = Math.max(stats.bestBillStreak || 0, stats.billStreak);
    } else {
      stats.billStreak = 0;
    }
    await store.saveProfile();

    const reward = state.settings.billRewards[onTime ? 'onTime' : 'late'];
    const lvl = LQ.Game.grantReward(reward.xp, reward.coins);
    await store.saveCharacter();
    return { bill, onTime, paidDue, xp: reward.xp, coins: reward.coins, streak: stats.billStreak, leveledUp: lvl.leveledUp, level: lvl.level };
  }

  // -------------------------------------------------------------------------
  // Distribución del dinero
  // -------------------------------------------------------------------------
  function buckets(){ return state.settings.distribution.buckets; }

  /**
   * Registra un ingreso y, si se pide, lo reparte entre los sobres.
   * @param {object} income  {amount, categoryId, note, date}
   * @param {'auto'|'manual'|null} mode  null = solo registrar el ingreso
   * @param {Array} manualParts  [{bucketId, amount}] para el modo manual
   */
  async function registerIncome(income, mode, manualParts){
    const amount = FR.round2(income.amount);
    if (!(amount > 0)) return { ok:false, error:'El monto debe ser mayor que 0.' };

    let parts = null;
    if (mode === 'auto'){
      const v = FR.validateBuckets(buckets());
      if (!v.ok) return { ok:false, error:'La distribución automática no suma 100 %: ' + v.error };
      parts = FR.autoDistribute(amount, buckets());
    } else if (mode === 'manual'){
      const clean = (manualParts || []).map(p => ({ bucketId: p.bucketId, amount: FR.round2(p.amount) })).filter(p => p.amount > 0);
      const check = FR.checkManual(amount, clean);
      if (!check.ok) return { ok:false, error: check.error };
      parts = clean;
    }

    const entry = await store.addFinance({
      type: 'ingreso', amount, categoryId: income.categoryId || (state.settings.categories[0] || {}).id,
      note: income.note || '', date: income.date || todayStr()
    });
    let allocation = null;
    if (parts){
      allocation = await store.addRecord('allocations', {
        ts: Date.now(), date: entry.date, incomeId: entry.id, amount, mode, parts
      });
    }
    return { ok:true, entry, allocation, parts };
  }

  /** Borra un movimiento; si era un ingreso repartido, también su reparto. */
  async function deleteFinanceEntry(id){
    const linked = state.allocations.filter(a => a.incomeId === id);
    await store.deleteFinance(id);
    for (const a of linked) await store.deleteRecord('allocations', a.id);
  }

  async function saveDistribution(patch){
    const d = state.settings.distribution;
    if (patch.buckets){
      const v = FR.validateBuckets(patch.buckets);
      if (!v.ok) return { ok:false, error: v.error };
    }
    Object.assign(d, patch);
    await store.saveSettings();
    return { ok:true };
  }

  function balances(){
    return FR.bucketBalances(buckets(), state.allocations, state.finance);
  }

  LQ.Finance = { addBill, updateBill, deleteBill, payBill, registerIncome, deleteFinanceEntry, saveDistribution, balances };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
