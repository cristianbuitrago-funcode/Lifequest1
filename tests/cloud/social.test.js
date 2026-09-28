// Modo social contra los emuladores de Firebase (con firestore.rules). npm run test:cloud
const test = require('node:test');
const assert = require('node:assert/strict');
const firebase = require('firebase/compat/app');
require('firebase/compat/auth');
require('firebase/compat/firestore');

globalThis.LifeQuest = globalThis.LifeQuest || {};
globalThis.LifeQuest.Social = { CLAN_MAX: 30, inviteCode: () => Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'X') };
require('../../www/js/infrastructure/social-provider.js');
const { createSocialProvider } = globalThis.LifeQuest.cloudProviders;

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
  await auth.signInWithCredential(firebase.auth.GoogleAuthProvider.credential(token(name + Date.now())));
  const uid = auth.currentUser.uid;
  return { uid, db, social: createSocialProvider(firebase, db, uid) };
}
const profile = (name, xp, extra) => Object.assign({ name, photo: null, level: 1 + Math.floor(xp / 100), totalXp: xp, weeklyXp: xp,
  weekKey: '2026-W40', streak: 2, achievements: 3, clanId: null, clanName: null }, extra || {});

test.after(async () => { await Promise.all(open.map(a => a.delete())); });

test('perfil público: se publica, se valida y aparece en el ranking', async () => {
  const a = await user('ana'), b = await user('beto');
  await a.social.publish(profile('Ana', 900));
  await b.social.publish(profile('Beto', 300));
  const top = await a.social.topGlobal(50);
  const names = top.map(p => p.name);
  assert.ok(names.indexOf('Ana') < names.indexOf('Beto'));
  const weekly = await b.social.topWeekly('2026-W40', 50);
  assert.ok(weekly.some(p => p.name === 'Ana'));
  // Nadie puede escribir el perfil de otro, ni meter datos privados o una "foto" no válida.
  await assert.rejects(b.db.collection('publicProfiles').doc(a.uid).set(profile('Hacker', 1)));
  await assert.rejects(a.social.publish(Object.assign(profile('Ana', 1), { bills: [] })));
  await assert.rejects(a.social.publish(profile('Ana', 1, { photo: 'javascript:alert(1)' })));
  await a.social.unpublish();
  assert.ok(!(await b.social.topGlobal(50)).some(p => p.name === 'Ana'));
});

test('clanes: crear, unirse con código, reglas de integrantes y salir', async () => {
  const owner = await user('duena'), friend = await user('amigo'), outsider = await user('otro');
  const clan = await owner.social.createClan({ name: 'Los Dorados', emoji: '🐉', description: 'Metas cada semana', open: false });
  assert.equal(clan.memberCount, 1);
  assert.equal(clan.ownerUid, owner.uid);
  assert.match(clan.code, /^.{6}$/);

  // Privado: no aparece en la lista de clanes abiertos, pero se encuentra con el código.
  assert.ok(!(await friend.social.listOpenClans(50)).some(c => c.id === clan.id));
  const found = await friend.social.findByCode(clan.code.toLowerCase());
  assert.equal(found.id, clan.id);
  const joined = await friend.social.joinClan(clan.id);
  assert.equal(joined.memberCount, 2);

  // Nadie puede meter a otro, sacar a otro ni editar el clan sin ser dueño.
  const ref = outsider.db.collection('clans').doc(clan.id);
  await assert.rejects(ref.update({ members: joined.members.concat('fantasma'), memberCount: 3 }));
  await assert.rejects(ref.update({ members: [owner.uid], memberCount: 1 }));
  await assert.rejects(friend.social.updateClan(clan.id, { name: 'Robado' }));
  const renamed = await owner.social.updateClan(clan.id, { name: 'Los Dorados FC', open: true });
  assert.equal(renamed.name, 'Los Dorados FC');
  assert.ok((await outsider.social.listOpenClans(50)).some(c => c.id === clan.id));

  // Integrantes con perfil público.
  await owner.social.publish(profile('Dueña', 500, { clanId: clan.id, clanName: 'Los Dorados FC' }));
  await friend.social.publish(profile('Amigo', 200, { clanId: clan.id, clanName: 'Los Dorados FC' }));
  const members = await outsider.social.members(await outsider.social.getClan(clan.id));
  assert.deepEqual(members.map(m => m.name).sort(), ['Amigo', 'Dueña']);

  // La dueña sale: la corona pasa al amigo; al salir el último, el clan y su código se borran.
  await owner.social.leaveClan(clan.id);
  const after = await friend.social.getClan(clan.id);
  assert.equal(after.ownerUid, friend.uid);
  assert.equal(after.memberCount, 1);
  await friend.social.leaveClan(clan.id);
  assert.equal(await friend.social.getClan(clan.id), null);
  assert.equal(await friend.social.findByCode(clan.code), null);
});

test('un clan no se puede crear a nombre de otro', async () => {
  const a = await user('uno'), b = await user('dos');
  await assert.rejects(a.db.collection('clans').add({ name: 'Falso', emoji: 'x', description: '', open: true,
    code: 'ABCDEF', ownerUid: b.uid, members: [b.uid], memberCount: 1 }));
});
