(function (LQ) {
  "use strict";

  function boot() {
    const mount = document.getElementById("app-root");
    if (!mount) throw new Error("No existe #app-root");
    LQ.app.mountShell(mount);
    LQ.app.runtime.start();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
