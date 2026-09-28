const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers');

const LQ = loadCore();
const D = LQ.Decidia;

function headphones(){
  const money = D.variable('Dinero disponible', '💰', 'money', 100000);
  const price = D.variable('Precio', '💵', 'money', 70000);
  return D.newScenarioDecision({
    title: '¿Comprar audífonos?', variables: [money, price], baseId: money.id,
    options: [D.option('Comprar', '🛍️', [D.item('Pago', -1, 'once', [price.id])]), D.option('No comprar', '💰', [])]
  });
}

test('escenario básico: comprar deja $30.000, no comprar deja $100.000', () => {
  const d = headphones();
  const r = D.evaluate(d);
  const [buy, skip] = r.options;
  assert.equal(buy.balanceNow, 30000);
  assert.equal(buy.outflow, 70000);
  assert.equal(skip.balanceNow, 100000);
  assert.equal(skip.outflow, 0);
  assert.ok(buy.color && skip.color && buy.color !== skip.color);
});

test('¿Y si…? recalcula ambos escenarios sin tocar la decisión guardada', () => {
  const d = headphones();
  const [money, price] = d.variables;
  const before = D.evaluate(d);
  const more = D.evaluate(d, { [money.id]: 150000 });
  assert.equal(more.options[0].balanceNow, 80000);
  assert.equal(more.options[1].balanceNow, 150000);
  const cheaper = D.evaluate(d, { [price.id]: 50000 });
  assert.equal(cheaper.options[0].balanceNow, 50000);
  assert.equal(d.variables[0].value, 100000, 'los valores originales no cambian');
  const delta = D.diff(before, more);
  assert.equal(delta[d.options[0].id].balanceNow, 50000);
  assert.equal(delta[d.options[1].id].balanceNow, 50000);
});

test('ver a futuro: $15.000 diarios se calculan por horizonte', () => {
  const money = D.variable('Dinero', '💰', 'money', 0);
  const daily = D.variable('Gasto diario', '🧾', 'money', 15000);
  const d = D.newScenarioDecision({ variables: [money, daily], baseId: money.id,
    options: [D.option('Seguir', '🔁', [D.item('Gasto', -1, 'day', [daily.id])])] });
  const p = D.evaluate(d).options[0].projection;
  assert.deepEqual([...p.map(x => x.label)], ['1 semana', '1 mes', '6 meses', '1 año']);
  assert.deepEqual([...p.map(x => -x.flow)], [105000, 450000, 2730000, 5475000]);
  // Cambiar el valor actualiza todo
  const p2 = D.evaluate(d, { [daily.id]: 10000 }).options[0].projection;
  assert.equal(p2[0].flow, -70000);
  assert.equal(p2[3].flow, -3650000);
});

test('frecuencias semanales y mensuales, y producto de variables (viajes × costo)', () => {
  const trip = D.variable('Costo por viaje', '🚌', 'money', 3000);
  const trips = D.variable('Viajes por semana', '🔁', 'number', 10);
  const up = D.variable('Mantenimiento', '🔧', 'money', 20000);
  const d = D.newScenarioDecision({ variables: [trip, trips, up], options: [
    D.option('Bus', '🚌', [D.item('Bus', -1, 'week', [trip.id, trips.id])]),
    D.option('Bici', '🚲', [D.item('Mantenimiento', -1, 'month', [up.id])])] });
  const [bus, bici] = D.evaluate(d).options;
  assert.equal(bus.projection[0].flow, -30000);            // 1 semana
  assert.equal(bus.projection[3].flow, -1560000);          // 52 semanas
  assert.equal(bici.projection[1].flow, -20000);           // 1 mes
  assert.equal(bici.projection[3].flow, -240000);          // 12 meses
  assert.equal(bus.balanceNow, 0, 'sin variable base el saldo inmediato es solo el cambio único');
});

test('interpretar una frase y crear el escenario de compra', () => {
  const info = D.interpret('Tengo $100.000 y estoy pensando en comprar unos audífonos de $70.000.');
  assert.deepEqual([...info.amounts], [100000, 70000]);
  assert.equal(info.isPurchase, true);
  assert.equal(info.thing, 'audífonos');
  const d = D.fromText('Tengo $100.000 y estoy pensando en comprar unos audífonos de $70.000.');
  assert.equal(d.title, '¿Comprar audífonos?');
  const r = D.evaluate(d);
  assert.deepEqual([...r.options.map(o => o.balanceNow)], [30000, 100000]);
  assert.deepEqual([...D.parseAmounts('cuesta 50 mil y tengo 1,5 millones')], [50000, 1500000]);
  assert.deepEqual([...D.parseAmounts('tengo 3 hermanos')], [], 'números sueltos sin pista de dinero no cuentan');
});

test('modo "No sé": cada categoría arma una decisión válida', () => {
  assert.equal(D.WIZARD_ORDER.length, 10);
  D.WIZARD_ORDER.forEach(cat => {
    const d = D.fromWizard(cat, {});
    assert.equal(d.category, cat);
    if (d.type === 'compare'){
      assert.equal(d.sides.length, 2);
      assert.ok(d.aspects.length > 0);
      D.compare(d);
    } else {
      assert.ok(d.options.length >= 2, cat + ' tiene dos opciones');
      const r = D.evaluate(d);
      r.options.forEach(o => o.projection.forEach(p => assert.ok(Number.isFinite(p.total))));
    }
  });
  const bike = D.fromWizard('transporte', { thing: 'bicicleta', price: 600000, trip: 3000, trips: 10 });
  assert.equal(bike.title, '¿Comprar bicicleta?');
  assert.equal(bike.variables.length, 5);
});

test('comparador: muestra diferencias ordenadas por importancia, sin ganador', () => {
  const d = D.newCompareDecision({ title: 'Bus vs Bici' });
  const [a, b] = d.sides;
  d.aspects = [
    { id: 'p', name: 'Precio', emoji: '💵', unit: 'money', weight: 2, values: { [a.id]: 600000, [b.id]: 0 } },
    { id: 'c', name: 'Comodidad', emoji: '🛋️', unit: 'scale', weight: 5, values: { [a.id]: 3, [b.id]: 3 } },
    { id: 'n', name: 'Nota', emoji: '📝', unit: 'text', weight: 1, values: { [a.id]: 'Ejercicio', [b.id]: 'Tráfico' } }
  ];
  const c = D.compare(d);
  assert.deepEqual([...c.rows.map(r => r.id)], ['c', 'p', 'n']);
  assert.equal(c.rows[0].equal, true);
  assert.equal(c.rows[1].delta, 600000);
  assert.equal(c.differences, 2);
  assert.ok(!('winner' in c), 'no declara ganador');
});

test('la colección decisions se guarda, se exporta y sobrevive a una recarga', async () => {
  const L = loadCore();
  const adapter = L.storage.createMemoryAdapter('d');
  await L.store.init({ adapter, onError: (e) => { throw e; } });
  const doc = JSON.parse(JSON.stringify(headphones()));
  const saved = await L.store.addRecord('decisions', Object.assign(doc, { createdAt: Date.now() }));
  assert.ok(saved.id && saved.updatedAt);
  await L.store.updateRecord('decisions', saved.id, { title: 'Audífonos nuevos' });
  const L2 = loadCore();
  await L2.store.init({ adapter, onError: (e) => { throw e; } });
  assert.equal(L2.state.decisions.length, 1);
  assert.equal(L2.state.decisions[0].title, 'Audífonos nuevos');
  assert.equal(L2.state.character.totalXp || 0, 0, 'DECIDIA no da XP');
  assert.equal(L2.state.character.coins || 0, 0, 'ni monedas');
  const dump = await L2.store.exportData();
  assert.equal(dump.decisions.length, 1);
});
