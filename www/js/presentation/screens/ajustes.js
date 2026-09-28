/*
 * Pestaña Ajustes: categorías, recompensas, progresión y copia de seguridad.
 */
(function (LQ) {
  "use strict";

  const { state, store, ui } = LQ;
  const { DIFF_LABELS } = LQ.config;
  const { uid, todayStr, escapeHtml } = LQ.utils;

  const STORAGE_LABELS = {
    indexeddb: LQ.native.isNative ? 'IndexedDB (almacenamiento interno de la app)' : 'IndexedDB de este navegador',
    localstorage: 'localStorage de este navegador',
    memory: 'memoria temporal (no se conservará al recargar)'
  };

  function render(){
    const el = document.getElementById('view-ajustes');
    const s = state.settings;
    el.innerHTML = `
      <div class="panel" id="accountPanel"></div>
      <div class="panel">
        <h2>Categorías (pilares)</h2>
        <div class="sub">Se usan en misiones, hábitos y finanzas</div>
        <div class="settings-list" id="catList"></div>
        <button class="btn ghost small" id="addCatBtn" style="margin-top:8px;">+ Añadir categoría</button>
      </div>
      <div class="panel">
        <h2>Recompensas por dificultad</h2>
        <div class="grid2" id="rewardGrid"></div>
      </div>
      <div class="panel">
        <h2>Progresión y castigos</h2>
        <div class="grid2">
          <div class="field"><label for="stXpBase">XP base por nivel</label><input type="number" id="stXpBase" value="${s.xpBase}"></div>
          <div class="field"><label for="stXpGrowth">Curva de crecimiento</label><input type="number" step="0.05" id="stXpGrowth" value="${s.xpGrowth}"></div>
          <div class="field"><label for="stPunish">Monedas perdidas por misión diaria incumplida</label><input type="number" id="stPunish" value="${s.punishmentCoins}"></div>
        </div>
      </div>
      <div class="panel" id="remindersPanel">
        <h2>Recordatorios</h2>
        ${LQ.native.notifications.available ? `
        <div class="sub">Notificaciones en tu teléfono. Se guardan al instante.</div>
        ${reminderRow('morning', 'Resumen de la mañana', 'Misiones diarias y hábitos del día')}
        ${reminderRow('evening', 'Aviso de pendientes', 'Solo si te falta algo; avisa si tu racha está en riesgo')}
        <div id="extraReminders"></div>
        ${billReminderRow()}
        <div class="reminder-tools" id="reminderTools"></div>
        ` : `
        <div class="sub">Los recordatorios con notificaciones están disponibles en la app de Android.</div>
        `}
      </div>
      <button class="btn" id="saveSettingsBtn">Guardar ajustes</button>
      <div class="panel" style="margin-top:14px;">
        <h2>Copia de seguridad</h2>
        <div class="sub">Tus datos se guardan solo en este dispositivo. Exporta una copia para no perderlos si ${LQ.native.isNative ? 'desinstalas la app o borras sus datos' : 'borras los datos del navegador'}, o para pasarlos a otro equipo.</div>
        <div class="backup-actions">
          <button class="btn ghost small" id="exportBtn">Exportar datos (.json)</button>
          <button class="btn ghost small" id="importBtn">Importar copia…</button>
          <input type="file" id="importFile" ${LQ.native.isNative ? '' : 'accept="application/json,.json"'} hidden>
        </div>
        <div class="storage-info">Almacenamiento: ${escapeHtml(STORAGE_LABELS[store.storageKind] || store.storageKind)}</div>
      </div>
      <div class="panel about-panel">
        <div class="about-head">
          <img src="img/logo-192.png" alt="" width="52" height="52">
          <div><h2>LifeCoinQuest</h2><div class="sub" style="margin:0">Versión ${escapeHtml(LQ.config.APP_VERSION)}</div></div>
        </div>
        <p class="about-copy">© 2026 ${escapeHtml(LQ.config.APP_OWNER)}. Todos los derechos reservados.</p>
        <button class="btn ghost small" id="tourBtn" style="margin-bottom:10px">▶ Ver el tutorial</button>
        <div class="about-links">
          <a href="legal/terminos.html">Términos de uso</a>
          <a href="legal/privacidad.html">Política de privacidad</a>
          <a href="legal/licencias.html">Licencias de terceros</a>
        </div>
      </div>
    `;
    renderAccount();
    renderCatList();
    renderRewardGrid();
    document.getElementById('addCatBtn').onclick = () => {
      s.categories.push({id:'cat'+uid(), name:'Nueva categoría', color:'#6d4aff'});
      renderCatList();
    };
    document.getElementById('saveSettingsBtn').onclick = async () => {
      s.xpBase = parseFloat(document.getElementById('stXpBase').value) || s.xpBase;
      s.xpGrowth = parseFloat(document.getElementById('stXpGrowth').value) || s.xpGrowth;
      s.punishmentCoins = parseFloat(document.getElementById('stPunish').value) || 0;
      document.querySelectorAll('.cat-row').forEach(row=>{
        const id = row.dataset.id;
        const cat = s.categories.find(c=>c.id===id);
        if (!cat) return;
        cat.name = row.querySelector('input[type=text]').value.trim() || cat.name;
        cat.color = row.querySelector('input[type=color]').value;
      });
      Object.keys(s.rewardTable).forEach(diff=>{
        const xpEl = document.getElementById('rw_'+diff+'_xp');
        const coinEl = document.getElementById('rw_'+diff+'_coins');
        if (xpEl) s.rewardTable[diff].xp = parseFloat(xpEl.value) || s.rewardTable[diff].xp;
        if (coinEl) s.rewardTable[diff].coins = parseFloat(coinEl.value) || s.rewardTable[diff].coins;
      });
      const ok = await store.saveSettings();
      if (ok) ui.showToast('Ajustes guardados');
      ui.renderAll();
    };
    el.querySelectorAll('.reminder-row[data-kind]').forEach(row => {
      row.querySelector('input[type=checkbox]').onchange = () => onReminderChange(row);
      row.querySelector('input[type=time]').onchange = () => onReminderChange(row);
    });
    if (LQ.native.notifications.available){
      renderExtraReminders();
      bindBillReminders();
      renderReminderTools();
    }
    document.getElementById('tourBtn').onclick = () => ui.tour.start();
    document.getElementById('exportBtn').onclick = exportBackup;
    document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();
    document.getElementById('importFile').onchange = (e) => importBackup(e.target);
  }

  // -------------------------------------------------------------------------
  // Cuenta y sincronización
  // -------------------------------------------------------------------------
  const GOOGLE_ICON = '<svg viewBox="0 0 48 48" width="16" height="16" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

  function timeAgo(ms){
    if (!ms) return 'nunca';
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return 'hace un momento';
    if (s < 3600) return 'hace ' + Math.round(s / 60) + ' min';
    if (s < 86400) return 'hace ' + Math.round(s / 3600) + ' h';
    return new Date(ms).toLocaleDateString();
  }

  function syncStatusText(){
    const st = LQ.sync.status;
    if (st.state === 'syncing') return 'Sincronizando…';
    if (st.state === 'offline') return 'Sin conexión: se sincronizará cuando vuelva.';
    if (st.state === 'error') return 'Error al sincronizar' + (st.error && st.error.message ? ': ' + st.error.message : '') + '. Se reintentará.';
    return 'Sincronizado ' + timeAgo(st.lastSyncAt || (store.meta && store.meta.lastSyncAt));
  }

  function renderAccount(){
    const box = document.getElementById('accountPanel');
    if (!box) return;
    const cloud = LQ.cloud;
    let body;
    if (!cloud.configured){
      body = `<div class="sub">Inicia sesión con Google para guardar tus datos en la nube y usarlos en varios dispositivos. La nube aún no está configurada en esta versión de la app.</div>`;
    } else if (!cloud.user){
      body = `
        <div class="sub">Inicia sesión con Google para guardar tus datos en la nube y usarlos en varios dispositivos. Lo que ya tienes en este dispositivo se conserva y se sube a tu cuenta.</div>
        <button class="btn google-btn" id="signInBtn">${GOOGLE_ICON}<span>Iniciar sesión con Google</span></button>`;
    } else {
      const u = cloud.user;
      body = `
        <div class="account-row">
          <div class="account-avatar">${escapeHtml(((u.name || u.email || '?').trim()[0] || '?').toUpperCase())}</div>
          <div class="account-info">
            <b>${escapeHtml(u.name || u.email || 'Cuenta de Google')}</b>
            ${u.name && u.email ? `<span>${escapeHtml(u.email)}</span>` : ''}
          </div>
        </div>
        <div class="storage-info" id="syncStatus">${escapeHtml(syncStatusText())}</div>
        <div class="backup-actions" style="margin-top:10px;">
          <button class="btn ghost small" id="syncNowBtn" ${LQ.sync.status.state === 'syncing' ? 'disabled' : ''}>Sincronizar ahora</button>
          <button class="btn ghost small" id="signOutBtn">Cerrar sesión</button>
        </div>
        <button class="link-danger" id="deleteAccountBtn">Eliminar mi cuenta y mis datos de la nube</button>`;
    }
    box.innerHTML = `<h2>Cuenta y sincronización</h2>` + body;

    const signIn = document.getElementById('signInBtn');
    if (signIn) signIn.onclick = async () => {
      signIn.disabled = true;
      try{
        await cloud.signIn();
      }catch(e){
        console.error(e);
        if (!/cancel/i.test(String(e && (e.code || e.message)))) ui.showToast(signInErrorText(e));
      }finally{
        signIn.disabled = false;
      }
    };
    const syncBtn = document.getElementById('syncNowBtn');
    if (syncBtn) syncBtn.onclick = async () => {
      try{ await LQ.sync.syncNow(); ui.showToast('Datos sincronizados'); }
      catch(e){ ui.showToast('No se pudo sincronizar'); }
    };
    const del = document.getElementById('deleteAccountBtn');
    if (del) del.onclick = async () => {
      const ok = confirm('Se eliminarán tu cuenta de LifeCoinQuest y TODOS tus datos guardados en la nube. ' +
        'Los datos de este dispositivo se conservan. Esta acción no se puede deshacer. ¿Continuar?');
      if (!ok) return;
      const word = prompt('Para confirmar, escribe ELIMINAR');
      if ((word || '').trim().toUpperCase() !== 'ELIMINAR'){ ui.showToast('Eliminación cancelada'); return; }
      del.disabled = true;
      try{
        await cloud.deleteAccount();
        ui.showToast('Tu cuenta y tus datos de la nube fueron eliminados');
      }catch(e){
        console.error(e);
        if (!/cancel/i.test(String(e && (e.code || e.message)))) ui.showToast('No se pudo eliminar la cuenta: ' + ((e && e.message) || 'error'));
        del.disabled = false;
      }
    };
    const signOut = document.getElementById('signOutBtn');
    if (signOut) signOut.onclick = async () => {
      if (!confirm('¿Cerrar sesión? Tus datos se quedan en este dispositivo y en la nube.')) return;
      await cloud.signOut();
      ui.showToast('Sesión cerrada');
    };
  }

  function signInErrorText(e){
    const code = (e && e.code) || '';
    if (code === 'auth/unauthorized-domain') return 'Este dominio no está autorizado en Firebase (Authentication → Settings).';
    if (code === 'auth/popup-blocked') return 'El navegador bloqueó la ventana de Google. Permite las ventanas emergentes.';
    if (code === 'auth/network-request-failed') return 'Sin conexión. Inténtalo de nuevo.';
    return (e && e.message) || 'No se pudo iniciar sesión';
  }

  function reminderRow(kind, title, hint){
    const r = state.settings.reminders[kind];
    return `
      <div class="reminder-row" data-kind="${kind}">
        <label class="toggle">
          <input type="checkbox" ${r.enabled ? 'checked' : ''}>
          <span>${title}<small>${hint}</small></span>
        </label>
        <input type="time" value="${escapeHtml(r.time)}" aria-label="Hora" ${r.enabled ? '' : 'disabled'}>
      </div>`;
  }

  async function onReminderChange(row){
    const kind = row.dataset.kind;
    const box = row.querySelector('input[type=checkbox]');
    const timeEl = row.querySelector('input[type=time]');
    const r = state.settings.reminders[kind];
    const turningOn = box.checked && !r.enabled;
    if (turningOn && !(await LQ.native.notifications.hasPermission(true))){
      box.checked = false;
      ui.showToast('Permite las notificaciones de LifeCoinQuest en los ajustes de Android');
      return;
    }
    r.enabled = box.checked;
    if (timeEl.value) r.time = timeEl.value;
    timeEl.disabled = !r.enabled;
    await store.saveSettings();
    await ui.syncReminders();
    if (r.enabled) ui.showToast('Recordatorio programado a las ' + r.time);
    else ui.showToast('Recordatorio desactivado');
  }

  // -------------------------------------------------------------------------
  // Alarmas extra, pagos y herramientas de recordatorios
  // -------------------------------------------------------------------------
  const MAX_EXTRA = LQ.Reminders.MAX_EXTRA;

  async function saveReminders(message){
    await store.saveSettings();
    await ui.syncReminders();
    if (message) ui.showToast(message);
  }

  let askedBattery = false;
  async function ensurePermission(){
    if (await LQ.native.notifications.hasPermission(true)){
      // La primera vez que se activan avisos, pide también que Android no limite
      // la app en segundo plano (si no, muchos teléfonos bloquean las alarmas).
      if (!askedBattery){
        askedBattery = true;
        const power = await LQ.native.power.status();
        if (!power.unrestricted) await LQ.native.power.request();
      }
      return true;
    }
    ui.showToast('Permite las notificaciones de LifeCoinQuest en los ajustes de Android');
    return false;
  }

  function renderExtraReminders(){
    const box = document.getElementById('extraReminders');
    if (!box) return;
    const list = state.settings.reminders.extra;
    box.innerHTML = `
      <div class="extra-head">
        <span>Alarmas extra<small>Por si lo dejas para "más tarde": te vuelve a avisar de lo pendiente</small></span>
      </div>
      ${list.map(x => `
        <div class="reminder-row extra-row" data-extra="${escapeHtml(x.id)}">
          <label class="toggle"><input type="checkbox" ${x.enabled ? 'checked' : ''}><span>Alarma</span></label>
          <input type="time" value="${escapeHtml(x.time)}" aria-label="Hora de la alarma extra">
          <button class="icon-btn" data-remove aria-label="Quitar alarma">${ui.svgTrash()}</button>
        </div>`).join('')}
      ${list.length < MAX_EXTRA ? '<button class="btn ghost small" id="addExtraBtn">+ Añadir alarma</button>' : '<div class="hint">Máximo ' + MAX_EXTRA + ' alarmas extra.</div>'}`;
    box.querySelectorAll('.extra-row').forEach(row => {
      const item = list.find(x => x.id === row.dataset.extra);
      row.querySelector('input[type=checkbox]').onchange = async (e) => {
        if (e.target.checked && !(await ensurePermission())){ e.target.checked = false; return; }
        item.enabled = e.target.checked;
        await saveReminders(item.enabled ? 'Alarma a las ' + item.time : 'Alarma desactivada');
      };
      row.querySelector('input[type=time]').onchange = async (e) => {
        if (!e.target.value) return;
        item.time = e.target.value;
        await saveReminders('Alarma a las ' + item.time);
      };
      row.querySelector('[data-remove]').onclick = async () => {
        state.settings.reminders.extra = list.filter(x => x !== item);
        await saveReminders('Alarma eliminada');
        renderExtraReminders();
      };
    });
    const add = document.getElementById('addExtraBtn');
    if (add) add.onclick = async () => {
      if (!(await ensurePermission())) return;
      const last = list.length ? list[list.length - 1].time : '17:00';
      const [h, m] = LQ.Reminders.parseTime(last, '17:00');
      const time = String(Math.min(23, h + 1)).padStart(2, '0') + ':' + String(m).padStart(2, '0');
      list.push({ id: 'x' + uid(), time, enabled: true });
      await saveReminders('Alarma extra a las ' + time + ' (puedes cambiar la hora)');
      renderExtraReminders();
    };
  }

  function billReminderRow(){
    const b = state.settings.reminders.bills;
    return `
      <div class="reminder-row bill-reminder">
        <label class="toggle">
          <input type="checkbox" id="billRemOn" ${b.enabled !== false ? 'checked' : ''}>
          <span>Pagos<small>Aviso días antes y 3 veces el día del pago (${escapeHtml(b.dueTimes.join(', '))})</small></span>
        </label>
        <select id="billRemDays" aria-label="Días de anticipación" ${b.enabled !== false ? '' : 'disabled'}>
          ${[1, 2, 3, 5, 7].map(n => `<option value="${n}" ${n === b.daysBefore ? 'selected' : ''}>${n} ${n === 1 ? 'día' : 'días'} antes</option>`).join('')}
        </select>
      </div>`;
  }

  function bindBillReminders(){
    const b = state.settings.reminders.bills;
    const on = document.getElementById('billRemOn'), days = document.getElementById('billRemDays');
    on.onchange = async () => {
      if (on.checked && !(await ensurePermission())){ on.checked = false; return; }
      b.enabled = on.checked;
      days.disabled = !b.enabled;
      await saveReminders(b.enabled ? 'Te avisaremos de tus pagos' : 'Avisos de pagos desactivados');
    };
    days.onchange = async () => {
      b.daysBefore = parseInt(days.value, 10) || 3;
      await saveReminders('Aviso ' + b.daysBefore + (b.daysBefore === 1 ? ' día' : ' días') + ' antes de cada pago');
    };
  }

  async function renderReminderTools(){
    const box = document.getElementById('reminderTools');
    if (!box) return;
    const [exact, power, st] = await Promise.all([LQ.native.notifications.exactAllowed(), LQ.native.power.status(), LQ.native.notifications.status()]);
    // Consejos extra según el fabricante (sus "ahorradores" cierran las apps en segundo plano).
    const brand = power.manufacturer || '';
    const oemTip = /xiaomi|redmi|poco/.test(brand) ? ' En Xiaomi activa también <b>Inicio automático</b> y en Batería elige <b>Sin restricciones</b>.'
      : /huawei|honor/.test(brand) ? ' En Huawei/Honor: Batería → Inicio de apps → LifeCoinQuest → <b>Gestionar manualmente</b> y activa todo.'
      : /samsung/.test(brand) ? ' En Samsung: Batería → Límites de uso en segundo plano, y quita LifeCoinQuest de las apps en <b>suspensión</b>.'
      : /oppo|realme|oneplus|vivo/.test(brand) ? ' En tu teléfono permite también el <b>Inicio automático</b> y la <b>actividad en segundo plano</b>.'
      : /nubia|zte/.test(brand) ? ' En Nubia/ZTE: Ajustes → Apps → LifeCoinQuest → permite el <b>Inicio automático</b> y la <b>ejecución en segundo plano</b>, y en Batería elige <b>Sin restricciones</b>.'
      : '';
    // Diagnóstico: qué puede estar impidiendo que suenen.
    const fmtNext = (ms) => new Date(ms).toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    const check = (ok, text) => `<li class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'} ${text}</li>`;
    const diag = st ? `
      <ul class="notif-diag">
        ${check(st.notificationsEnabled, st.notificationsEnabled ? 'Notificaciones permitidas' : 'Las notificaciones de la app están <b>apagadas</b> en Android')}
        ${check(st.channelImportance >= 4, st.channelImportance === 0 ? 'El canal "Recordatorios" está <b>bloqueado</b>'
          : st.channelImportance >= 4 ? 'Canal "Recordatorios" con sonido y ventana emergente' : 'El canal "Recordatorios" está en modo <b>silencioso</b>')}
        ${check(st.pending > 0, st.pending > 0 ? st.pending + ' avisos programados · el próximo: ' + escapeHtml(fmtNext(st.next)) : 'No hay avisos programados (activa alguno arriba)')}
      </ul>
      ${!st.notificationsEnabled || st.channelImportance < 4 ? '<button class="btn small" id="channelBtn">Arreglar sonido y ventana</button>' : ''}` : '';
    box.innerHTML = `
      <div class="reminder-row">
        <span class="toggle-text">Alarmas puntuales
          <small>${exact ? '✓ Activadas: suenan a su hora aunque la app esté cerrada.' : 'Desactivadas: Android puede retrasar o silenciar los avisos con la app cerrada.'}</small>
        </span>
        ${exact ? '' : '<button class="btn small" id="exactBtn">Activar</button>'}
      </div>
      <div class="reminder-row">
        <span class="toggle-text">Funcionar en segundo plano
          <small>${power.unrestricted ? '✓ Sin restricciones de batería: los avisos llegan con la app cerrada.' : 'Android está limitando la app para ahorrar batería y puede bloquear los avisos con la app cerrada.'}</small>
        </span>
        ${power.unrestricted ? '' : '<button class="btn small" id="batteryBtn">Permitir</button>'}
      </div>
      ${diag}
      <div class="backup-actions" style="margin-top:10px">
        <button class="btn ghost small" id="nowNotifBtn">🔔 Probar ahora</button>
        <button class="btn ghost small" id="testNotifBtn">⏱️ Probar en 1 minuto</button>
        ${st ? '<button class="btn ghost small" id="soundBtn">🔊 Sonido del aviso</button>' : ''}
      </div>
      <div class="hint">¿Aún no suenan con la app cerrada? No la cierres deslizándola desde las apps recientes (en algunos teléfonos eso cancela sus alarmas).${oemTip}
        <button class="link-btn" id="appSettingsBtn" type="button">Abrir ajustes de la app</button></div>`;
    const batteryBtn = document.getElementById('batteryBtn');
    if (batteryBtn) batteryBtn.onclick = async () => {
      await LQ.native.power.request();
      // El diálogo es del sistema: se vuelve a comprobar al regresar a la app.
      setTimeout(renderReminderTools, 1500);
    };
    const appBtn = document.getElementById('appSettingsBtn');
    if (appBtn) appBtn.onclick = () => LQ.native.power.openAppSettings();
    const exactBtn = document.getElementById('exactBtn');
    if (exactBtn) exactBtn.onclick = async () => {
      const ok = await LQ.native.notifications.requestExact();
      await ui.syncReminders();
      ui.showToast(ok ? 'Alarmas puntuales activadas' : 'Activa "Alarmas y recordatorios" para LifeCoinQuest');
      renderReminderTools();
    };
    document.getElementById('testNotifBtn').onclick = async () => {
      if (!(await ensurePermission())) return;
      await LQ.native.notifications.test(60);
      ui.showToast('Sal de la app y bloquea el teléfono: en 1 minuto sonará la prueba');
      setTimeout(renderReminderTools, 500);
    };
    document.getElementById('nowNotifBtn').onclick = async () => {
      if (!(await ensurePermission())) return;
      await LQ.native.notifications.notifyNow();
      ui.showToast('Si no la ves ni la oyes, toca "Arreglar sonido y ventana"');
      setTimeout(renderReminderTools, 800);
    };
    ['channelBtn', 'soundBtn'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.onclick = () => LQ.native.notifications.openChannelSettings();
    });
  }

  function renderCatList(){
    const box = document.getElementById('catList');
    if (!box) return;
    box.innerHTML = state.settings.categories.map(c => `
      <div class="cat-row" data-id="${escapeHtml(c.id)}">
        <input type="color" value="${escapeHtml(c.color)}" aria-label="Color">
        <input type="text" value="${escapeHtml(c.name)}" aria-label="Nombre">
        <button class="icon-btn" data-action="delete-category" data-id="${escapeHtml(c.id)}" aria-label="Eliminar">${ui.svgTrash()}</button>
      </div>
    `).join('');
  }

  function renderRewardGrid(){
    const box = document.getElementById('rewardGrid');
    if (!box) return;
    const s = state.settings;
    box.innerHTML = Object.keys(s.rewardTable).map(diff => `
      <div class="field">
        <label>${DIFF_LABELS[diff] || escapeHtml(diff)} — XP / Monedas</label>
        <div class="row">
          <input type="number" id="rw_${diff}_xp" value="${s.rewardTable[diff].xp}" aria-label="XP">
          <input type="number" id="rw_${diff}_coins" value="${s.rewardTable[diff].coins}" aria-label="Monedas">
        </div>
      </div>
    `).join('');
  }

  async function exportBackup(){
    try{
      const data = await store.exportData();
      const json = JSON.stringify(data, null, 2);
      const filename = 'lifecoinquest-' + todayStr() + '.json';
      if (LQ.native.isNative){
        // En Android no hay descargas: se guarda el archivo y se abre "Compartir"
        // (Drive, correo, Archivos…).
        await LQ.native.shareFile(filename, json);
        return;
      }
      const blob = new Blob([json], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      ui.showToast('Copia exportada');
    }catch(e){
      console.error(e);
      ui.showToast('No se pudo exportar la copia');
    }
  }

  async function importBackup(input){
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (!confirm('Esto reemplazará todos tus datos actuales por los de la copia. ¿Continuar?')) return;
    try{
      const data = JSON.parse(await file.text());
      await store.importData(data);
      ui.applyTheme(state.settings.theme);
      ui.renderAll();
      render();
      ui.showToast('Copia importada');
    }catch(e){
      console.error(e);
      ui.showToast(e && e.message ? e.message : 'No se pudo importar la copia');
    }
  }

  ui.actions['delete-category'] = (id) => {
    state.settings.categories = state.settings.categories.filter(c=>c.id!==id);
    renderCatList();
  };

  ui.views.ajustes = { render, renderAccount };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
