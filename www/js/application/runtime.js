(function (LQ) {
  "use strict";

  let started = false;
  let lifecycle = null;

  async function start() {
    if (started) return;
    started = true;
    try {
      lifecycle = await LQ.app.lifecycle.start();
      window.dispatchEvent(new CustomEvent("lifequest:ready"));
    } catch (error) {
      started = false;
      console.error("LifeQuest: error al iniciar", error);
      if (LQ.ui && LQ.ui.showToast) LQ.ui.showToast("Error al iniciar LifeQuest");
      throw error;
    }
  }

  function stop() {
    if (!started) return;
    LQ.app.lifecycle.stop();
    lifecycle = null;
    started = false;
  }

  LQ.app = LQ.app || {};
  LQ.app.runtime = { start, stop, get started() { return started; } };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
