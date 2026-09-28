const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers');

async function app(){
  const LQ = loadCore();
  await LQ.store.init({ adapter: LQ.storage.createMemoryAdapter('fam'), onError: (e) => { throw e; } });
  return LQ;
}

test('PIN: se valida, se guarda con sal y se comprueba', async () => {
  const { Family: F, state } = await app();
  assert.equal(F.validPin('1234'), true);
  assert.equal(F.validPin('12a4'), false);
  assert.equal(F.validPin('123'), false);
  const p = F.makePin('4821');
  assert.notEqual(p.hash, '4821');
  assert.equal(F.hashPin('4821', p.salt), p.hash);
  assert.notEqual(F.hashPin('4821', p.salt + 'x'), p.hash, 'la sal cambia el resultado');
  state.settings.family.pins = [p];
  assert.equal(F.checkPin(state.settings, '4821'), true);
  assert.equal(F.checkPin(state.settings, '4822'), false);
  assert.equal(F.checkPin(state.settings, ''), false);
});

test('modo menor y ajustes: por defecto apagado y se conserva al recargar', async () => {
  const LQ = loadCore();
  const adapter = LQ.storage.createMemoryAdapter('fam2');
  await LQ.store.init({ adapter, onError: (e) => { throw e; } });
  assert.equal(LQ.Family.isChildMode(LQ.state.settings), false);
  LQ.state.settings.family = { childMode: true, pins: [LQ.Family.makePin('1111')], parents: [{ uid: 'p1', name: 'Mamá' }] };
  await LQ.store.saveSettings();
  await LQ.store.load();
  assert.equal(LQ.Family.isChildMode(LQ.state.settings), true);
  assert.equal(LQ.state.settings.family.parents[0].name, 'Mamá');
  assert.equal(LQ.Family.checkPin(LQ.state.settings, '1111'), true);
  assert.equal(LQ.config.mergeSettings({}).family.childMode, false);
  assert.equal(LQ.config.mergeSettings({ family: { childMode: 'sí' } }).family.childMode, false, 'solo true activa');
});

test('resumen para los padres: progreso sin finanzas', async () => {
  const LQ = await app();
  const now = new Date(2026, 8, 28, 18, 0);
  const today = '2026-09-28';
  LQ.state.profile.displayName = 'Tomás';
  const h = await LQ.store.addHabit({ title: 'Leer' });
  await LQ.store.updateHabit(h.id, { log: { '2026-09-27': true, [today]: true } });
  const daily = LQ.state.quests.filter(q => q.recurrence === 'diaria');
  await LQ.store.updateQuest(daily[0].id, { lastCompletedDate: today });
  await LQ.store.addFinance({ type: 'gasto', amount: 50000, categoryId: 'hogar', note: 'secreto' });

  const p = LQ.Family.buildProgress(LQ.state, now);
  assert.equal(p.name, 'Tomás');
  assert.equal(p.today, today);
  assert.equal(p.quests.filter(q => q.done).length, 1);
  assert.equal(p.habits[0].title, 'Leer');
  assert.equal(p.habits[0].doneToday, true);
  assert.equal(p.habits[0].month, 2);
  assert.equal(p.month.key, '2026-09');
  assert.ok(p.pillars.length >= 1);
  const json = JSON.stringify(p);
  assert.ok(!/50000|secreto|finance|gasto/.test(json), 'no incluye nada de finanzas');

  const s = LQ.Family.todaySummary(p, now);
  assert.deepEqual([s.stale, s.quests.done, s.habits.done], [false, 1, 1]);
  assert.equal(LQ.Family.todaySummary(p, new Date(2026, 8, 29)).stale, true, 'de otro día: desactualizado');
});

test('invitaciones viejas no se aceptan', async () => {
  const { Family: F } = await app();
  const now = Date.now();
  assert.equal(F.inviteFresh({ createdAt: now - 86400000 }, now), true);
  assert.equal(F.inviteFresh({ createdAt: now - 8 * 86400000 }, now), false);
  assert.equal(F.inviteFresh(null, now), false);
});

test('modo menor: sin la categoría Finanzas en misiones ni en el mapa de evolución', async () => {
  const LQ = await app();
  const ids = (list) => [...list].map(c => c.id);
  assert.ok(ids(LQ.Family.visibleCategories(LQ.state.settings)).includes('finanzas'));
  LQ.state.settings.family.childMode = true;
  assert.ok(!ids(LQ.Family.visibleCategories(LQ.state.settings)).includes('finanzas'));
  assert.ok(![...LQ.Evolution.defaultPillars(LQ.state.settings)].some(p => p.source.id === 'finanzas'));
});
