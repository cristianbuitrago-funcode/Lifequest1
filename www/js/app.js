/*
 * Arranque de la app: pestañas, tema, delegación de eventos y sincronización
 * entre pestañas del navegador.
 */
(function (LQ) {
  "use strict";

  const { state, store, Game, ui } = LQ;
  const THEME_KEY = 'lifequest:theme';

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  function isVisible(tab){ return !document.getElementById('view-'+tab).hidden; }

  ui.renderAll = function(){
    ui.renderCharacterCard();
    ui.views.resumen.render();
    ui.views.misiones.renderList();
    ui.views.habitos.renderList();
    if (isVisible('finanzas')) ui.views.finanzas.render();
    if (isVisible('tienda')) ui.views.tienda.render();
  };

  // ---------------------------------------------------------------------
  // Pestañas
  // ---------------------------------------------------------------------
  function showTab(tab){
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab === tab));
    Object.keys(ui.views).forEach(k => { document.getElementById('view-'+k).hidden = (k !== tab); });
    ui.views[tab].render();
    window.scrollTo(0, 0);
  }
  ui.showTab = showTab;
  document.getElementById('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn'); if (!btn) return;
    showTab(btn.dataset.tab);
  });

  // ---------------------------------------------------------------------
  // Acciones (reemplaza los onclick inline: data-action + data-id)
  // ---------------------------------------------------------------------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = ui.actions[el.dataset.action];
    if (fn) fn(el.dataset.id, el);
  });

  // ---------------------------------------------------------------------
  // Tema
  // ---------------------------------------------------------------------
  ui.applyTheme = function(t){
    if (t === 'light') document.documentElement.setAttribute('data-theme','light');
    else if (t === 'dark') document.documentElement.setAttribute('data-theme','dark');
    else document.documentElement.removeAttribute('data-theme');
    // Copia síncrona para aplicar el tema antes del primer pintado (ver index.html).
    try{ localStorage.setItem(THEME_KEY, t || 'system'); }catch(e){}
    LQ.native.setTheme(t);
    ui.applyCosmetics(); // el tema comprado tiene colores para claro y oscuro
    if (isVisible('resumen')) ui.views.resumen.render(); // el radar usa colores del tema
  };

  document.getElementById('themeBtn').addEventListener('click', async () => {
    const order = ['system','light','dark'];
    const cur = state.settings.theme || 'system';
    const next = order[(order.indexOf(cur)+1) % order.length];
    state.settings.theme = next;
    ui.applyTheme(next);
    ui.showToast('Tema: ' + (next==='system'?'automático':(next==='light'?'claro':'oscuro')));
    await store.saveSettings();
  });

  if (window.matchMedia){
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if ((state.settings.theme||'system') !== 'system') return;
      ui.applyCosmetics();
      if (isVisible('resumen')) ui.views.resumen.render();
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
  }

  // ---------------------------------------------------------------------
  // Varias pestañas abiertas: cuando una guarda, las demás recargan el
  // estado para no sobrescribir datos con una copia desactualizada.
  // ---------------------------------------------------------------------
  // Repinta todo tras cambios que no vienen de esta pantalla (otra pestaña, la nube).
  function refreshFromState(){
    ui.applyTheme(state.settings.theme);
    ui.renderAll();
    if (isVisible('misiones')) ui.views.misiones.render();
    if (isVisible('habitos')) ui.views.habitos.render();
  }

  function setupCrossTabSync(){
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('lifequest:' + store.profile);
    let reloading = null;
    store.subscribe(change => channel.postMessage(change));
    channel.onmessage = () => {
      clearTimeout(reloading);
      reloading = setTimeout(async () => {
        await store.load();
        refreshFromState();
      }, 50);
    };
  }

  // ---------------------------------------------------------------------
  // Nube: sincroniza tras cada cambio (agrupando 2 s), al volver a la app y
  // al recuperar conexión. Sin cuenta o sin configurar, no hace nada.
  // ---------------------------------------------------------------------
  let cloudTimer = null;
  function syncCloudNow(){
    return LQ.sync.syncNow().catch(e => console.warn('LifeQuest: sincronización fallida', e));
  }
  function scheduleCloudSync(){
    if (!LQ.sync.enabled) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(syncCloudNow, 2000);
  }
  // Antes de aplicar castigos conviene traer lo hecho en otros dispositivos,
  // pero sin bloquear la app si no hay conexión.
  function syncBeforeRules(){
    if (!LQ.sync.enabled) return Promise.resolve();
    return Promise.race([syncCloudNow(), new Promise(r => setTimeout(r, 6000))]);
  }

  function setupCloud(){
    store.subscribe(() => { if (!LQ.sync.applying) scheduleCloudSync(); });
    LQ.sync.onStatus((status, extra) => {
      if (extra.pulled) refreshFromState();
      if (isVisible('ajustes')) ui.views.ajustes.renderAccount();
    });
    LQ.cloud.onChange(() => { if (isVisible('ajustes')) ui.views.ajustes.renderAccount(); });
    window.addEventListener('online', syncCloudNow);
  }

  // ---------------------------------------------------------------------
  // Cambio de día con la app abierta: aplica castigos y refresca.
  // ---------------------------------------------------------------------
  let currentDay = LQ.utils.todayStr();
  async function checkDayRollover(){
    const today = LQ.utils.todayStr();
    if (today === currentDay) return;
    currentDay = today;
    await syncBeforeRules();
    const r = await Game.checkMissedDaily();
    notifyDailyCheck(r);
    ui.renderAll();
    scheduleReminderSync();
  }

  function notifyDailyCheck(r){
    if (r.shielded) ui.showToast('🛡️ Tu escudo de racha te protegió: no perdiste monedas ni tu racha.');
    else if (r.punished) ui.showToast('Se perdieron monedas por misiones diarias sin completar ayer.');
  }

  // ---------------------------------------------------------------------
  // Recordatorios: se reprograman al abrir la app, al volver a ella y tras
  // cada cambio, para que el texto refleje lo que realmente falta.
  // ---------------------------------------------------------------------
  let reminderTimer = null;
  let reminderRun = Promise.resolve();
  function syncReminders(){
    if (!LQ.native.notifications.available) return Promise.resolve();
    reminderRun = reminderRun.then(async () => {
      try{
        const r = state.settings.reminders;
        const wanted = r.morning.enabled || r.evening.enabled;
        const allowed = wanted && await LQ.native.notifications.hasPermission(false);
        await LQ.native.notifications.replaceAll(allowed ? LQ.Reminders.plan(state) : []);
      }catch(e){
        console.error('LifeQuest: error al programar recordatorios', e);
      }
    });
    return reminderRun;
  }
  ui.syncReminders = syncReminders;
  function scheduleReminderSync(){
    clearTimeout(reminderTimer);
    reminderTimer = setTimeout(syncReminders, 800);
  }

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------
  async function start(){
    await store.init({
      onError: (e) => {
        console.error('LifeQuest: error al guardar', e);
        ui.showToast('No se pudo guardar el último cambio');
      }
    });
    if (!store.isPersistent) ui.showToast('Este navegador no permite guardar datos: se perderán al recargar.');
    ui.applyTheme(state.settings.theme);
    ui.renderAll();
    setupCloud();
    // Sesión de la nube + primera sincronización (como mucho 8 s) antes de las reglas.
    await LQ.cloud.init(8000).catch(e => console.warn('LifeQuest: nube no disponible', e));
    const r = await Game.checkMissedDaily();
    notifyDailyCheck(r);
    refreshFromState();
    setupCrossTabSync();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDayRollover(); });
    LQ.native.init({
      // Botón "atrás" de Android: vuelve a Resumen; desde Resumen minimiza la app.
      onBack: () => {
        if (isVisible('resumen')) return false;
        showTab('resumen');
        return true;
      },
      onResume: async () => { await syncBeforeRules(); checkDayRollover(); scheduleReminderSync(); }
    });
    LQ.native.notifications.onOpen(() => showTab('misiones'));
    store.subscribe(scheduleReminderSync);
    scheduleReminderSync();
    setInterval(checkDayRollover, 60 * 1000);
  }

  start().catch(e => {
    console.error('LifeQuest: error al iniciar', e);
    ui.showToast('Error al iniciar LifeQuest');
  });
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
