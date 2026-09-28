const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function load(){
  const store = {};
  const listeners = {};
  const ctx = {
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    window: { addEventListener: (ev, fn) => { listeners[ev] = fn; } },
    console: { error: () => {}, log: () => {} },
    navigator: { userAgent: 'Prueba/1.0 (Android 15; Nubia)' },
    Date, JSON, Error, String, Array, Object
  };
  ctx.globalThis = ctx;
  ctx.LifeQuest = { config: { APP_VERSION: '9.9.9' }, app: { router: { current: () => 'habitos' } } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../www/js/core/errors.js'), 'utf8'), ctx);
  return { LQ: ctx.LifeQuest, listeners, ctx };
}

test('registro de errores: guarda, agrupa repetidos, ignora ruido y arma el informe', () => {
  const { LQ, listeners, ctx } = load();
  assert.equal(LQ.errors.count(), 0);
  listeners.error({ message: 'x is not a function', error: { stack: 'TypeError: x\n at habitos.js:10' } });
  listeners.error({ message: 'x is not a function', error: { stack: '' } });          // repetido → ×2
  listeners.unhandledrejection({ reason: new Error('sin red') });
  ctx.console.error('LifeQuest: error al guardar', new Error('disco lleno'));
  listeners.error({ message: 'Failed to load resource: net::ERR_CERT_AUTHORITY_INVALID' }); // ruido
  const list = LQ.errors.list();
  assert.equal(list.length, 3);
  assert.equal(list[0].n, 2);
  assert.equal(list[0].tab, 'habitos');
  const r = LQ.errors.report();
  assert.match(r, /Versión: 9\.9\.9/);
  assert.match(r, /x is not a function ×2|×2\n  x is not a function/);
  assert.match(r, /disco lleno/);
  assert.match(r, /Nubia/);
  LQ.errors.clear();
  assert.equal(LQ.errors.count(), 0);
});
