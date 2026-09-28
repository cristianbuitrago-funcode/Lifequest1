// Familia (supervisión parental) contra los emuladores de Firebase (con firestore.rules). npm run test:cloud
const test = require('node:test');
const assert = require('node:assert/strict');
const firebase = require('firebase/compat/app');
require('firebase/compat/auth');
require('firebase/compat/firestore');

globalThis.LifeQuest = globalThis.LifeQuest || {};
let seq = 0;
globalThis.LifeQuest.Social = Object.assign(globalThis.LifeQuest.Social || {}, {
  inviteCode: () => ('F' + Date.now().toString(36).toUpperCase() + (seq++)).slice(-6).padStart(6, 'Q')
});
require('../../www/js/infrastructure/family-provider.js');
const { createFamilyProvider } = globalThis.LifeQuest.cloudProviders;

const open = [];
const token = (sub) => JSON.stringify({ sub, email: sub + '@example.com', email_verified: true });
async function user(name){
  const app = firebase.initializeApp({ apiKey: 'demo-key', projectId: 'demo-lifequest', appId: '1:1:web:1' }, name + Math.random());
  const auth = app.auth();
  auth.useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
  const db = app.firestore();
  db.useEmulator('127.0.0.1', 8085);
  db.settings({ ignoreUndefinedProperties: true, merge: true });
  open.push(app);
  await auth.signInWithCredential(firebase.auth.GoogleAuthProvider.credential(token(name + Date.now() + Math.random())));
  const uid = auth.currentUser.uid;
  return { uid, db, fam: createFamilyProvider(firebase, db, uid) };
}
const PIN = { salt: 'abc', hash: '1234abcd' };
const progress = (name, extra) => Object.assign({ name, photo: null, level: 3, totalXp: 420, streak: 5, today: '2026-09-28',
  quests: [{ title: 'Leer', done: true }], habits: [], pillars: [], recent: [] }, extra || {});

test.after(async () => { await Promise.all(open.map(a => a.delete())); });

test('vincular: el padre crea el código, el menor lo usa y el padre ve su progreso', async () => {
  const mama = await user('mama'), nino = await user('nino'), otro = await user('otro');
  const code = await mama.fam.createInvite('Mamá', PIN);
  const inv = await nino.fam.readInvite(code);
  assert.equal(inv.parentName, 'Mamá');
  assert.equal(inv.pinHash, PIN.hash);

  await nino.fam.accept(inv, 'Tomás');
  assert.equal(await nino.fam.readInvite(code), null, 'el código es de un solo uso');
  const kids = await mama.fam.children();
  assert.deepEqual(kids.map(k => [k.id, k.childName]), [[nino.uid, 'Tomás']]);
  assert.deepEqual((await nino.fam.parents()).map(p => p.id), [mama.uid]);

  await nino.fam.publish(progress('Tomás'));
  const seen = await mama.fam.progress(nino.uid);
  assert.equal(seen.level, 3);
  assert.equal(seen.quests[0].title, 'Leer');

  // Un extraño no puede leer el progreso ni la lista de padres.
  await assert.rejects(otro.fam.progress(nino.uid));
  await assert.rejects(otro.db.collection('families').doc(nino.uid).collection('parents').get());
  // Ni los datos privados del menor (finanzas, misiones…), ni siquiera sus padres.
  await assert.rejects(mama.db.collection('users').doc(nino.uid).collection('finance').get());
});

test('no se puede fingir ser hijo de alguien sin su código', async () => {
  const papa = await user('papa'), intruso = await user('intruso');
  const code = await papa.fam.createInvite('Papá', PIN);
  // Intenta vincularse con un código inexistente o de otro padre.
  const fake = { code: 'ZZZZZZ', parentUid: papa.uid, parentName: 'Papá' };
  await assert.rejects(intruso.fam.accept(fake, 'Intruso'));
  const wrong = { code, parentUid: intruso.uid, parentName: 'x' };
  await assert.rejects(intruso.db.collection('parentLinks').doc(papa.uid).collection('children').doc(intruso.uid)
    .set({ childName: 'x', invite: 'ZZZZZZ', since: 1 }));
  // Nadie más que el padre puede crear invitaciones a su nombre.
  await assert.rejects(intruso.db.collection('familyInvites').doc('ABCDEF').set({ parentUid: papa.uid, parentName: 'x', salt: 'a', pinHash: 'b', createdAt: 1 }));
  assert.ok(wrong);
  // El padre puede anular su código.
  await papa.fam.cancelInvite(code);
  assert.equal(await intruso.fam.readInvite(code), null);
});

test('desvincular: el padre deja de ver el progreso; el menor se entera', async () => {
  const mama = await user('mama2'), nina = await user('nina');
  const inv = await nina.fam.readInvite(await mama.fam.createInvite('Mamá', PIN));
  await nina.fam.accept(inv, 'Sara');
  await nina.fam.publish(progress('Sara'));

  let lastParents = null;
  const stop = nina.fam.watchParents(list => { lastParents = list; });
  for (let i = 0; i < 40 && !(lastParents && lastParents.length === 1); i++) await new Promise(r => setTimeout(r, 50));
  assert.equal(lastParents.length, 1);

  await mama.fam.unlinkChild(nina.uid);
  for (let i = 0; i < 40 && lastParents.length !== 0; i++) await new Promise(r => setTimeout(r, 50));
  assert.equal(lastParents.length, 0, 'el menor ve que ya no tiene padres vinculados');
  stop();
  assert.deepEqual(await mama.fam.children(), []);
  await assert.rejects(mama.fam.progress(nina.uid), 'ya no puede leer su progreso');
});

test('el menor se desvincula (con PIN en la app) y borrar todo limpia los enlaces', async () => {
  const papa = await user('papa3'), nino = await user('nino3');
  await nino.fam.accept(await nino.fam.readInvite(await papa.fam.createInvite('Papá', PIN)), 'Leo');
  await nino.fam.leave(papa.uid);
  assert.deepEqual(await papa.fam.children(), []);

  await nino.fam.accept(await nino.fam.readInvite(await papa.fam.createInvite('Papá', PIN)), 'Leo');
  await nino.fam.publish(progress('Leo'));
  await nino.fam.deleteAll();
  assert.deepEqual(await papa.fam.children(), []);
  assert.equal((await nino.db.collection('familyProgress').doc(nino.uid).get()).exists, false);
});
