const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers');

const LQ = loadCore();
const { Reminders, config, utils } = LQ;

function makeState(overrides){
  const settings = config.defaultSettings();
  settings.reminders.morning.enabled = true;
  settings.reminders.evening.enabled = true;
  return Object.assign({
    settings,
    character: { totalXp: 0, coins: 0, streak: 0, lastActiveDate: null },
    quests: [
      { id: 'a', title: 'Beber agua', active: true, recurrence: 'diaria', lastCompletedDate: null },
      { id: 'b', title: 'Leer', active: true, recurrence: 'diaria', lastCompletedDate: null },
      { id: 'c', title: 'Informe', active: true, recurrence: 'unica', lastCompletedDate: null }
    ],
    habits: [{ id: 'h', title: 'Meditar', log: {} }]
  }, overrides);
}

test('sin recordatorios activos no programa nada', () => {
  const s = makeState();
  s.settings.reminders.morning.enabled = false;
  s.settings.reminders.evening.enabled = false;
  assert.equal(Reminders.plan(s, new Date(2026, 8, 25, 7, 0)).length, 0);
});

test('programa mañana y noche para 14 días con ids estables', () => {
  const list = Reminders.plan(makeState(), new Date(2026, 8, 25, 7, 0));
  assert.equal(list.length, 28);
  const first = list[0];
  assert.equal(first.kind, 'morning');
  assert.equal(first.id, 1000);
  assert.equal(first.at.getHours(), 8);
  assert.match(first.body, /2 misiones diarias y 1 hábito/);
  const lastEvening = list.filter(n => n.kind === 'evening').pop();
  assert.equal(lastEvening.id, 2013);
  const [lo, hi] = Reminders.ID_RANGE;
  assert.ok(list.every(n => n.id >= lo && n.id <= hi));
});

test('omite los horarios de hoy que ya pasaron', () => {
  const list = Reminders.plan(makeState(), new Date(2026, 8, 25, 12, 0));
  const today = list.filter(n => n.date === '2026-09-25');
  assert.deepEqual([...today.map(n => n.kind)], ['evening']);
});

test('el aviso de hoy lista solo lo pendiente', () => {
  const now = new Date(2026, 8, 25, 12, 0);
  const today = utils.fmtDate(now);
  const s = makeState();
  s.quests[0].lastCompletedDate = today;
  s.habits[0].log[today] = true;
  const evening = Reminders.plan(s, now).find(n => n.date === today);
  assert.match(evening.body, /Te falta «Leer»/);
  assert.doesNotMatch(evening.body, /Beber agua|Meditar/);
});

test('sin nada pendiente hoy no avisa hoy, pero sí los días siguientes', () => {
  const now = new Date(2026, 8, 25, 12, 0);
  const today = utils.fmtDate(now);
  const s = makeState();
  s.quests.forEach(q => { q.lastCompletedDate = today; });
  s.habits[0].log[today] = true;
  const list = Reminders.plan(s, now);
  assert.equal(list.filter(n => n.date === today).length, 0);
  assert.ok(list.some(n => n.date === '2026-09-26'));
});

test('avisa de racha en riesgo', () => {
  const now = new Date(2026, 8, 25, 12, 0);
  const s = makeState({ character: { streak: 5, lastActiveDate: '2026-09-24' } });
  const evening = Reminders.plan(s, now).find(n => n.date === '2026-09-25');
  assert.match(evening.title, /racha de 5 días/);
});

test('mergeSettings conserva recordatorios guardados y rellena los que faltan', () => {
  const merged = config.mergeSettings({ reminders: { evening: { enabled: true } } });
  assert.equal(merged.reminders.evening.enabled, true);
  assert.equal(merged.reminders.evening.time, '20:00');
  assert.equal(merged.reminders.morning.enabled, false);
});

test('alarmas extra: avisan de lo pendiente a la hora elegida', () => {
  const now = new Date(2026, 8, 25, 12, 0);
  const s = makeState();
  s.settings.reminders.morning.enabled = false;
  s.settings.reminders.evening.enabled = false;
  s.settings.reminders.extra = [
    { id: 'x1', time: '17:30', enabled: true },
    { id: 'x2', time: '22:00', enabled: false }
  ];
  const list = Reminders.plan(s, now);
  assert.equal(list.length, 14, 'una alarma activa × 14 días');
  assert.ok(list.every(n => n.kind === 'extra' && n.at.getHours() === 17 && n.at.getMinutes() === 30));
  assert.match(list[0].body, /Te faltan «Beber agua», «Leer» y «Meditar»/);
  assert.equal(new Set(list.map(n => n.id)).size, list.length, 'ids únicos');
  assert.ok(Reminders.wanted(s));
});

function billState(bills){
  const s = makeState();
  s.settings.reminders.morning.enabled = false;
  s.settings.reminders.evening.enabled = false;
  s.bills = bills;
  return s;
}

test('pagos: aviso 3 días antes y tres veces el día del pago', () => {
  const now = new Date(2026, 8, 25, 7, 0);   // 25 sept, 7:00
  const s = billState([{ id: 'b1', name: 'Internet', amount: 100000, frequency: 'unico', dueDate: '2026-09-30' }]);
  const list = Reminders.plan(s, now);
  const before = list.filter(n => n.date === '2026-09-27');
  const due = list.filter(n => n.date === '2026-09-30');
  assert.equal(before.length, 1);
  assert.match(before[0].title, /En 3 días vence Internet/);
  assert.match(before[0].body, /\$100\.000/);
  assert.deepEqual([...due.map(n => n.at.getHours())], [8, 13, 19]);
  assert.match(due[0].title, /Hoy vence: Internet/);
  assert.equal(list.length, 4);
  assert.ok(list.every(n => n.kind === 'bill' && n.billId === 'b1'));
  const [lo, hi] = Reminders.ID_RANGE;
  assert.ok(list.every(n => n.id >= lo && n.id <= hi));
});

test('pagos: los recurrentes avisan en cada vencimiento dentro del horizonte', () => {
  const now = new Date(2026, 8, 25, 7, 0);
  const s = billState([{ id: 'b2', name: 'Gimnasio', amount: 50000, frequency: 'semanal', dueDate: '2026-09-26' }]);
  const dueDays = new Set(Reminders.plan(s, now).filter(n => /Hoy vence/.test(n.title)).map(n => n.date));
  assert.deepEqual([...dueDays], ['2026-09-26', '2026-10-03']);
});

test('pagos: vencido avisa por la mañana; pagado o desactivado no avisa', () => {
  const now = new Date(2026, 8, 25, 7, 0);
  const s = billState([
    { id: 'v', name: 'Luz', amount: 80000, frequency: 'unico', dueDate: '2026-09-20' },
    { id: 'p', name: 'Agua', amount: 30000, frequency: 'unico', dueDate: '2026-09-28', paidAt: '2026-09-24' }
  ]);
  const list = Reminders.plan(s, now);
  assert.equal(list.length, 3, 'tres mañanas seguidas para el vencido');
  assert.ok(list.every(n => /Pago vencido: Luz/.test(n.title)));
  s.settings.reminders.bills.enabled = false;
  assert.equal(Reminders.plan(s, now).length, 0);
  assert.equal(Reminders.wanted(s), false);
});

test('mergeSettings conserva alarmas extra y avisos de pagos', () => {
  const merged = config.mergeSettings({ reminders: {
    extra: [{ id: 'a', time: '18:00', enabled: true }, { id: 'bad' }],
    bills: { daysBefore: 5 }
  } });
  assert.equal(merged.reminders.extra.length, 1);
  assert.equal(merged.reminders.bills.daysBefore, 5);
  assert.equal(merged.reminders.bills.enabled, true);
  assert.deepEqual([...merged.reminders.bills.dueTimes], ['08:00', '13:00', '19:00']);
});
