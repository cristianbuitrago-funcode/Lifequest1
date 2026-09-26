(function (LQ) {
  "use strict";

  function bind() {
    document.addEventListener("click", event => {
      const target = event.target.closest("[data-action]");
      if (!target || target.disabled) return;
      const action = LQ.ui && LQ.ui.actions && LQ.ui.actions[target.dataset.action];
      if (typeof action === "function") action(target.dataset.id, target);
    });
  }

  LQ.app = LQ.app || {};
  LQ.app.actions = { bind };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
