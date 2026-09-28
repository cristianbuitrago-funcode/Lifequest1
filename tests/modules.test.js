const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers');

async function app(name){
  const LQ = loadCore();
  await LQ.store.init({ adapter: LQ.storage.createMemoryAdapter(name || 'mod'), onError: (e) => { throw e; } });
  return LQ;
}

test('secciones: todas visibles por defecto; los datos antiguos no cambian', async () => {
  const { Modules: M, state, config } = await app();
  ['finanzas', 'tienda', 'social', 'decidia', 'resumen', 'misiones', 'habitos', 'ajustes']
    .forEach(id => assert.equal(M.enabled(state.settings, id), true, id));
  const old = config.mergeSettings({ theme: 'dark' });
  assert.equal(M.enabled(old, 'finanzas'), true);
});

test('ocultar secciones: se guarda y quita los avisos de pagos si se oculta Finanzas', async () => {
  const LQ = await app('mod2');
  LQ.state.settings.modules.tienda = false;
  LQ.state.settings.modules.finanzas = false;
  await LQ.store.saveSettings();
  await LQ.store.load();
  assert.equal(LQ.Modules.enabled(LQ.state.settings, 'tienda'), false);
  assert.equal(LQ.Modules.enabled(LQ.state.settings, 'finanzas'), false);
  assert.equal(LQ.Modules.enabled(LQ.state.settings, 'misiones'), true, 'las básicas no se pueden ocultar');
  await LQ.store.addRecord('bills', { name: 'Internet', amount: 100000, dueDate: LQ.utils.fmtDate(new Date(Date.now() + 2 * 86400000)), frequency: 'mensual', active: true });
  assert.equal(LQ.Reminders.wanted(LQ.state), false, 'sin Finanzas no hay avisos de pagos');
  LQ.state.settings.modules.finanzas = true;
  assert.equal(LQ.Reminders.wanted(LQ.state), true);
});

test('modo menor manda: Finanzas oculta y Social visible pase lo que pase', async () => {
  const { Modules: M, state } = await app('mod3');
  state.settings.modules.social = false;
  state.settings.modules.finanzas = true;
  state.settings.family.childMode = true;
  assert.equal(M.enabled(state.settings, 'finanzas'), false);
  assert.equal(M.enabled(state.settings, 'social'), true);
});
