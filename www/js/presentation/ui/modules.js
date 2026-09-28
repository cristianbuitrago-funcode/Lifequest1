/*
 * Selector de secciones opcionales (Finanzas, Tienda, Social, DECIDIA). Se usa
 * en la bienvenida del tutorial y en Ajustes → Secciones de la app.
 */
(function (LQ) {
  "use strict";

  const ui = LQ.ui;
  const { escapeHtml } = LQ.utils;

  /** Casillas con el estado actual. En modo menor Finanzas y Social quedan fijas. */
  ui.modulePicker = function(){
    const s = LQ.state.settings;
    const child = LQ.Family.isChildMode(s);
    return `<div class="module-pick">${LQ.Modules.LIST.map(m => {
      const locked = child && (m.id === 'finanzas' || m.id === 'social');
      return `
      <label class="module-opt ${locked ? 'locked' : ''}">
        <input type="checkbox" data-module="${m.id}" ${LQ.Modules.enabled(s, m.id) ? 'checked' : ''} ${locked ? 'disabled' : ''}>
        <span class="module-emoji" aria-hidden="true">${m.emoji}</span>
        <span class="module-txt"><b>${escapeHtml(m.name)}</b><small>${escapeHtml(locked ? 'Fijo en modo menor' : m.desc)}</small></span>
      </label>`;
    }).join('')}</div>`;
  };

  /** Guarda lo marcado dentro de `root` y actualiza la app. */
  ui.saveModulePicker = async function(root){
    const s = LQ.state.settings;
    s.modules = Object.assign(LQ.Modules.defaults(), s.modules || {});
    root.querySelectorAll('[data-module]:not([disabled])').forEach(i => { s.modules[i.dataset.module] = i.checked; });
    await LQ.store.saveSettings();
    LQ.app.renderer.applyChildMode();
  };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
