const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers');

async function freshStore(adapter){
  const LQ = loadCore();
  const a = adapter || LQ.storage.createMemoryAdapter('test');
  await LQ.store.init({ adapter: a, onError: (e) => { throw e; } });
  return { LQ, adapter: a };
}

test('primer arranque siembra misiones de ejemplo una sola vez', async () => {
  const { LQ, adapter } = await freshStore();
  assert.equal(LQ.state.quests.length, 4);
  for (const q of [...LQ.state.quests]) await LQ.store.deleteQuest(q.id);

  const again = await freshStore(adapter);
  assert.equal(again.LQ.state.quests.length, 0, 'no debe volver a sembrar tras borrar todo');
});

test('los datos persisten entre sesiones', async () => {
  const { LQ, adapter } = await freshStore();
  const q = await LQ.store.addQuest({ title: 'Leer', difficulty: 'media', recurrence: 'unica' });
  const r = await LQ.Game.completeQuest(q.id);
  assert.equal(r.xp, 25);
  const h = await LQ.store.addHabit({ title: 'Meditar' });
  await LQ.Game.habitCheckIn(h.id);
  await LQ.store.addFinance({ type: 'gasto', amount: 12.5, categoryId: 'hogar', date: '2026-01-05' });
  LQ.state.settings.theme = 'dark';
  await LQ.store.saveSettings();

  const { LQ: L2 } = await freshStore(adapter);
  assert.equal(L2.state.character.totalXp, 25);
  assert.equal(L2.state.character.coins, 5);
  assert.equal(L2.state.character.streak, 1);
  assert.equal(L2.state.quests.find(x => x.id === q.id).active, false);
  assert.equal(L2.state.completions.length, 1);
  assert.equal(L2.state.habits[0].title, 'Meditar');
  assert.equal(Object.keys(L2.state.habits[0].log).length, 1);
  assert.equal(L2.state.finance[0].amount, 12.5);
  assert.equal(L2.state.settings.theme, 'dark');
});

test('borrar deja una lápida para sincronización', async () => {
  const { LQ, adapter } = await freshStore();
  const f = await LQ.store.addFinance({ type: 'ingreso', amount: 100, categoryId: 'trabajo' });
  await LQ.store.deleteFinance(f.id);
  const tombs = await adapter.getTombstones();
  assert.equal(tombs.length, 1);
  assert.equal(tombs[0].id, f.id);
  assert.equal(tombs[0].collection, 'finance');
});

test('exportar e importar conserva los datos', async () => {
  const { LQ } = await freshStore();
  await LQ.store.addHabit({ title: 'Correr' });
  LQ.state.character.coins = 42;
  await LQ.store.saveCharacter();
  const backup = JSON.parse(JSON.stringify(await LQ.store.exportData()));

  const { LQ: L2 } = await freshStore();
  await L2.store.importData(backup);
  assert.equal(L2.state.character.coins, 42);
  assert.equal(L2.state.habits.length, 1);
  assert.equal(L2.state.quests.length, 4);
  await assert.rejects(() => L2.store.importData({ foo: 1 }));
});

test('applyRemote: gana el cambio más reciente y respeta borrados', async () => {
  const { LQ: A } = await freshStore();
  const { LQ: B } = await freshStore();

  // B recibe todo lo de A
  await B.store.applyRemote(await A.store.changesSince(null));
  const shared = A.state.quests[0];
  assert.ok(B.state.quests.find(q => q.id === shared.id));

  // A renombra; B aplica el cambio más nuevo
  const since = Date.now();
  await new Promise(r => setTimeout(r, 5));
  await A.store.updateQuest(shared.id, { title: 'Renombrada' });
  await B.store.applyRemote(await A.store.changesSince(since));
  assert.equal(B.state.quests.find(q => q.id === shared.id).title, 'Renombrada');

  // A borra; B también la borra
  await A.store.deleteQuest(shared.id);
  await B.store.applyRemote(await A.store.changesSince(since));
  assert.equal(B.state.quests.find(q => q.id === shared.id), undefined);
});

test('checkMissedDaily castiga misiones diarias incumplidas ayer', async () => {
  const { LQ } = await freshStore();
  const { utils } = LQ;
  LQ.state.character.coins = 50;
  const q = await LQ.store.addQuest({ title: 'Agua', recurrence: 'diaria' });
  await LQ.store.updateQuest(q.id, { createdAt: utils.fmtDate(utils.addDays(new Date(), -3)) });
  for (const other of LQ.state.quests.filter(x => x.id !== q.id)) await LQ.store.deleteQuest(other.id);
  const r = await LQ.Game.checkMissedDaily();
  assert.equal(r.punished, true);
  assert.equal(LQ.state.character.coins, 40);
  const r2 = await LQ.Game.checkMissedDaily();
  assert.equal(r2.punished, false, 'solo una vez por día');
});
