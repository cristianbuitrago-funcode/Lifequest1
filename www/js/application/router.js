(function (LQ) {
  "use strict";

  const routes = ["resumen", "misiones", "habitos", "finanzas", "tienda", "ajustes"];
  let active = "resumen";

  function valid(name) { return routes.includes(name); }

  function activate(name, render = true) {
    const next = valid(name) ? name : "resumen";
    active = next;
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === next);
    });
    routes.forEach(route => {
      const view = document.getElementById(`view-${route}`);
      if (view) view.hidden = route !== next;
    });
    if (render) {
      const view = LQ.ui && LQ.ui.views && LQ.ui.views[next];
      if (view && typeof view.render === "function") view.render();
    }
    window.scrollTo(0, 0);
  }

  function bind() {
    const tabs = document.getElementById("tabs");
    if (!tabs) return;
    tabs.addEventListener("click", event => {
      const button = event.target.closest("[data-tab]");
      if (button) activate(button.dataset.tab);
    });
  }

  LQ.app = LQ.app || {};
  LQ.app.router = { routes, activate, bind, current: () => active };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
