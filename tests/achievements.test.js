const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers');

async function fresh(){
  const LQ = loadCore();
  await LQ.store.init({ adapter: LQ.storage.createMemoryAdapter('a'), onError: (e) => { throw e; } });
  return LQ;
}

test('sin actividad solo hay logros bloqueados', async () => {
  const LQ = await fresh();
  const list = LQ.Achievements.progress(LQ.state);
  assert.ok(list.length >= 20);
  assert.equal(new Set(list.map(a => a.id)).size, list.length, 'ids únicos');
  assert.equal(LQ.Achievements.newlyEarned(LQ.state).length, 0);
});

test('completar una misión desbloquea "Primera misión" una sola vez y paga monedas', async () => {
  const LQ = await fresh();
  const q = LQ.state.quests[0];
  const r = await LQ.Game.completeQuest(q.id);
  const coinsBefore = LQ.state.character.coins;
  const got = await LQ.Achievements.claim();
  assert.deepEqual([...got.map(a => a.id)], ['mision-1']);
  assert.equal(LQ.state.character.coins, coinsBefore + 5);
  assert.ok(LQ.state.profile.achievements['mision-1']);
  assert.equal((await LQ.Achievements.claim()).length, 0, 'no se cobra dos veces');
  assert.ok(r.xp > 0);
});

test('perfil con nombre y foto, racha y monedas', async () => {
  const LQ = await fresh();
  LQ.state.profile.displayName = 'Cris';
  LQ.state.profile.photo = 'data:image/jpeg;base64,AAAA';
  LQ.state.character.streak = 7;
  LQ.state.character.coins = 1200;
  const ids = (await LQ.Achievements.claim()).map(a => a.id).sort();
  assert.deepEqual([...ids], ['monedas-1000', 'perfil', 'racha-3', 'racha-7']);
  assert.equal(LQ.state.profile.stats.bestStreak, 7);
});

test('racha más larga de un hábito', async () => {
  const LQ = await fresh();
  const log = { '2026-09-01': true, '2026-09-02': true, '2026-09-03': true, '2026-09-05': true, '2026-09-30': true, '2026-10-01': true };
  assert.equal(LQ.Achievements.longestRun(log), 3);
  assert.equal(LQ.Achievements.longestRun({}), 0);
});

test('mergeProfile conserva nombre, foto, logros y datos sociales; descarta fotos no válidas', async () => {
  const LQ = await fresh();
  const p = LQ.config.mergeProfile({ displayName: '  Ana  María  que tiene un nombre larguísimo ', photo: 'javascript:alert(1)',
    achievements: { 'mision-1': '2026-09-01' }, social: { public: true, clanId: 'c1', claimedWeeks: { '2026-W39': true } } });
  assert.equal(p.displayName.length <= 30, true);
  assert.equal(p.photo, null);
  assert.equal(p.achievements['mision-1'], '2026-09-01');
  assert.equal(p.social.public, true);
  assert.equal(p.social.clanId, 'c1');
  assert.equal(p.social.claimedWeeks['2026-W39'], true);
});

test('semana ISO, XP semanal y reto de clan', async () => {
  const LQ = await fresh();
  const S = LQ.Social;
  assert.equal(S.weekKey(new Date(2026, 8, 28)), '2026-W40');   // lunes 28 sept 2026
  assert.equal(S.weekKey(new Date(2026, 8, 27)), '2026-W39');   // domingo
  assert.equal(S.weekKey(new Date(2027, 0, 1)), '2026-W53');
  assert.equal(S.weekStart(new Date(2026, 8, 30)), '2026-09-28');
  LQ.state.completions.push({ date: '2026-09-27', xp: 50 }, { date: '2026-09-28', xp: 25 }, { date: '2026-09-30', xp: 10 });
  assert.equal(S.weeklyXp(LQ.state, new Date(2026, 8, 30)), 35);
  const pub = S.publicProfile(LQ.state, new Date(2026, 8, 30));
  assert.equal(pub.name, 'Aventurero');
  assert.equal(pub.weekKey, '2026-W40');
  assert.equal(pub.weeklyXp, 35);
  assert.ok(!('finance' in pub) && !('quests' in pub));
  const ch = S.clanChallenge([{ weekKey: '2026-W40', weeklyXp: 500 }, { weekKey: '2026-W39', weeklyXp: 900 }], new Date(2026, 8, 30));
  assert.equal(ch.goal, 800);
  assert.equal(ch.total, 500, 'solo cuenta la semana actual');
  assert.equal(ch.done, false);
  assert.match(S.inviteCode(), /^[A-HJ-NP-Z2-9]{6}$/);
});
