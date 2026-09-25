const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers');

// Servidor en memoria con reloj propio: imita el cursor por `syncedAt` de Firestore.
function createFakeServer(){
  const data = { docs: new Map(), tombstones: new Map() };
  let clock = 1000;
  let writes = 0;
  const table = (name) => data[name] || (data[name] = new Map());
  const copy = (o) => JSON.parse(JSON.stringify(o));
  return {
    get writes(){ return writes; },
    count(name){ return table(name).size; },
    provider(uid){
      return {
        name: 'fake', uid,
        async pull(cursor){
          const since = cursor || 0;
          let max = cursor || 0;
          const read = (name) => [...table(name).entries()]
            .filter(([, v]) => v.syncedAt > since)
            .map(([k, v]) => { max = Math.max(max, v.syncedAt); return [k, copy(v.data)]; });
          const out = { docs: {}, records: {}, tombstones: [], cursor: null };
          read('docs').forEach(([k, d]) => { out.docs[k] = d; });
          ['quests', 'completions', 'habits', 'finance'].forEach(c => { out.records[c] = read(c).map(([, d]) => d); });
          out.tombstones = read('tombstones').map(([, d]) => d);
          out.cursor = max || null;
          return out;
        },
        async push(changes){
          const put = (name, key, d) => { writes++; table(name).set(key, { data: copy(d), syncedAt: ++clock }); };
          Object.entries(changes.docs).forEach(([k, d]) => put('docs', k, d));
          Object.entries(changes.records).forEach(([c, list]) => list.forEach(r => put(c, r.id, r)));
          changes.tombstones.forEach(t => { put('tombstones', t.key, t); table(t.collection).delete(t.id); });
        }
      };
    }
  };
}

async function device(server, uid){
  const LQ = loadCore();
  await LQ.store.init({ adapter: LQ.storage.createMemoryAdapter('d'), onError: (e) => { throw e; } });
  if (server) LQ.sync.register(server.provider(uid || 'user-1'));
  return LQ;
}

const tick = () => new Promise(r => setTimeout(r, 3));

test('un dispositivo nuevo recibe los datos de la cuenta sin duplicar las misiones de ejemplo', async () => {
  const server = createFakeServer();
  const A = await device(server);
  const h = await A.store.addHabit({ title: 'Meditar' });
  await A.Game.habitCheckIn(h.id);
  await A.sync.syncNow();

  const B = await device(server);
  assert.equal(B.store.isPristine(), true);
  await B.sync.syncNow();
  assert.equal(B.state.quests.length, 4, 'solo las 4 misiones de A, no 8');
  assert.equal(B.state.habits[0].title, 'Meditar');
  assert.equal(server.count('quests'), 4);
});

test('los cambios viajan en ambos sentidos y los borrados se propagan', async () => {
  const server = createFakeServer();
  const A = await device(server);
  await A.sync.syncNow();
  const B = await device(server);
  await B.sync.syncNow();

  // B completa una misión y registra un gasto
  await tick();
  const quest = B.state.quests.find(q => q.recurrence === 'diaria');
  await B.Game.completeQuest(quest.id);
  const f = await B.store.addFinance({ type: 'gasto', amount: 20, categoryId: 'hogar' });
  await B.sync.syncNow();

  await A.sync.syncNow();
  assert.equal(A.state.character.totalXp, B.state.character.totalXp);
  assert.equal(A.state.completions.length, 1);
  assert.equal(A.state.quests.find(q => q.id === quest.id).lastCompletedDate, quest.lastCompletedDate);
  assert.equal(A.state.finance.length, 1);

  // A borra el gasto; B lo pierde también
  await tick();
  await A.store.deleteFinance(f.id);
  await A.sync.syncNow();
  await B.sync.syncNow();
  assert.equal(B.state.finance.length, 0);
  assert.equal(server.count('finance'), 0);
});

test('un dispositivo con datos propios los fusiona con los de la cuenta', async () => {
  const server = createFakeServer();
  const A = await device(server);
  await A.store.addHabit({ title: 'Leer' });
  await A.sync.syncNow();

  const B = await device(server);
  await B.store.addHabit({ title: 'Correr' });
  await B.sync.syncNow();
  await A.sync.syncNow();

  const titles = (LQ) => LQ.state.habits.map(h => h.title).sort().join(',');
  assert.equal(titles(A), 'Correr,Leer');
  assert.equal(titles(B), 'Correr,Leer');
});

test('no devuelve al servidor lo que acaba de bajar', async () => {
  const server = createFakeServer();
  const A = await device(server);
  await A.sync.syncNow();
  const before = server.writes;

  const B = await device(server);
  await B.sync.syncNow();
  assert.equal(server.writes, before, 'B no tiene nada propio que subir');

  await A.sync.syncNow();
  assert.equal(server.writes, before, 'A tampoco');
});

test('gana el cambio más reciente en conflictos', async () => {
  const server = createFakeServer();
  const A = await device(server);
  await A.sync.syncNow();
  const B = await device(server);
  await B.sync.syncNow();
  const id = A.state.quests[0].id;

  await tick();
  await A.store.updateQuest(id, { title: 'Versión A' });
  await tick();
  await B.store.updateQuest(id, { title: 'Versión B' });
  await A.sync.syncNow();
  await B.sync.syncNow();
  await A.sync.syncNow();
  assert.equal(A.state.quests.find(q => q.id === id).title, 'Versión B');
  assert.equal(B.state.quests.find(q => q.id === id).title, 'Versión B');
});

test('sin proveedor, syncNow no hace nada', async () => {
  const A = await device(null);
  assert.equal(await A.sync.syncNow(), null);
});
