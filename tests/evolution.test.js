const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers');

async function app(){
  const LQ = loadCore();
  await LQ.store.init({ adapter: LQ.storage.createMemoryAdapter('evo'), onError: (e) => { throw e; } });
  return LQ;
}

test('meses: días, desplazamiento y nombre', async () => {
  const { Evolution: E } = await app();
  assert.equal(E.daysInMonth('2026-02'), 28);
  assert.equal(E.daysInMonth('2028-02'), 29);
  assert.equal(E.daysInMonth('2026-09'), 30);
  assert.equal(E.shiftMonth('2026-01', -1), '2025-12');
  assert.equal(E.shiftMonth('2026-12', 1), '2027-01');
  assert.equal(E.monthLabel('2026-09'), 'septiembre 2026');
});

test('rastreador: cuadrícula, hábitos por día y escalera de recompensas', async () => {
  const LQ = await app();
  const E = LQ.Evolution;
  const a = await LQ.store.addHabit({ title: 'Leer' });
  const b = await LQ.store.addHabit({ title: 'Agua' });
  const logA = {}, logB = {};
  for (let d = 1; d <= 15; d++) logA['2026-09-' + String(d).padStart(2, '0')] = true;
  for (let d = 1; d <= 10; d++) logB['2026-09-' + String(d).padStart(2, '0')] = true;
  logB['2026-08-31'] = true;                      // otro mes: no cuenta
  await LQ.store.updateHabit(a.id, { log: logA });
  await LQ.store.updateHabit(b.id, { log: logB });

  const t = E.tracker(LQ.state, '2026-09');
  assert.equal(t.days, 30);
  assert.equal(t.rows.length, 2);
  assert.equal(t.perDay[0], 2);                   // día 1: los dos
  assert.equal(t.perDay[12], 1);                  // día 13: solo Leer
  assert.equal(t.perDay[20], 0);
  assert.equal(t.total, 25);
  assert.equal(t.maxPerDay, 2);

  LQ.state.settings.habitMonths['2026-09'] = { rewards: ['Pizza', 'Cine', 'Zapatos'], claimed: { 20: 123 }, reflection: 'Buen mes' };
  const l = E.ladder(LQ.state.settings, '2026-09', t.total);
  assert.deepEqual([...l.milestones].map(m => [m.at, m.reached, !!m.claimedAt, m.reward]),
    [[20, true, true, 'Pizza'], [40, false, false, 'Cine'], [60, false, false, 'Zapatos']]);
  assert.equal(l.filled, 25);
  assert.equal(E.monthNotes(LQ.state.settings, '2026-10').reflection, '');
});

test('mapa de evolución: pilares por defecto, fuentes y nivel 1–10', async () => {
  const LQ = await app();
  const E = LQ.Evolution;
  // Sin configurar: un pilar por categoría (máx. 6), medido por misiones cumplidas.
  const def = E.evolution(LQ.state, '2026-09');
  assert.ok(def.length >= 1 && def.length <= 6);
  assert.equal(def[0].source.type, 'category');

  const h = await LQ.store.addHabit({ title: 'Correr' });
  await LQ.store.updateHabit(h.id, { log: { '2026-09-01': true, '2026-09-02': true, '2026-09-03': true, '2026-10-01': true } });
  const cat = LQ.state.settings.categories[0].id;
  await LQ.store.addCompletion({ questId: 'q', questTitle: 'x', categoryId: cat, date: '2026-09-05', xp: 10, coins: 1 });
  LQ.state.settings.evolution = {
    pillars: [
      { id: 'p1', name: 'Treino', color: '#f00', source: { type: 'habit', id: h.id }, meta: 12 },
      { id: 'p2', name: 'Trabajo', color: '#0f0', source: { type: 'category', id: cat }, meta: 4 },
      { id: 'p3', name: 'Renta extra', color: '#00f', source: { type: 'manual' }, meta: 10 }
    ],
    manual: { '2026-09': { p3: 25 } }
  };
  const evo = E.evolution(LQ.state, '2026-09');
  assert.deepEqual([...evo].map(p => [p.done, p.level]), [[3, 3], [1, 3], [25, 10]]);   // 3/12→2.5→3 · 1/4→2.5→3 · pasa la meta → 10
  assert.equal(E.level(0, 10), 0);
  assert.equal(E.level(1, 100), 1, 'algo hecho siempre marca al menos 1');
  assert.equal(E.sourceLabel(evo[0], LQ.state), 'Días de "Correr"');
});

test('los ajustes nuevos se guardan, se recargan y viajan en la copia de seguridad', async () => {
  const LQ = loadCore();
  const adapter = LQ.storage.createMemoryAdapter('evo2');
  await LQ.store.init({ adapter, onError: (e) => { throw e; } });
  LQ.state.settings.habitMonths['2026-09'] = { rewards: ['A', '', ''], claimed: {}, reflection: 'r' };
  LQ.state.settings.evolution = { pillars: [{ id: 'x', name: 'Sueño', color: '#123', source: { type: 'manual' }, meta: 30 }], manual: { '2026-09': { x: 7 } } };
  await LQ.store.saveSettings();
  await LQ.store.load();
  assert.equal(LQ.state.settings.habitMonths['2026-09'].reflection, 'r');
  assert.equal(LQ.state.settings.evolution.pillars[0].name, 'Sueño');
  assert.equal(LQ.state.settings.evolution.manual['2026-09'].x, 7);
  // Datos antiguos sin estos campos: valores por defecto.
  const merged = LQ.config.mergeSettings({ theme: 'dark' });
  assert.deepEqual(JSON.parse(JSON.stringify(merged.habitMonths)), {});
  assert.equal(merged.evolution.pillars, null);
});
