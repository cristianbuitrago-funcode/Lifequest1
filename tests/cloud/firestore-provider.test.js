// Integración con los emuladores de Firebase. Ejecutar con: npm run test:cloud
const test = require('node:test');
const assert = require('node:assert/strict');
const firebase = require('firebase/compat/app');
require('firebase/compat/auth');
require('firebase/compat/firestore');
const { loadCore } = require('../helpers');

// El núcleo corre en un contexto vm con otro Object.prototype, y Firestore solo
// acepta objetos planos del contexto principal: el proveedor se carga aquí.
globalThis.LifeQuest = { storage: { COLLECTIONS: ['quests', 'completions', 'habits', 'finance', 'bills', 'allocations', 'inventory', 'shopProducts'] } };
require('../../www/js/cloud/firestore-provider.js');
const { createFirestoreProvider } = globalThis.LifeQuest.cloudProviders;

const token = (sub) => JSON.stringify({ sub, email: sub + '@example.com', email_verified: true });

async function connect(name, uid){
  const app = firebase.initializeApp({ apiKey: 'demo-key', projectId: 'demo-lifequest', appId: '1:1:web:1' }, name);
  const auth = app.auth();
  auth.useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
  const db = app.firestore();
  db.useEmulator('127.0.0.1', 8085);
  db.settings({ ignoreUndefinedProperties: true, merge: true });
  open.push(app);
  await auth.signInWithCredential(firebase.auth.GoogleAuthProvider.credential(token(uid)));
  return { app, auth, db, uid: auth.currentUser.uid };
}

const open = [];

async function device(conn){
  const LQ = loadCore();
  await LQ.store.init({ adapter: LQ.storage.createMemoryAdapter('d'), onError: (e) => { throw e; } });
  const provider = createFirestoreProvider(firebase, conn.db, conn.uid);
  const push = provider.push;
  provider.push = (changes) => push(JSON.parse(JSON.stringify(changes)));
  LQ.sync.register(provider);
  return LQ;
}

test.after(() => Promise.all(open.map(app => app.delete())));

test('dos dispositivos sincronizan a través de Firestore', async () => {
  const run = Date.now().toString(36);
  const c1 = await connect('a' + run, 'user-' + run);
  const c2 = await connect('b' + run, 'user-' + run);
  const A = await device(c1);
  const B = await device(c2);

  const h = await A.store.addHabit({ title: 'Meditar' });
  await A.Game.habitCheckIn(h.id);
  await A.sync.syncNow();

  await B.sync.syncNow();
  assert.equal(B.state.quests.length, 4);
  assert.equal(B.state.habits[0].title, 'Meditar');

  const q = B.state.quests.find(x => x.recurrence === 'diaria');
  await B.Game.completeQuest(q.id);
  await B.store.deleteHabit(h.id);
  await B.sync.syncNow();

  await A.sync.syncNow();
  assert.equal(A.state.habits.length, 0);
  assert.equal(A.state.completions.length, 1);
  assert.equal(A.state.character.totalXp, B.state.character.totalXp);

  const cloudHabits = await c1.db.collection('users').doc(c1.uid).collection('habits').get();
  assert.equal(cloudHabits.size, 0, 'el hábito borrado no queda en la nube');

});

test('las reglas impiden leer datos de otra cuenta', async () => {
  const run = Date.now().toString(36);
  const owner = await connect('o' + run, 'owner-' + run);
  const A = await device(owner);
  await A.sync.syncNow();

  const other = await connect('x' + run, 'other-' + run);
  await assert.rejects(
    () => other.db.collection('users').doc(owner.uid).collection('quests').get(),
    (e) => e.code === 'permission-denied'
  );
});
