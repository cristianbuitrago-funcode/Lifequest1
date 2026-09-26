const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers');

async function app(coins, xp){
  const L = loadCore();
  await L.store.init({ adapter: L.storage.createMemoryAdapter('s'), onError: (e) => { throw e; } });
  L.state.character.coins = coins || 0;
  L.state.character.totalXp = xp || 0;
  return L;
}

test('sin monedas suficientes: mensaje claro y cuánto falta', async () => {
  const L = await app(10);
  const r = await L.Shop.purchase('avatar-guerrero'); // 30
  assert.equal(r.ok, false);
  assert.equal(r.missing, 20);
  assert.match(r.message, /No tienes suficientes monedas\. Te faltan 20/);
  assert.equal(L.state.character.coins, 10);
  assert.equal(L.state.inventory.length, 0);
});

test('comprar resta monedas, añade al inventario y se puede equipar', async () => {
  const L = await app(100);
  const r = await L.Shop.purchase('avatar-guerrero');
  assert.equal(r.ok, true);
  assert.equal(L.state.character.coins, 70);
  assert.equal(L.Shop.inventoryItem('avatar-guerrero').qty, 1);
  assert.equal((await L.Shop.purchase('avatar-guerrero')).reason, 'owned', 'compra única');
  await L.Shop.toggleEquip('avatar-guerrero');
  assert.equal(L.state.profile.equipped.avatar, 'avatar-guerrero');
  assert.equal(L.Shop.equippedProducts().avatar.effect.value, '🧙‍♂️');
  await L.Shop.toggleEquip('avatar-guerrero');
  assert.equal(L.state.profile.equipped.avatar, null);
  assert.equal(L.state.profile.stats.coinsSpent, 30);
});

test('productos bloqueados se desbloquean al subir de nivel', async () => {
  const L = await app(500, 0);
  assert.equal((await L.Shop.purchase('tema-oceano')).reason, 'locked');
  // nivel 3 con la curva por defecto
  L.state.character.totalXp = 500;
  assert.ok(L.Rules.levelInfo(500, L.state.settings).level >= 3);
  assert.equal((await L.Shop.purchase('tema-oceano')).ok, true);
});

test('insignias: hasta 3 equipadas a la vez', async () => {
  const L = await app(1000);
  for (const id of ['insignia-madrugador', 'insignia-ahorrador', 'insignia-lector', 'insignia-atleta']){
    await L.Shop.purchase(id);
  }
  for (const id of ['insignia-madrugador', 'insignia-ahorrador', 'insignia-lector']) assert.equal((await L.Shop.toggleEquip(id)).ok, true);
  const r = await L.Shop.toggleEquip('insignia-atleta');
  assert.equal(r.ok, false);
  assert.equal(L.Shop.equippedProducts().badges.length, 3);
});

test('poción de XP doble: se acumula, se usa y duplica la XP de 3 misiones', async () => {
  const L = await app(200);
  await L.Shop.purchase('pocion-xp');
  await L.Shop.purchase('pocion-xp');
  assert.equal(L.Shop.inventoryItem('pocion-xp').qty, 2);
  await L.Shop.use('pocion-xp');
  assert.equal(L.Shop.inventoryItem('pocion-xp').qty, 1);
  assert.equal(L.state.profile.boosts.xpDouble, 3);
  const q = await L.store.addQuest({ title: 'Test', difficulty: 'media', recurrence: 'unica' });
  const r = await L.Game.completeQuest(q.id);
  assert.equal(r.xp, 50);
  assert.equal(r.boosted, true);
  assert.equal(L.state.profile.boosts.xpDouble, 2);
});

test('escudo de racha evita el castigo y conserva la racha', async () => {
  const L = await app(200);
  await L.Shop.purchase('escudo-racha');
  await L.Shop.use('escudo-racha');
  assert.equal(L.state.profile.shields, 1);
  const { utils } = L;
  const coinsBefore = L.state.character.coins;
  const q = await L.store.addQuest({ title: 'Agua', recurrence: 'diaria' });
  await L.store.updateQuest(q.id, { createdAt: utils.fmtDate(utils.addDays(new Date(), -3)) });
  L.state.character.streak = 4;
  L.state.character.lastActiveDate = utils.fmtDate(utils.addDays(new Date(), -2));
  const r = await L.Game.checkMissedDaily();
  assert.equal(r.shielded, true);
  assert.equal(r.punished, false);
  assert.equal(L.state.character.coins, coinsBefore);
  assert.equal(L.state.character.streak, 4);
  assert.equal(L.state.profile.shields, 0);
});

test('administrar: crear, editar, retirar y restaurar productos', async () => {
  const L = await app(100);
  const bad = await L.Shop.saveProduct({ name: '', price: 5, category: 'insignias', status: 'disponible', purchase: 'unica', effect: { kind: 'badge', value: '⭐' } });
  assert.equal(bad.ok, false);
  const made = await L.Shop.saveProduct({ name: 'Estrella', description: 'Brilla', icon: '⭐', price: 15, category: 'insignias', status: 'disponible', purchase: 'unica', effect: { kind: 'badge', value: '⭐' } });
  assert.equal(made.ok, true);
  assert.ok(L.Shop.getProduct(made.product.id));
  assert.equal((await L.Shop.purchase(made.product.id)).ok, true);

  // Editar un producto base cambia su precio
  const base = L.Shop.getProduct('avatar-ninja');
  await L.Shop.saveProduct(Object.assign({}, base, { price: 5 }));
  assert.equal(L.Shop.getProduct('avatar-ninja').price, 5);
  await L.Shop.restoreProduct('avatar-ninja');
  assert.equal(L.Shop.getProduct('avatar-ninja').price, 45);

  // Retirar: desaparece de la tienda, pero lo comprado sigue en el inventario
  await L.Shop.deleteProduct(made.product.id);
  assert.equal(L.Shop.getProduct(made.product.id), null);
  assert.ok(L.Shop.inventoryItem(made.product.id));
  await L.Shop.deleteProduct('mascota-gato');
  assert.equal(L.Shop.getProduct('mascota-gato'), null);
  assert.equal((await L.Shop.purchase('mascota-gato')).reason, 'missing');
});

test('estado no disponible impide comprar', async () => {
  const L = await app(500);
  const base = L.Shop.getProduct('aura-fuego');
  await L.Shop.saveProduct(Object.assign({}, base, { status: 'no_disponible' }));
  assert.equal((await L.Shop.purchase('aura-fuego')).reason, 'unavailable');
});

test('subir de nivel se detecta al completar misiones', async () => {
  const L = await app(0, 75);
  const q = await L.store.addQuest({ title: 'Épica', difficulty: 'epica', recurrence: 'unica' });
  const r = await L.Game.completeQuest(q.id);
  assert.equal(r.leveledUp, true);
  assert.equal(r.level, 2);
});
