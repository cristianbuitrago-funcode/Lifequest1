(function (LQ) {
  "use strict";

  function renderCharacter() {
    if (LQ.ui && typeof LQ.ui.renderCharacterCard === "function") LQ.ui.renderCharacterCard();
  }

  /**
   * Secciones visibles: oculta las pestañas apagadas (Ajustes → Secciones, o
   * Finanzas en modo menor) y sale de la actual si quedó oculta.
   */
  function applyChildMode() {
    const settings = LQ.state.settings;
    document.body.classList.toggle("child-mode", !!(LQ.Family && LQ.Family.isChildMode(settings)));
    document.querySelectorAll(".tab-btn[data-tab]").forEach(tab => {
      tab.hidden = !LQ.Modules.enabled(settings, tab.dataset.tab);
    });
    if (!LQ.Modules.enabled(settings, LQ.app.router.current())) LQ.app.router.activate("resumen", false);
  }

  function renderEverything() {
    applyChildMode();
    renderCharacter();
    const views = LQ.ui && LQ.ui.views;
    if (!views) return;
    const current = LQ.app.router.current();
    if (views.resumen && views.resumen.render) views.resumen.render();
    if (views.misiones && views.misiones.renderList) views.misiones.renderList();
    if (views.habitos && views.habitos.renderList) views.habitos.renderList();
    if (current !== "resumen" && views[current] && views[current].render) views[current].render();
  }

  function refreshFromState() {
    LQ.app.theme.apply(LQ.state.settings.theme);
    renderEverything();
  }

  LQ.app = LQ.app || {};
  LQ.app.renderer = { renderCharacter, renderEverything, refreshFromState, applyChildMode };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
