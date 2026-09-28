/*
 * DECIDIA — "Convierte tus decisiones en escenarios."
 *
 * Motor puro (sin DOM ni almacenamiento). Independiente del juego: no da XP ni
 * monedas y no toca misiones. Guarda nada por sí mismo; la pantalla usa el
 * store genérico (colección `decisions`).
 *
 * Modelo de una decisión de escenarios (type: 'scenario'):
 *   variables: [{ id, name, emoji, unit, value, min, max, step }]
 *       unit: 'money' | 'hours' | 'number' | 'percent' | 'scale' (1–5)
 *   baseId:  id de la variable "recurso" (p. ej. Dinero disponible) o null
 *   options: [{ id, name, emoji, color, items, notes, aspects }]
 *       items: [{ id, label, sign: 1|-1, every: 'once'|'day'|'week'|'month'|'year',
 *                 refs: [variableId...], factor }]
 *              importe = sign × factor × (producto de las variables en refs)
 *   aspects:  [{ id, name, emoji, unit }]  (durabilidad, prioridad…; valores por opción)
 *   scenarios: [{ id, name, overrides: {variableId: valor} }]  ("¿Y si…?" guardados)
 *
 * Comparador (type: 'compare'):
 *   sides: [{ id, name, emoji }, { … }]
 *   aspects: [{ id, name, emoji, unit, weight: 1..5, values: {sideId: valor} }]
 *
 * Nada de esto declara una opción "mejor": solo calcula y muestra diferencias.
 */
(function (LQ) {
  "use strict";

  const COLORS = ['#3fb8f0', '#9b83ff', '#3fd6a5', '#f0a13f', '#ff6b85', '#e1bd45'];

  // Cuántas veces ocurre algo de cada frecuencia en cada horizonte de "Ver a futuro".
  const HORIZONS = [
    { id: 'week',  label: '1 semana', count: { once: 1, day: 7,   week: 1,  month: 7 / 30, year: 7 / 365 } },
    { id: 'month', label: '1 mes',    count: { once: 1, day: 30,  week: 30 / 7, month: 1, year: 1 / 12 } },
    { id: 'half',  label: '6 meses',  count: { once: 1, day: 182, week: 26, month: 6,  year: 0.5 } },
    { id: 'year',  label: '1 año',    count: { once: 1, day: 365, week: 52, month: 12, year: 1 } }
  ];
  const EVERY_LABELS = { once: 'una vez', day: 'al día', week: 'a la semana', month: 'al mes', year: 'al año' };
  const UNITS = {
    money:   { label: 'Dinero',  min: 0, max: 1000000, step: 1000 },
    hours:   { label: 'Horas',   min: 0, max: 100,     step: 0.5 },
    number:  { label: 'Número',  min: 0, max: 100,     step: 1 },
    percent: { label: 'Porcentaje', min: 0, max: 100,  step: 1 },
    scale:   { label: 'Escala 1–5', min: 1, max: 5,    step: 1 }
  };

  let seq = 0;
  function newId(prefix){ return (prefix || 'x') + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6); }
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const round2 = (n) => (Math.round(n * 100) / 100) || 0;   // || 0 evita mostrar "-0"

  // -------------------------------------------------------------------------
  // Construcción
  // -------------------------------------------------------------------------
  function variable(name, emoji, unit, value, extra){
    const u = UNITS[unit] || UNITS.number;
    const v = Object.assign({ id: newId('v'), name, emoji: emoji || '🔢', unit, value: num(value), min: u.min, max: u.max, step: u.step }, extra || {});
    // Que el deslizador siempre tenga margen para "¿Y si…?".
    if (unit !== 'scale' && unit !== 'percent') v.max = Math.max(v.max, niceMax(v.value * 2));
    return v;
  }
  function niceMax(n){
    if (n <= 0) return 0;
    const p = Math.pow(10, Math.floor(Math.log10(n)));
    return Math.ceil(n / p) * p;
  }
  function item(label, sign, every, refs, factor){
    return { id: newId('i'), label, sign: sign < 0 ? -1 : 1, every: every || 'once', refs: refs || [], factor: factor == null ? 1 : num(factor) };
  }
  function option(name, emoji, items, extra){
    return Object.assign({ id: newId('o'), name, emoji: emoji || '🔹', color: null, items: items || [], notes: '', aspects: {} }, extra || {});
  }
  function colorize(options){ options.forEach((o, i) => { if (!o.color) o.color = COLORS[i % COLORS.length]; }); return options; }

  function newScenarioDecision(partial){
    const d = Object.assign({
      type: 'scenario', title: '', description: '', category: 'otro', emoji: '🧠',
      variables: [], baseId: null, options: [], aspects: [], scenarios: []
    }, partial || {});
    colorize(d.options);
    return d;
  }

  function newCompareDecision(partial){
    return Object.assign({
      type: 'compare', title: '', description: '', category: 'otro', emoji: '⚖️',
      sides: [{ id: newId('s'), name: 'Opción A', emoji: '🅰️' }, { id: newId('s'), name: 'Opción B', emoji: '🅱️' }],
      aspects: []
    }, partial || {});
  }

  // -------------------------------------------------------------------------
  // Cálculo de escenarios
  // -------------------------------------------------------------------------
  /** Valores efectivos de las variables (con los cambios temporales de "¿Y si…?"). */
  function values(decision, overrides){
    const out = {};
    (decision.variables || []).forEach(v => { out[v.id] = num(v.value); });
    Object.keys(overrides || {}).forEach(id => { if (id in out) out[id] = num(overrides[id]); });
    return out;
  }

  function itemAmount(it, vals){
    const product = (it.refs || []).reduce((p, id) => p * num(vals[id]), 1);
    return it.sign * num(it.factor == null ? 1 : it.factor) * product;
  }

  /**
   * Resultado de cada opción: importes de cada línea, cambio único, flujo por
   * periodo, saldo inmediato y proyección a cada horizonte.
   */
  function evaluate(decision, overrides){
    const vals = values(decision, overrides);
    const base = decision.baseId ? num(vals[decision.baseId]) : 0;
    const options = (decision.options || []).map(o => {
      const lines = (o.items || []).map(it => ({ id: it.id, label: it.label, every: it.every, amount: round2(itemAmount(it, vals)) }));
      const once = round2(lines.filter(l => l.every === 'once').reduce((s, l) => s + l.amount, 0));
      const recurring = lines.filter(l => l.every !== 'once');
      const projection = HORIZONS.map(h => {
        const flow = recurring.reduce((s, l) => s + l.amount * h.count[l.every], 0);
        return { id: h.id, label: h.label, flow: round2(flow), total: round2(once + flow), balance: round2(base + once + flow) };
      });
      const outflow = round2(-lines.filter(l => l.amount < 0 && l.every === 'once').reduce((s, l) => s + l.amount, 0));
      return {
        id: o.id, name: o.name, emoji: o.emoji, color: o.color, notes: o.notes, aspects: o.aspects || {},
        lines, once, outflow, balanceNow: round2(base + once), recurring: recurring.length > 0, projection
      };
    });
    return { values: vals, base, hasBase: !!decision.baseId, options };
  }

  /** Frases neutrales que describen una opción (sin juzgar cuál es mejor). */
  function describe(result, decision){
    const baseVar = (decision.variables || []).find(v => v.id === decision.baseId);
    const out = [];
    if (baseVar){
      if (result.once < 0) out.push('Tu ' + baseVar.name.toLowerCase() + ' baja de inmediato.');
      else if (result.once > 0) out.push('Tu ' + baseVar.name.toLowerCase() + ' sube de inmediato.');
      else out.push('Tu ' + baseVar.name.toLowerCase() + ' se mantiene igual hoy.');
      if (result.balanceNow < 0) out.push('El saldo inmediato queda por debajo de cero.');
    }
    const year = result.projection.find(p => p.id === 'year');
    if (result.recurring && year){
      if (year.flow < 0) out.push('Tiene costos que se repiten en el tiempo.');
      else if (year.flow > 0) out.push('Genera un ahorro o ingreso que se repite.');
    }
    return out;
  }

  /** Qué cambió en cada opción entre dos evaluaciones (para resaltar en "¿Y si…?"). */
  function diff(before, after){
    const map = {};
    after.options.forEach(o => {
      const b = before.options.find(x => x.id === o.id);
      if (!b) return;
      map[o.id] = { balanceNow: round2(o.balanceNow - b.balanceNow), once: round2(o.once - b.once),
        year: round2((o.projection[3] || {}).total - (b.projection[3] || {}).total) };
    });
    return map;
  }

  // -------------------------------------------------------------------------
  // Comparador (A vs B), sin ganador
  // -------------------------------------------------------------------------
  function compare(decision){
    const [a, b] = decision.sides;
    const rows = (decision.aspects || []).map(asp => {
      const va = asp.values ? asp.values[a.id] : null, vb = asp.values ? asp.values[b.id] : null;
      const numeric = asp.unit !== 'text';
      const na = num(va), nb = num(vb);
      const delta = numeric ? round2(na - nb) : null;
      const max = numeric ? Math.max(Math.abs(na), Math.abs(nb), 1e-9) : 0;
      return {
        id: asp.id, name: asp.name, emoji: asp.emoji, unit: asp.unit, weight: Math.min(5, Math.max(1, num(asp.weight) || 3)),
        a: numeric ? na : (va || ''), b: numeric ? nb : (vb || ''), delta,
        pctA: numeric ? Math.abs(na) / max : 0, pctB: numeric ? Math.abs(nb) / max : 0,
        equal: numeric ? delta === 0 : String(va || '').trim() === String(vb || '').trim()
      };
    });
    // Orden por la importancia que el usuario le da a cada aspecto (no por "quién gana").
    rows.sort((x, y) => y.weight - x.weight);
    return { a, b, rows, differences: rows.filter(r => !r.equal).length };
  }

  // -------------------------------------------------------------------------
  // "Detectar datos": interpreta localmente una frase como
  // "Tengo $100.000 y quiero comprar unos audífonos de $70.000".
  // -------------------------------------------------------------------------
  function parseAmounts(text){
    const out = [];
    const re = /\$?\s?(\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d+)?)\s*(mil(?:lones)?|millón|millon|k|m)?\b/gi;
    let m;
    while ((m = re.exec(text))){
      let raw = m[1];
      // "100.000" / "100,000" / "100 000" → miles; "1,5" / "1.5" → decimal
      const thousands = /^\d{1,3}([.,\s]\d{3})+$/.test(raw);
      let n = thousands ? Number(raw.replace(/[.,\s]/g, '')) : Number(raw.replace(',', '.'));
      const mult = (m[2] || '').toLowerCase();
      if (mult === 'mil' || mult === 'k') n *= 1000;
      else if (mult === 'millones' || mult === 'millón' || mult === 'millon' || mult === 'm') n *= 1000000;
      const hasMoneyHint = m[0].includes('$') || !!mult || thousands;
      if (Number.isFinite(n) && n > 0 && hasMoneyHint) out.push(n);
    }
    return out;
  }

  function interpret(text){
    const t = String(text || '').trim();
    const lower = t.toLowerCase();
    const amounts = parseAmounts(t);
    const buy = /\b(compr\w*|adquirir)\b/.exec(lower);
    let thing = '';
    if (buy){
      const after = t.slice(buy.index + buy[0].length).replace(/^\s*(unos|unas|un|una|el|la|los|las|mi|mis)\s+/i, '');
      thing = after.split(/\s+(de|por|que|a|en|y|con)\s+|\$|\d|[.,;!?]/i)[0].trim();
    }
    return { amounts, isPurchase: !!buy, thing: thing.slice(0, 40) };
  }

  /** Decisión lista a partir de una frase (compra con dinero disponible y precio). */
  function fromText(text){
    const info = interpret(text);
    const title = String(text || '').trim();
    if (info.isPurchase || info.amounts.length >= 2){
      const available = info.amounts.length >= 2 ? info.amounts[0] : (info.amounts.length ? info.amounts[0] * 2 : 100000);
      const price = info.amounts.length >= 2 ? info.amounts[1] : (info.amounts[0] || 50000);
      const thing = info.thing || 'esto';
      return buildPurchase({ title: '¿Comprar ' + thing + '?', description: title, thing, available, price });
    }
    return newScenarioDecision({ title: title.slice(0, 80) || 'Nueva decisión', description: title,
      variables: [], options: colorize([option('Opción A', '🟢'), option('Opción B', '🔵')]) });
  }

  // -------------------------------------------------------------------------
  // Plantillas del modo "No sé": preguntas sencillas → decisión armada
  // -------------------------------------------------------------------------
  function buildPurchase(a){
    const money = variable('Dinero disponible', '💰', 'money', a.available);
    const price = variable('Precio', '💵', 'money', a.price);
    const vars = [money, price];
    const buyItems = [item('Pago de ' + (a.thing || 'la compra'), -1, 'once', [price.id])];
    const skipItems = [];
    if (a.upkeep > 0){
      const up = variable('Mantenimiento al mes', '🔧', 'money', a.upkeep);
      vars.push(up);
      buyItems.push(item('Mantenimiento', -1, 'month', [up.id]));
    }
    if (a.months > 0) vars.push(variable('Tiempo de uso (meses)', '📅', 'number', a.months, { max: Math.max(60, a.months * 2) }));
    const d = newScenarioDecision({
      title: a.title || '¿Comprar ' + (a.thing || 'esto') + '?', description: a.description || '', category: 'compra', emoji: '🛍️',
      variables: vars, baseId: money.id,
      options: colorize([option('Comprar', '🛍️', buyItems), option('No comprar', '💰', skipItems)]),
      aspects: [{ id: newId('a'), name: 'Prioridad personal', emoji: '⭐', unit: 'scale' }]
    });
    // La prioridad es del objeto que se compra: solo se anota en la opción "Comprar".
    d.options[0].aspects[d.aspects[0].id] = a.priority || 3;
    return d;
  }

  const WIZARD = {
    dinero: {
      emoji: '💰', label: 'Dinero', intro: 'Ver cuánto te queda con un gasto que se repite o un ahorro.',
      questions: [
        { key: 'available', label: '¿Cuánto dinero tienes hoy?', unit: 'money', value: 500000 },
        { key: 'daily', label: '¿Cuánto gastas al día en eso que quieres cambiar?', unit: 'money', value: 15000 },
        { key: 'saving', label: 'Si lo cambias, ¿cuánto gastarías al día?', unit: 'money', value: 5000 }
      ],
      build: (a) => {
        const money = variable('Dinero disponible', '💰', 'money', a.available);
        const now = variable('Gasto diario actual', '🧾', 'money', a.daily);
        const alt = variable('Gasto diario si cambio', '✂️', 'money', a.saving);
        return newScenarioDecision({ title: a.title || '¿Cambio este gasto diario?', category: 'dinero', emoji: '💰',
          variables: [money, now, alt], baseId: money.id,
          options: [option('Seguir igual', '🔁', [item('Gasto diario', -1, 'day', [now.id])]),
                    option('Cambiar', '✂️', [item('Nuevo gasto diario', -1, 'day', [alt.id])])] });
      }
    },
    compra: {
      emoji: '🛍️', label: 'Compra', intro: 'Comprar o no: cuánto te queda y cuánto cuesta mantenerlo.',
      questions: [
        { key: 'thing', label: '¿Qué quieres comprar?', unit: 'text', value: '' , placeholder: 'Ej: audífonos' },
        { key: 'available', label: '¿Cuánto dinero tienes?', unit: 'money', value: 100000 },
        { key: 'price', label: '¿Cuánto cuesta?', unit: 'money', value: 70000 },
        { key: 'upkeep', label: '¿Cuánto cuesta mantenerlo al mes? (0 si nada)', unit: 'money', value: 0 },
        { key: 'priority', label: '¿Qué tan importante es para ti? (1 a 5)', unit: 'scale', value: 3 }
      ],
      build: (a) => buildPurchase({ title: '¿Comprar ' + (a.thing || 'esto') + '?', thing: a.thing, available: a.available,
        price: a.price, upkeep: a.upkeep, priority: a.priority })
    },
    transporte: {
      emoji: '🚗', label: 'Transporte', intro: 'Comprar un medio de transporte frente a lo que gastas hoy.',
      questions: [
        { key: 'thing', label: '¿Qué estás pensando comprar?', unit: 'text', value: 'bicicleta' },
        { key: 'available', label: '¿Cuánto dinero tienes?', unit: 'money', value: 800000 },
        { key: 'price', label: '¿Cuánto cuesta?', unit: 'money', value: 600000 },
        { key: 'trip', label: '¿Cuánto pagas hoy por cada viaje?', unit: 'money', value: 3000 },
        { key: 'trips', label: '¿Cuántos viajes haces a la semana?', unit: 'number', value: 10 },
        { key: 'upkeep', label: '¿Mantenimiento al mes?', unit: 'money', value: 20000 }
      ],
      build: (a) => {
        const money = variable('Dinero disponible', '💰', 'money', a.available);
        const price = variable('Precio', '💵', 'money', a.price);
        const trip = variable('Costo por viaje hoy', '🚌', 'money', a.trip);
        const trips = variable('Viajes por semana', '🔁', 'number', a.trips, { max: 40 });
        const up = variable('Mantenimiento al mes', '🔧', 'money', a.upkeep);
        const thing = a.thing || 'el vehículo';
        return newScenarioDecision({ title: '¿Comprar ' + thing + '?', category: 'transporte', emoji: '🚗',
          variables: [money, price, trip, trips, up], baseId: money.id,
          options: [option('Comprar ' + thing, '🚲', [item('Pago de ' + thing, -1, 'once', [price.id]), item('Mantenimiento', -1, 'month', [up.id])]),
                    option('Seguir como ahora', '🚌', [item('Transporte actual', -1, 'week', [trip.id, trips.id])])],
          aspects: [{ id: newId('a'), name: 'Comodidad', emoji: '🛋️', unit: 'scale' }] });
      }
    },
    tiempo: {
      emoji: '⏰', label: 'Tiempo', intro: 'Ver a dónde se van tus horas si agregas una actividad.',
      questions: [
        { key: 'free', label: '¿Cuántas horas libres tienes a la semana?', unit: 'hours', value: 20 },
        { key: 'hours', label: '¿Cuántas horas a la semana te tomaría?', unit: 'hours', value: 5 }
      ],
      build: (a) => {
        const free = variable('Horas libres por semana', '🕒', 'hours', a.free);
        const use = variable('Horas que toma por semana', '⏳', 'hours', a.hours);
        return newScenarioDecision({ title: a.title || '¿Le dedico tiempo a esto?', category: 'tiempo', emoji: '⏰',
          variables: [free, use], baseId: free.id,
          options: [option('Hacerlo', '✅', [item('Horas dedicadas', -1, 'week', [use.id])]), option('No hacerlo', '⏸️', [])] });
      }
    },
    estudio: {
      emoji: '🎓', label: 'Estudio', intro: 'Un curso o carrera: costo, tiempo y lo que podría aportarte.',
      questions: [
        { key: 'available', label: '¿Cuánto dinero tienes?', unit: 'money', value: 1000000 },
        { key: 'monthly', label: '¿Cuánto cuesta al mes?', unit: 'money', value: 250000 },
        { key: 'hours', label: '¿Cuántas horas a la semana?', unit: 'hours', value: 6 },
        { key: 'months', label: '¿Cuántos meses dura?', unit: 'number', value: 6 }
      ],
      build: (a) => {
        const money = variable('Dinero disponible', '💰', 'money', a.available);
        const fee = variable('Costo mensual', '🎓', 'money', a.monthly);
        const hours = variable('Horas por semana', '⏳', 'hours', a.hours);
        const months = variable('Duración (meses)', '📅', 'number', a.months, { max: 60 });
        return newScenarioDecision({ title: a.title || '¿Estudio esto?', category: 'estudio', emoji: '🎓',
          variables: [money, fee, hours, months], baseId: money.id,
          options: [option('Estudiar', '📚', [item('Mensualidad', -1, 'month', [fee.id])]), option('Esperar', '⏸️', [])],
          aspects: [{ id: newId('a'), name: 'Horas a la semana', emoji: '⏳', unit: 'hours' }, { id: newId('a'), name: 'Interés personal', emoji: '⭐', unit: 'scale' }] });
      }
    },
    trabajo: {
      emoji: '💼', label: 'Trabajo', intro: 'Comparar dos trabajos o propuestas por lo que dejan cada mes.',
      questions: [
        { key: 'salaryA', label: '¿Cuánto pagan en la opción actual al mes?', unit: 'money', value: 1800000 },
        { key: 'costA', label: '¿Cuánto te cuesta ir (transporte, comida) al mes?', unit: 'money', value: 250000 },
        { key: 'salaryB', label: '¿Cuánto pagan en la otra opción al mes?', unit: 'money', value: 2100000 },
        { key: 'costB', label: '¿Y cuánto te costaría ir al mes?', unit: 'money', value: 400000 }
      ],
      build: (a) => {
        const sa = variable('Salario actual', '💼', 'money', a.salaryA), ca = variable('Costos actuales', '🚌', 'money', a.costA);
        const sb = variable('Salario nuevo', '💼', 'money', a.salaryB), cb = variable('Costos nuevos', '🚌', 'money', a.costB);
        return newScenarioDecision({ title: a.title || '¿Cambio de trabajo?', category: 'trabajo', emoji: '💼',
          variables: [sa, ca, sb, cb], baseId: null,
          options: [option('Quedarme', '🏢', [item('Salario', 1, 'month', [sa.id]), item('Costos', -1, 'month', [ca.id])]),
                    option('Cambiar', '🚀', [item('Salario', 1, 'month', [sb.id]), item('Costos', -1, 'month', [cb.id])])],
          aspects: [{ id: newId('a'), name: 'Horas de viaje al día', emoji: '🕒', unit: 'hours' }, { id: newId('a'), name: 'Tranquilidad', emoji: '😌', unit: 'scale' }] });
      }
    },
    hogar: {
      emoji: '🏠', label: 'Hogar', intro: 'Un cambio en casa: pagar una vez o seguir pagando cada mes.',
      questions: [
        { key: 'available', label: '¿Cuánto dinero tienes?', unit: 'money', value: 600000 },
        { key: 'price', label: '¿Cuánto cuesta el cambio?', unit: 'money', value: 400000 },
        { key: 'now', label: '¿Cuánto pagas hoy al mes por eso?', unit: 'money', value: 60000 },
        { key: 'after', label: '¿Cuánto pagarías al mes después del cambio?', unit: 'money', value: 25000 }
      ],
      build: (a) => {
        const money = variable('Dinero disponible', '💰', 'money', a.available);
        const price = variable('Costo del cambio', '🛠️', 'money', a.price);
        const now = variable('Pago mensual hoy', '🧾', 'money', a.now);
        const after = variable('Pago mensual después', '🧾', 'money', a.after);
        return newScenarioDecision({ title: a.title || '¿Hago este cambio en casa?', category: 'hogar', emoji: '🏠',
          variables: [money, price, now, after], baseId: money.id,
          options: [option('Hacer el cambio', '🛠️', [item('Costo del cambio', -1, 'once', [price.id]), item('Pago mensual', -1, 'month', [after.id])]),
                    option('Dejar como está', '🏠', [item('Pago mensual', -1, 'month', [now.id])])] });
      }
    },
    plan: {
      emoji: '👥', label: 'Plan', intro: 'Una salida o viaje: cuánto cuesta y cuánto te queda.',
      questions: [
        { key: 'available', label: '¿Cuánto dinero tienes?', unit: 'money', value: 300000 },
        { key: 'price', label: '¿Cuánto cuesta el plan por persona?', unit: 'money', value: 120000 },
        { key: 'people', label: '¿Cuántas personas pagas tú (incluyéndote)?', unit: 'number', value: 1 }
      ],
      build: (a) => {
        const money = variable('Dinero disponible', '💰', 'money', a.available);
        const price = variable('Costo por persona', '🎟️', 'money', a.price);
        const people = variable('Personas que pagas', '👥', 'number', a.people, { max: 20 });
        return newScenarioDecision({ title: a.title || '¿Voy al plan?', category: 'plan', emoji: '👥',
          variables: [money, price, people], baseId: money.id,
          options: [option('Ir', '🎉', [item('Costo del plan', -1, 'once', [price.id, people.id])]), option('No ir', '🏠', [])],
          aspects: [{ id: newId('a'), name: 'Ganas', emoji: '⭐', unit: 'scale' }] });
      }
    },
    personal: {
      emoji: '❤️', label: 'Personal', intro: 'Algo personal: ordena qué pesa para ti en cada opción.',
      questions: [
        { key: 'a', label: '¿Cuál es la primera opción?', unit: 'text', value: '', placeholder: 'Ej: Mudarme' },
        { key: 'b', label: '¿Y la otra?', unit: 'text', value: '', placeholder: 'Ej: Quedarme' }
      ],
      build: (a) => newCompareDecision({ title: (a.a || 'Opción A') + ' vs ' + (a.b || 'Opción B'), category: 'personal', emoji: '❤️',
        sides: [{ id: newId('s'), name: a.a || 'Opción A', emoji: '🅰️' }, { id: newId('s'), name: a.b || 'Opción B', emoji: '🅱️' }],
        aspects: defaultAspects() })
    },
    otro: {
      emoji: '❓', label: 'Otro', intro: 'Empieza con dos opciones y agrega las variables que necesites.',
      questions: [
        { key: 'title', label: '¿Qué estás intentando decidir?', unit: 'text', value: '', placeholder: 'Ej: ¿Cambio de celular?' },
        { key: 'available', label: '¿Hay dinero de por medio? ¿Cuánto tienes? (0 si no)', unit: 'money', value: 0 }
      ],
      build: (a) => {
        const vars = [], hasMoney = a.available > 0;
        const money = hasMoney ? variable('Dinero disponible', '💰', 'money', a.available) : null;
        if (money) vars.push(money);
        return newScenarioDecision({ title: a.title || 'Nueva decisión', category: 'otro', emoji: '🧠',
          variables: vars, baseId: money ? money.id : null, options: [option('Opción A', '🟢'), option('Opción B', '🔵')] });
      }
    }
  };
  const WIZARD_ORDER = ['dinero', 'tiempo', 'compra', 'estudio', 'trabajo', 'hogar', 'plan', 'transporte', 'personal', 'otro'];

  function defaultAspects(){
    return [
      { id: newId('a'), name: 'Precio', emoji: '💵', unit: 'money', weight: 3, values: {} },
      { id: newId('a'), name: 'Tiempo', emoji: '⏳', unit: 'hours', weight: 3, values: {} },
      { id: newId('a'), name: 'Comodidad', emoji: '🛋️', unit: 'scale', weight: 3, values: {} }
    ];
  }

  /** Arma la decisión de una plantilla con las respuestas (texto o números). */
  function fromWizard(category, answers){
    const w = WIZARD[category] || WIZARD.otro;
    const a = {};
    w.questions.forEach(q => {
      const raw = answers && answers[q.key];
      a[q.key] = q.unit === 'text' ? String(raw == null ? q.value : raw).trim().slice(0, 60) : num(raw == null ? q.value : raw);
    });
    const d = w.build(a);
    d.category = category;
    return d;
  }

  const ASPECT_PRESETS = [
    { name: 'Precio', emoji: '💵', unit: 'money' }, { name: 'Tiempo', emoji: '⏳', unit: 'hours' },
    { name: 'Durabilidad', emoji: '📦', unit: 'number' }, { name: 'Comodidad', emoji: '🛋️', unit: 'scale' },
    { name: 'Mantenimiento', emoji: '🔧', unit: 'money' }, { name: 'Impacto económico', emoji: '📉', unit: 'money' },
    { name: 'Prioridad personal', emoji: '⭐', unit: 'scale' }
  ];

  LQ.Decidia = {
    HORIZONS, UNITS, EVERY_LABELS, WIZARD, WIZARD_ORDER, ASPECT_PRESETS, COLORS,
    newId, variable, item, option, newScenarioDecision, newCompareDecision, defaultAspects,
    values, itemAmount, evaluate, describe, diff, compare,
    parseAmounts, interpret, fromText, fromWizard, buildPurchase
  };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
