/*
 * Rastreador de hábitos y Mapa de evolución (cálculos puros, sin DOM).
 *
 * Rastreador (pestaña Hábitos), por mes:
 *   - cuadrícula hábito × día con lo cumplido (sale del `log` de cada hábito);
 *   - gráfico: cuántos hábitos se hicieron cada día;
 *   - escalera de recompensas: cada hábito cumplido = 1 bloque; al llegar a un
 *     marco (20, 40, 60) se cobra el premio que el usuario escribió;
 *   - reflexión del mes.
 *   Lo que escribe el usuario se guarda en settings.habitMonths['AAAA-MM'].
 *
 * Mapa de evolución (pestaña Resumen): hasta 6 pilares con color, meta mensual,
 * "hecho" y nivel 1–10. El "hecho" se calcula solo desde un hábito (días
 * cumplidos) o una categoría (misiones cumplidas), o se cuenta a mano.
 *   settings.evolution = { pillars: [...] | null, manual: {'AAAA-MM': {pilarId: n}} }
 *   Con pillars = null se proponen pilares a partir de las categorías.
 */
(function (LQ) {
  "use strict";

  const MAX_PILLARS = 6;
  const MILESTONES = [20, 40, 60];
  const COLORS = ['#e05a5a', '#3fb8f0', '#3fd6a5', '#f0a13f', '#9b83ff', '#e1bd45'];

  const pad = (n) => String(n).padStart(2, '0');
  const monthKey = (date) => { const d = date || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
  function daysInMonth(key){ const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); }
  function shiftMonth(key, delta){
    const [y, m] = key.split('-').map(Number);
    return monthKey(new Date(y, m - 1 + delta, 1));
  }
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function monthLabel(key){ const [y, m] = key.split('-').map(Number); return MONTHS[m - 1] + ' ' + y; }
  const dateOf = (key, day) => key + '-' + pad(day);

  // -------------------------------------------------------------------------
  // Rastreador de hábitos
  // -------------------------------------------------------------------------
  /** Cuadrícula del mes: filas por hábito y total de hábitos hechos por día. */
  function tracker(state, key){
    const n = daysInMonth(key);
    const rows = (state.habits || []).map(h => {
      const log = h.log || {};
      const cells = [];
      for (let d = 1; d <= n; d++) cells.push(!!log[dateOf(key, d)]);
      return { habit: h, cells, done: cells.filter(Boolean).length };
    });
    const perDay = [];
    for (let d = 0; d < n; d++) perDay.push(rows.reduce((s, r) => s + (r.cells[d] ? 1 : 0), 0));
    const total = perDay.reduce((s, x) => s + x, 0);
    return { days: n, rows, perDay, total, maxPerDay: Math.max(1, rows.length) };
  }

  /** Datos que escribió el usuario para ese mes (premios, cobros y reflexión). */
  function monthNotes(settings, key){
    const all = (settings && settings.habitMonths) || {};
    const m = all[key] || {};
    return {
      rewards: MILESTONES.map((_, i) => (m.rewards && typeof m.rewards[i] === 'string') ? m.rewards[i] : ''),
      claimed: Object.assign({}, m.claimed || {}),
      reflection: typeof m.reflection === 'string' ? m.reflection : ''
    };
  }

  /** Escalera de recompensas: marcos 20/40/60 con su estado. */
  function ladder(settings, key, total){
    const notes = monthNotes(settings, key);
    const top = MILESTONES[MILESTONES.length - 1];
    return {
      total, top, filled: Math.min(total, top),
      milestones: MILESTONES.map((at, i) => ({
        at, index: i, reward: notes.rewards[i],
        reached: total >= at, claimedAt: notes.claimed[at] || null
      }))
    };
  }

  // -------------------------------------------------------------------------
  // Mapa de evolución
  // -------------------------------------------------------------------------
  /** Pilares propuestos cuando el usuario aún no ha elegido: uno por categoría. */
  function defaultPillars(settings){
    const cats = LQ.Family ? LQ.Family.visibleCategories(settings) : ((settings && settings.categories) || []);
    return cats.slice(0, MAX_PILLARS).map((c, i) => ({
      id: 'p-' + c.id, name: c.name, color: c.color || COLORS[i % COLORS.length],
      source: { type: 'category', id: c.id }, meta: 20
    }));
  }

  function pillarsOf(settings){
    const evo = settings && settings.evolution;
    return (evo && Array.isArray(evo.pillars)) ? evo.pillars.slice(0, MAX_PILLARS) : defaultPillars(settings);
  }

  /** Cuánto se hizo de un pilar en el mes. */
  function doneFor(pillar, state, key){
    const src = pillar.source || { type: 'manual' };
    if (src.type === 'habit'){
      const h = (state.habits || []).find(x => x.id === src.id);
      if (!h) return 0;
      return Object.keys(h.log || {}).filter(d => d.slice(0, 7) === key && h.log[d]).length;
    }
    if (src.type === 'category'){
      return (state.completions || []).filter(c => c.categoryId === src.id && c.date && c.date.slice(0, 7) === key).length;
    }
    const manual = (state.settings.evolution && state.settings.evolution.manual) || {};
    return Math.max(0, Number((manual[key] || {})[pillar.id]) || 0);
  }

  /** Nivel de 0 a 10: porcentaje de la meta convertido a la escala del mapa. */
  function level(done, meta){
    if (!(meta > 0) || done <= 0) return 0;
    return Math.max(1, Math.min(10, Math.round(done / meta * 10)));
  }

  /** Pilares del mes con su meta, lo hecho y el nivel. */
  function evolution(state, key){
    return pillarsOf(state.settings).map((p, i) => {
      const done = doneFor(p, state, key);
      const meta = Math.max(1, Number(p.meta) || 1);
      return Object.assign({}, p, { color: p.color || COLORS[i % COLORS.length], meta, done, level: level(done, meta), auto: !!(p.source && p.source.type !== 'manual') });
    });
  }

  /** Texto de dónde sale el "hecho" de un pilar. */
  function sourceLabel(pillar, state){
    const src = pillar.source || { type: 'manual' };
    if (src.type === 'habit'){
      const h = (state.habits || []).find(x => x.id === src.id);
      return h ? 'Días de "' + h.title + '"' : 'Hábito eliminado';
    }
    if (src.type === 'category'){
      const c = (state.settings.categories || []).find(x => x.id === src.id);
      return 'Misiones de ' + (c ? c.name : 'categoría eliminada');
    }
    return 'Lo cuentas tú';
  }

  LQ.Evolution = {
    MAX_PILLARS, MILESTONES, COLORS,
    monthKey, daysInMonth, shiftMonth, monthLabel,
    tracker, monthNotes, ladder,
    defaultPillars, pillarsOf, doneFor, level, evolution, sourceLabel
  };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
