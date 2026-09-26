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
      <div class="panel">
        <h2>Recordatorios</h2>
        ${LQ.native.notifications.available ? `
        <div class="sub">Notificaciones diarias en tu teléfono. Se guardan al instante.</div>
        ${reminderRow('morning', 'Resumen de la mañana', 'Misiones diarias y hábitos del día')}
        ${reminderRow('evening', 'Aviso de pendientes', 'Solo si te falta algo; avisa si tu racha está en riesgo')}
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
          <div><h2>LifeQuest</h2><div class="sub" style="margin:0">Versión ${escapeHtml(LQ.config.APP_VERSION)}</div></div>
        </div>
        <p class="about-copy">© 2026 ${escapeHtml(LQ.config.APP_OWNER)}. Todos los derechos reservados.</p>
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
    el.querySelectorAll('.reminder-row').forEach(row => {
      row.querySelector('input[type=checkbox]').onchange = () => onReminderChange(row);
      row.querySelector('input[type=time]').onchange = () => onReminderChange(row);
    });
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
      const ok = confirm('Se eliminarán tu cuenta de LifeQuest y TODOS tus datos guardados en la nube. ' +
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
      ui.showToast('Permite las notificaciones de LifeQuest en los ajustes de Android');
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
      const filename = 'lifequest-' + todayStr() + '.json';
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
