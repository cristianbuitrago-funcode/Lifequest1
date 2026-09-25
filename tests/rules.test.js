const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers');

const LQ = loadCore();
const { Rules, config, utils } = LQ;

test('levelInfo: sube de nivel al alcanzar la XP necesaria', () => {
  const cfg = config.defaultSettings();
  assert.equal(Rules.levelInfo(0, cfg).level, 1);
  assert.equal(Rules.levelInfo(79, cfg).level, 1);
  const l2 = Rules.levelInfo(80, cfg);
  assert.equal(l2.level, 2);
  assert.equal(l2.xpIntoLevel, 0);
  assert.equal(l2.xpForNext, Math.round(80 * Math.pow(2, 1.35)));
});

test('reward: usa la tabla y cae a un valor por defecto', () => {
  const cfg = config.defaultSettings();
  assert.deepEqual({...Rules.reward('epica', cfg)}, {xp:100, coins:30});
  assert.deepEqual({...Rules.reward('desconocida', cfg)}, {xp:10, coins:2});
});

test('nextStreak', () => {
  assert.equal(Rules.nextStreak('2026-01-02', '2026-01-02', '2026-01-01'), null);
  assert.equal(Rules.nextStreak('2026-01-01', '2026-01-02', '2026-01-01'), 'inc');
  assert.equal(Rules.nextStreak('2025-12-20', '2026-01-02', '2026-01-01'), 'reset');
});

test('habitStreakInfo: cuenta días consecutivos hasta ayer si hoy no está marcado', () => {
  const log = {};
  for (let i = 1; i <= 7; i++) log[utils.fmtDate(utils.addDays(new Date(), -i))] = true;
  const info = Rules.habitStreakInfo(log);
  assert.equal(info.streak, 7);
  assert.equal(info.tier.label, 'Llama');
  assert.equal(info.nextTier.label, 'Hoguera');
});

test('fmtDate usa la fecha local, no UTC', () => {
  const d = new Date(2026, 0, 31, 23, 30); // 31 ene, 23:30 hora local
  assert.equal(utils.fmtDate(d), '2026-01-31');
});
