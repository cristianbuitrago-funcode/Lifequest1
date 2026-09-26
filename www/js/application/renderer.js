(function (LQ) {
  "use strict";

  function renderCharacter() {
    if (LQ.ui && typeof LQ.ui.renderCharacterCard === "function") LQ.ui.renderCharacterCard();
  }

  function renderEverything() {
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
  LQ.app.renderer = { renderCharacter, renderEverything, refreshFromState };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
