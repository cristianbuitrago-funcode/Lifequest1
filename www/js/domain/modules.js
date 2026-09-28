/*
 * Secciones opcionales de la app. Misiones, Hábitos y Resumen siempre están;
 * Finanzas, Tienda, Social y DECIDIA se pueden ocultar para que la app sea más
 * sencilla (se elige en la bienvenida del tutorial y en Ajustes).
 *
 *   settings.modules = { finanzas: true, tienda: true, social: true, decidia: true }
 *
 * En modo menor (Familia) Finanzas se oculta siempre y Social se muestra
 * siempre (ahí está Familia, desde donde se sale del modo menor).
 */
(function (LQ) {
  "use strict";

  const LIST = [
    { id: 'finanzas', emoji: '💰', name: 'Finanzas', desc: 'Ingresos, gastos, pagos y sobres' },
    { id: 'tienda',   emoji: '🛒', name: 'Tienda',   desc: 'Gasta tus monedas en temas y mascotas' },
    { id: 'social',   emoji: '👥', name: 'Social',   desc: 'Perfil, logros, ranking, clanes y Familia' },
    { id: 'decidia',  emoji: '🧠', name: 'DECIDIA',  desc: 'Compara opciones antes de decidir' }
  ];
  const IDS = LIST.map(m => m.id);

  function defaults(){ const o = {}; IDS.forEach(id => { o[id] = true; }); return o; }

  function enabled(settings, id){
    if (!IDS.includes(id)) return true;                    // resumen, misiones, hábitos, ajustes
    const child = LQ.Family && LQ.Family.isChildMode(settings);
    if (child && id === 'finanzas') return false;
    if (child && id === 'social') return true;
    const m = (settings && settings.modules) || {};
    return m[id] !== false;
  }

  LQ.Modules = { LIST, IDS, defaults, enabled };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
