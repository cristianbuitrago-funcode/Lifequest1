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
