// Carga los scripts del núcleo (sin DOM) en un contexto aislado de Node.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CORE = [
  'js/core/config.js', 'js/core/utils.js', 'js/domain/rules.js', 'js/core/state.js',
  'js/infrastructure/storage-adapters.js', 'js/infrastructure/store.js', 'js/infrastructure/sync.js', 'js/domain/game.js',
  'js/domain/reminders.js', 'js/infrastructure/firestore-provider.js',
  'js/domain/finance-rules.js', 'js/domain/finance.js',
  'js/domain/shop-catalog.js', 'js/domain/shop.js',
  'js/domain/achievements.js', 'js/domain/social.js', 'js/domain/decidia.js', 'js/domain/evolution.js'
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
