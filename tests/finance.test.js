const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers');

const LQ = loadCore();
const FR = LQ.FinanceRules;
const plain = (x) => JSON.parse(JSON.stringify(x));

test('siguiente vencimiento según la frecuencia', () => {
  assert.equal(FR.nextDue({ frequency: 'diario' }, '2026-09-30'), '2026-10-01');
  assert.equal(FR.nextDue({ frequency: 'semanal' }, '2026-09-28'), '2026-10-05');
  assert.equal(FR.nextDue({ frequency: 'quincenal' }, '2026-09-20'), '2026-10-05');
  assert.equal(FR.nextDue({ frequency: 'personalizado', customDays: 10 }, '2026-09-25'), '2026-10-05');
  assert.equal(FR.nextDue({ frequency: 'unico' }, '2026-09-25'), null);
});

test('mensual conserva el día aunque el mes sea más corto', () => {
  const bill = { frequency: 'mensual', anchorDay: 31 };
  assert.equal(FR.nextDue(bill, '2026-01-31'), '2026-02-28');
  assert.equal(FR.nextDue(bill, '2026-02-28'), '2026-03-31');
});

test('estados: pendiente, vencido y pagado', () => {
  const today = '2026-09-26';
  assert.equal(FR.billStatus({ frequency: 'unico', dueDate: '2026-09-30' }, today), 'pendiente');
  assert.equal(FR.billStatus({ frequency: 'unico', dueDate: '2026-09-20' }, today), 'vencido');
  assert.equal(FR.billStatus({ frequency: 'unico', dueDate: '2026-09-20', paidAt: '2026-09-21' }, today), 'pagado');
  // Recurrente pagado por adelantado: "pagado" hasta la fecha cubierta
  const internet = { frequency: 'mensual', dueDate: '2026-10-28', paidThrough: '2026-09-28' };
  assert.equal(FR.billStatus(internet, today), 'pagado');
  assert.equal(FR.billStatus(internet, '2026-09-29'), 'pendiente');
  assert.equal(FR.billStatus({ frequency: 'semanal', dueDate: '2026-09-20' }, today), 'vencido');
});

test('pagar avanza al siguiente ciclo y sabe si fue a tiempo', () => {
  const r = FR.payPatch({ frequency: 'mensual', dueDate: '2026-09-30' }, '2026-09-26');
  assert.equal(r.onTime, true);
  assert.deepEqual(plain(r.patch), { paidThrough: '2026-09-30', dueDate: '2026-10-30', lastPaidDate: '2026-09-26', anchorDay: 30 });
  const late = FR.payPatch({ frequency: 'unico', dueDate: '2026-09-20' }, '2026-09-26');
  assert.equal(late.onTime, false);
  assert.equal(late.patch.paidAt, '2026-09-26');
});

test('resumen: cuánto hace falta para estar al día', () => {
  const bills = [
    { id: 'i', name: 'Internet', amount: 100000, frequency: 'mensual', dueDate: '2026-10-05' },
    { id: 't', name: 'Transporte', amount: 50000, frequency: 'semanal', dueDate: '2026-09-28' },
    { id: 'v', name: 'Teléfono', amount: 60000, frequency: 'unico', dueDate: '2026-09-20' },
    { id: 'x', name: 'Ya pagado', amount: 999, frequency: 'unico', dueDate: '2026-09-30', paidAt: '2026-09-25' }
  ];
  const s = FR.billsSummary(bills, '2026-09-26');
  assert.equal(s.overdue.amount, 60000);
  assert.equal(s.next7.amount, 50000);                 // transporte 28 sep
  assert.equal(s.next30.amount, 100000 + 50000 * 5);   // internet + transporte 28/9, 5, 12, 19, 26 oct
  assert.equal(s.needed, 60000 + 350000);
  assert.equal(s.upcoming[0].name, 'Teléfono');
  assert.ok(s.upcoming.every(u => u.name !== 'Ya pagado'));
});

test('validación de porcentajes: exactamente 100 %', () => {
  const b = (p) => p.map((percent, i) => ({ id: 'b' + i, name: 'B' + i, percent }));
  assert.equal(FR.validateBuckets(b([50, 15, 10, 10, 15])).ok, true);
  assert.match(FR.validateBuckets(b([50, 15, 10, 10])).error, /Falta asignar 15 %/);
  assert.match(FR.validateBuckets(b([60, 50])).error, /Sobran 10 %/);
  assert.equal(FR.validateBuckets(b([33.33, 33.33, 33.34])).ok, true);
  assert.equal(FR.validateBuckets([{ id: 'a', name: '', percent: 100 }]).ok, false);
});

test('reparto automático exacto al centavo', () => {
  const buckets = LQ.config.defaultSettings().distribution.buckets;
  const parts = FR.autoDistribute(100000, buckets);
  assert.deepEqual(plain(parts.map(p => p.amount)), [50000, 15000, 10000, 10000, 15000]);
  const thirds = [{ id: 'a', percent: 33.33 }, { id: 'b', percent: 33.33 }, { id: 'c', percent: 33.34 }];
  const odd = FR.autoDistribute(100.01, thirds);
  assert.equal(Math.round(odd.reduce((s, p) => s + p.amount, 0) * 100), 10001);
});

test('reparto manual: no permite pasarse de lo recibido', () => {
  assert.deepEqual(plain(FR.checkManual(100000, [{ amount: 40000 }, { amount: 30000 }])), { ok: true, remaining: 30000, error: null });
  const over = FR.checkManual(100000, [{ amount: 80000 }, { amount: 30000 }]);
  assert.equal(over.ok, false);
  assert.equal(over.remaining, -10000);
});

test('saldo de cada sobre = asignado - gastado; lo no repartido queda libre', () => {
  const buckets = [{ id: 'ahorro' }, { id: 'transporte' }];
  const allocations = [{ amount: 100, parts: [{ bucketId: 'ahorro', amount: 60 }, { bucketId: 'transporte', amount: 30 }] }];
  const finance = [{ type: 'gasto', amount: 12.5, bucketId: 'transporte' }, { type: 'gasto', amount: 5 }];
  const b = FR.bucketBalances(buckets, allocations, finance);
  assert.equal(b.ahorro.balance, 60);
  assert.equal(b.transporte.balance, 17.5);
  assert.equal(b._libre.balance, 10);
});

async function freshApp(){
  const L = loadCore();
  await L.store.init({ adapter: L.storage.createMemoryAdapter('t'), onError: (e) => { throw e; } });
  return L;
}

test('pagar un pago registra el gasto, avanza el ciclo y da recompensa', async () => {
  const L = await freshApp();
  const today = L.utils.todayStr();
  const due = L.FinanceRules.addDaysStr(today, 3);
  const { bill } = await L.Finance.addBill({ name: 'Internet', amount: 100000, frequency: 'mensual', dueDate: due });
  const r = await L.Finance.payBill(bill.id);
  assert.equal(r.onTime, true);
  assert.equal(r.xp, 15);
  assert.equal(L.state.character.coins, 5);
  assert.equal(L.state.finance[0].amount, 100000);
  assert.equal(L.state.finance[0].billId, bill.id);
  const saved = L.state.bills.find(b => b.id === bill.id);
  assert.equal(saved.paidThrough, due);
  assert.equal(L.FinanceRules.billStatus(saved, today), 'pagado');
  assert.equal(L.state.profile.stats.billStreak, 1);
  assert.equal(await L.Finance.payBill(bill.id), null, 'no se paga dos veces el mismo ciclo');
});

test('validaciones al crear pagos', async () => {
  const L = await freshApp();
  assert.equal((await L.Finance.addBill({ name: '', amount: 10 })).ok, false);
  assert.equal((await L.Finance.addBill({ name: 'X', amount: 0 })).ok, false);
});

test('ingreso con reparto automático y borrado en cascada', async () => {
  const L = await freshApp();
  const r = await L.Finance.registerIncome({ amount: 100000 }, 'auto');
  assert.equal(r.ok, true);
  assert.equal(L.Finance.balances().esenciales.balance, 50000);
  await L.store.addFinance({ type: 'gasto', amount: 20000, bucketId: 'esenciales' });
  assert.equal(L.Finance.balances().esenciales.balance, 30000);
  await L.Finance.deleteFinanceEntry(r.entry.id);
  assert.equal(L.state.allocations.length, 0);
});

test('ingreso con reparto manual rechaza excesos', async () => {
  const L = await freshApp();
  const bad = await L.Finance.registerIncome({ amount: 100 }, 'manual', [{ bucketId: 'ahorro', amount: 120 }]);
  assert.equal(bad.ok, false);
  assert.equal(L.state.finance.length, 0, 'no guarda nada si el reparto es inválido');
  const ok = await L.Finance.registerIncome({ amount: 100 }, 'manual', [{ bucketId: 'ahorro', amount: 70 }]);
  assert.equal(ok.ok, true);
  assert.equal(L.Finance.balances()._libre.balance, 30);
});

test('la distribución solo se guarda si suma 100 %', async () => {
  const L = await freshApp();
  const r = await L.Finance.saveDistribution({ buckets: [{ id: 'a', name: 'A', percent: 90 }] });
  assert.equal(r.ok, false);
  assert.equal(L.state.settings.distribution.buckets.length, 5);
});
