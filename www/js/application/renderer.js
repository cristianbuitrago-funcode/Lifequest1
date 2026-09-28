(function (LQ) {
  "use strict";

  function renderCharacter() {
    if (LQ.ui && typeof LQ.ui.renderCharacterCard === "function") LQ.ui.renderCharacterCard();
  }

  /** Modo menor: sin pestaña de Finanzas (y fuera de ella si estaba abierta). */
  function applyChildMode() {
    const child = !!(LQ.Family && LQ.Family.isChildMode(LQ.state.settings));
    document.body.classList.toggle("child-mode", child);
    const tab = document.querySelector('.tab-btn[data-tab="finanzas"]');
    if (tab) tab.hidden = child;
    if (child && LQ.app.router.current() === "finanzas") LQ.app.router.activate("resumen", false);
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
