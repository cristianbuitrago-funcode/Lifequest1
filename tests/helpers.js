// Carga los scripts del núcleo (sin DOM) en un contexto aislado de Node.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CORE = [
  'js/config.js', 'js/utils.js', 'js/rules.js', 'js/state.js',
  'js/storage/adapters.js', 'js/store.js', 'js/sync/sync.js', 'js/game.js',
  'js/reminders.js', 'js/cloud/firestore-provider.js'
];

function loadCore(){
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, crypto: globalThis.crypto });
  ctx.globalThis = ctx;
  for (const file of CORE){
    const src = fs.readFileSync(path.join(__dirname, '..', 'www', file), 'utf8');
    vm.runInContext(src, ctx, { filename: file });
  }
  return ctx.LifeQuest;
}

module.exports = { loadCore };
