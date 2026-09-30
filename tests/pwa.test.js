const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const www = path.join(__dirname, '..', 'www');
const read = (f) => fs.readFileSync(path.join(www, f), 'utf8');

test('versión web instalable: manifiesto válido con iconos que existen', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './index.html');
  assert.ok(m.icons.some(i => i.purpose === 'maskable'));
  m.icons.forEach(i => assert.ok(fs.existsSync(path.join(www, i.src)), i.src));
  const html = read('index.html');
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /apple-touch-icon" href="img\/apple-touch-icon\.png"/);
  assert.ok(fs.existsSync(path.join(www, 'img/apple-touch-icon.png')));
});

test('el service worker cambia con cada versión (si no, los iPhone no se actualizan)', () => {
  const sw = read('sw.js').match(/const VERSION = '([^']+)'/)[1];
  const app = read('js/core/config.js').match(/APP_VERSION = '([^']+)'/)[1];
  assert.equal(sw, app, 'sube VERSION en www/sw.js al cambiar APP_VERSION');
});

test('todo lo que carga index.html existe (lo necesita el modo sin conexión)', () => {
  const html = read('index.html');
  const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map(m => m[1]);
  assert.ok(refs.length > 30);
  refs.forEach(r => assert.ok(fs.existsSync(path.join(www, r)), r));
});
