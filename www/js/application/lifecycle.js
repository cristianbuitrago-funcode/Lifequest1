(function (LQ) {
  "use strict";

  let currentDay = null;
  let reminderTimer = null;
  let cloudTimer = null;
  let rolloverTimer = null;

  function isVisible(name) { return LQ.app.router.current() === name; }

  function notifyDaily(result) {
    if (result.shielded) LQ.ui.showToast("🛡️ Tu escudo de racha te protegió: no perdiste monedas ni tu racha.");
    else if (result.punished) LQ.ui.showToast("Se perdieron monedas por misiones diarias sin completar ayer.");
  }

  async function syncBeforeRules() {
    if (!LQ.sync.enabled) return;
    await Promise.race([
      LQ.sync.syncNow().catch(() => undefined),
      new Promise(resolve => setTimeout(resolve, 6000))
    ]);
  }

  async function checkDay() {
    const today = LQ.utils.todayStr();
    if (today === currentDay) return;
    currentDay = today;
    await syncBeforeRules();
    const result = await LQ.Game.checkMissedDaily();
    notifyDaily(result);
    LQ.app.renderer.renderEverything();
    scheduleReminders();
  }

  function scheduleCloud() {
    if (!LQ.sync.enabled) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(() => LQ.sync.syncNow().catch(() => undefined), 2000);
  }

  function scheduleReminders() {
    clearTimeout(reminderTimer);
    reminderTimer = setTimeout(syncReminders, 800);
  }

  let reminderQueue = Promise.resolve();
  function syncReminders() {
    if (!LQ.native.notifications.available) return Promise.resolve();
    reminderQueue = reminderQueue.then(async () => {
      try {
        const wanted = LQ.Reminders.wanted(LQ.state);
        const allowed = wanted && await LQ.native.notifications.hasPermission(false);
        await LQ.native.notifications.replaceAll(allowed ? LQ.Reminders.plan(LQ.state) : []);
      } catch (error) {
        console.error("LifeQuest: error al programar recordatorios", error);
      }
    });
    return reminderQueue;
  }

  // Logros: se revisan tras cada cambio y se celebran cuando no hay otra
  // ventana abierta (ni el tutorial ni otra celebración).
  let achTimer = null, publishTimer = null;
  function scheduleAchievements() {
    clearTimeout(achTimer);
    achTimer = setTimeout(async () => {
      try {
        const list = await LQ.Achievements.claim();
        if (list.length) celebrateAchievements(list);
      } catch (error) {
        console.error("LifeCoinQuest: logros", error);
      }
    }, 600);
  }

  function celebrateAchievements(list) {
    const busy = (LQ.ui.tour && LQ.ui.tour.active) || document.querySelector(".celebrate.show, .modal.show");
    if (busy) { setTimeout(() => celebrateAchievements(list), 1500); return; }
    const coins = list.reduce((sum, a) => sum + a.reward, 0);
    LQ.app.renderer.renderCharacter();
    LQ.ui.celebrate({
      icon: list.length === 1 ? list[0].icon : "🏆",
      title: list.length === 1 ? "¡Logro desbloqueado!" : "¡" + list.length + " logros desbloqueados!",
      message: list.map(a => a.name).join(" · "),
      rewards: ["+" + coins + " 🪙"],
      actions: [{ label: "Ver mis logros", primary: true, onClick: () => {
        LQ.app.router.activate("social");
        LQ.ui.views.social.showSection("logros");
      } }]
    });
  }

  // Perfil público (ranking y clanes): se actualiza unos segundos después de los cambios.
  function schedulePublish() {
    if (!LQ.cloud.user || !LQ.state.profile.social.public) return;
    clearTimeout(publishTimer);
    publishTimer = setTimeout(() => LQ.ui.views.social.publishNow(), 5000);
  }

  function bindExternalChanges() {
    LQ.store.subscribe(change => {
      if (!LQ.sync.applying) scheduleCloud();
      scheduleReminders();
      scheduleAchievements();
      schedulePublish();
    });

    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(`lifequest:${LQ.store.profile}`);
      let reloadTimer;
      channel.onmessage = () => {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(async () => {
          await LQ.store.load();
          LQ.app.renderer.refreshFromState();
        }, 50);
      };
      LQ.store.subscribe(change => channel.postMessage(change));
    }

    LQ.sync.onStatus((status, extra) => {
      if (extra && extra.pulled) LQ.app.renderer.refreshFromState();
      if (isVisible("ajustes") && LQ.ui.views.ajustes.renderAccount) LQ.ui.views.ajustes.renderAccount();
    });

    LQ.cloud.onChange(() => {
      if (isVisible("ajustes")) LQ.ui.views.ajustes.renderAccount();
      if (isVisible("social")) LQ.ui.views.social.render();
      schedulePublish();
    });

    window.addEventListener("online", () => LQ.sync.syncNow().catch(() => undefined));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) checkDay();
    });
  }

  async function start() {
    await LQ.store.init({
      onError: error => {
        console.error("LifeQuest: error al guardar", error);
        LQ.ui.showToast("No se pudo guardar el último cambio");
      }
    });

    if (!LQ.store.isPersistent) {
      LQ.ui.showToast("Este navegador no permite guardar datos: se perderán al recargar.");
    }

    LQ.app.theme.apply(LQ.state.settings.theme);
    LQ.app.renderer.renderEverything();
    LQ.app.router.bind();
    LQ.app.actions.bind();
    LQ.app.theme.bind();
    bindExternalChanges();

    await LQ.cloud.init(8000).catch(error => console.warn("LifeQuest: nube no disponible", error));

    currentDay = LQ.utils.todayStr();
    notifyDaily(await LQ.Game.checkMissedDaily());
    LQ.app.renderer.refreshFromState();

    LQ.native.init({
      onBack: () => {
        if (isVisible("resumen")) return false;
        // Una pantalla con navegación interna (p. ej. DECIDIA) puede atender el "atrás" primero.
        const view = LQ.ui.views[LQ.app.router.current()];
        if (view && typeof view.back === "function" && view.back()) return true;
        LQ.app.router.activate("resumen");
        return true;
      },
      onResume: async () => {
        await syncBeforeRules();
        await checkDay();
        scheduleReminders();
      }
    });

    LQ.native.notifications.onOpen(extra => {
      if (extra && extra.kind === "bill") {
        LQ.app.router.activate("finanzas");
        if (LQ.ui.views.finanzas.showSection) LQ.ui.views.finanzas.showSection("pagos");
      } else if (extra && extra.kind !== "test") {
        LQ.app.router.activate("misiones");
      }
    });
    LQ.ui.syncReminders = syncReminders;
    scheduleReminders();

    rolloverTimer = setInterval(checkDay, 60000);
    scheduleAchievements();
    setTimeout(() => { if (LQ.ui.tour) LQ.ui.tour.maybeStart(); }, 500);
    return { stop };
  }

  function stop() {
    clearTimeout(reminderTimer);
    clearTimeout(cloudTimer);
    clearInterval(rolloverTimer);
    clearTimeout(achTimer);
    clearTimeout(publishTimer);
  }

  LQ.app = LQ.app || {};
  LQ.app.lifecycle = { start, stop, checkDay };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
