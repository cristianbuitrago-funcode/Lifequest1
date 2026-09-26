(function (LQ) {
  "use strict";

  const KEY = "lifequest:theme";
  const order = ["system", "light", "dark"];

  function apply(theme) {
    const value = ["system", "light", "dark"].includes(theme) ? theme : "system";
    if (value === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", value);
    try { localStorage.setItem(KEY, value); } catch (_) {}
    if (LQ.native && typeof LQ.native.setTheme === "function") LQ.native.setTheme(value);
    if (LQ.ui && typeof LQ.ui.applyCosmetics === "function") LQ.ui.applyCosmetics();
  }

  function bind() {
    const button = document.getElementById("themeBtn");
    if (!button) return;
    button.addEventListener("click", async () => {
      const current = LQ.state.settings.theme || "system";
      const next = order[(order.indexOf(current) + 1) % order.length];
      LQ.state.settings.theme = next;
      apply(next);
      LQ.ui.showToast(`Tema: ${next === "system" ? "automático" : next === "light" ? "claro" : "oscuro"}`);
      await LQ.store.saveSettings();
    });

    if (window.matchMedia) {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const refresh = () => {
        if ((LQ.state.settings.theme || "system") !== "system") return;
        apply("system");
        const current = LQ.app.router.current();
        if (current === "resumen") LQ.ui.views.resumen.render();
      };
      if (media.addEventListener) media.addEventListener("change", refresh);
    }
  }

  LQ.app = LQ.app || {};
  LQ.app.theme = { apply, bind };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
