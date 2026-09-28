/*
 * Integración con Android (Capacitor). En el navegador todo esto es un no-op,
 * así que la misma carpeta www/ sirve como web y como app nativa.
 *
 *   isNative                     true dentro de la app Android
 *   init({onBack, onResume})     botón "atrás" del sistema y regreso a la app
 *   setTheme(theme)              color de iconos de la barra de estado
 *   shareFile(nombre, texto)     guarda un archivo y abre el menú "Compartir"
 *   notifications                recordatorios locales (ver abajo)
 *   googleSignIn()               login nativo de Google → idToken para Firebase
 */
(function (LQ) {
  "use strict";

  const Cap = globalThis.Capacitor;
  const isNative = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());

  function plugin(name){
    if (!isNative || typeof Cap.registerPlugin !== 'function') return null;
    plugin.cache = plugin.cache || {};
    return plugin.cache[name] || (plugin.cache[name] = Cap.registerPlugin(name));
  }

  const native = {
    isNative,

    init(handlers){
      if (!isNative) return;
      const App = plugin('App');
      App.addListener('backButton', () => {
        const handled = handlers && handlers.onBack && handlers.onBack();
        if (!handled) App.minimizeApp();
      });
      App.addListener('resume', () => { if (handlers && handlers.onResume) handlers.onResume(); });
    },

    setTheme(theme){
      if (!isNative) return;
      const style = theme === 'dark' ? 'DARK' : theme === 'light' ? 'LIGHT' : 'DEFAULT';
      plugin('SystemBars').setStyle({ style }).catch(e => console.warn('SystemBars', e));
    },

    async shareFile(filename, text, dialogTitle){
      const { uri } = await plugin('Filesystem').writeFile({
        path: filename, data: text, directory: 'CACHE', encoding: 'utf8'
      });
      try{
        await plugin('Share').share({ title: filename, files: [uri], dialogTitle: dialogTitle || 'Guardar copia de LifeCoinQuest' });
      }catch(e){
        // Cerrar el menú de compartir sin elegir destino no es un error.
        if (!/cancel/i.test(String(e && e.message))) throw e;
        return false;
      }
      return true;
    }
  };

  // -------------------------------------------------------------------------
  // Inicio de sesión con Google (@capacitor-firebase/authentication)
  // Con skipNativeAuth el plugin solo obtiene el token de Google; la sesión se
  // abre después en el SDK web de Firebase (ver js/infrastructure/cloud.js).
  // -------------------------------------------------------------------------
  native.googleSignIn = async function(){
    const result = await plugin('FirebaseAuthentication').signInWithGoogle({ skipNativeAuth: true });
    const idToken = result && result.credential && result.credential.idToken;
    if (!idToken) throw new Error('Google no devolvió un token de sesión');
    return idToken;
  };
  native.googleSignOut = function(){
    return plugin('FirebaseAuthentication').signOut();
  };

  // -------------------------------------------------------------------------
  // Recordatorios: permisos con @capacitor/local-notifications; programación
  // con el plugin propio LqAlarms (android/.../AlarmsPlugin.java)
  // -------------------------------------------------------------------------
  // Los recordatorios de versiones anteriores los programaba el plugin
  // LocalNotifications: se cancelan una vez para que no suenen dos veces.
  let legacyCleared = false;
  async function clearLegacy(){
    if (legacyCleared) return;
    legacyCleared = true;
    try{
      const LN = plugin('LocalNotifications');
      const [lo, hi] = LQ.Reminders.ID_RANGE;
      const { notifications } = await LN.getPending();
      const ours = (notifications || []).filter(n => (n.id >= lo && n.id <= hi) || n.id === 999).map(n => ({ id: n.id }));
      if (ours.length) await LN.cancel({ notifications: ours });
    }catch(e){ console.warn('clearLegacy', e); }
  }

  native.notifications = {
    available: isNative,

    /** true si hay permiso; con request=true lo pide al usuario si aún no decidió. */
    async hasPermission(request){
      if (!isNative) return false;
      const LN = plugin('LocalNotifications');
      let { display } = await LN.checkPermissions();
      if (display !== 'granted' && request) ({ display } = await LN.requestPermissions());
      return display === 'granted';
    },

    /** true si Android permite alarmas exactas ("Alarmas y recordatorios"). */
    async exactAllowed(){
      if (!isNative) return false;
      try{
        const r = await plugin('LocalNotifications').checkExactNotificationSetting();
        return r && r.exact_alarm === 'granted';
      }catch(e){ return false; }
    },

    /** Abre el ajuste de Android "Alarmas y recordatorios"; devuelve si quedó activado. */
    async requestExact(){
      if (!isNative) return false;
      try{
        const r = await plugin('LocalNotifications').changeExactNotificationSetting();
        return r && r.exact_alarm === 'granted';
      }catch(e){ console.warn('changeExactNotificationSetting', e); return false; }
    },

    /**
     * Sustituye todos los recordatorios programados por los de `list`.
     * Los programa el plugin propio LqAlarms (alarmas tipo despertador, ver
     * android/.../ReminderScheduler.java), que Android y las capas de los
     * fabricantes entregan a su hora aunque la app esté cerrada.
     */
    async replaceAll(list){
      if (!isNative) return;
      await clearLegacy();
      await plugin('LqAlarms').replaceAll({ items: list.map(n => ({
        id: n.id, at: +n.at, title: n.title, body: n.body, kind: n.kind || '', billId: n.billId || ''
      })) });
    },

    /** Programa una notificación de prueba dentro de `seconds` segundos. */
    async test(seconds){
      if (!isNative) return false;
      await plugin('LqAlarms').test({ seconds: seconds || 60,
        title: '🔔 Prueba de LifeCoinQuest',
        body: 'Si ves y oyes esto con la app cerrada, tus recordatorios funcionan.' });
      return native.notifications.exactAllowed();
    },

    /** Muestra una notificación ahora mismo (comprueba permisos y canal, sin alarma). */
    notifyNow(){
      if (!isNative) return Promise.resolve();
      return plugin('LqAlarms').notifyNow({ id: 998, title: '🔔 LifeCoinQuest', body: 'Así se verán y sonarán tus recordatorios.' });
    },

    /** Diagnóstico: permisos, canal, alarmas exactas y cuántos avisos hay programados. */
    async status(){
      if (!isNative) return null;
      try{ return await plugin('LqAlarms').status(); }catch(e){ console.warn('LqAlarms.status', e); return null; }
    },

    /** Abre los ajustes del canal "Recordatorios" (sonido, ventana emergente…). */
    openChannelSettings(){ return isNative ? plugin('LqAlarms').openChannelSettings().catch(() => {}) : Promise.resolve(); },

    /** Llama a fn({kind, billId}) cuando el usuario abre la app tocando un recordatorio. */
    onOpen(fn){
      if (!isNative) return;
      // Avisos antiguos del plugin (instalaciones anteriores a 1.7.1).
      plugin('LocalNotifications').addListener('localNotificationActionPerformed', (e) => {
        fn((e && e.notification && e.notification.extra) || {});
      });
      const check = () => plugin('LqAlarms').consumeOpen()
        .then(r => { if (r && r.kind) fn({ kind: r.kind, billId: r.billId }); })
        .catch(() => {});
      check();
      plugin('App').addListener('resume', check);
    }
  };

  // -------------------------------------------------------------------------
  // Batería (plugin propio LqSystem, android/app/src/main/java/.../SystemPlugin.java)
  // -------------------------------------------------------------------------
  native.power = {
    /** {unrestricted, manufacturer}; unrestricted=true si Android no limita la app en segundo plano. */
    async status(){
      if (!isNative) return { unrestricted: true, manufacturer: '' };
      try{ return await plugin('LqSystem').batteryStatus(); }
      catch(e){ console.warn('batteryStatus', e); return { unrestricted: true, manufacturer: '' }; }
    },
    /** Abre el diálogo del sistema para permitir la app en segundo plano. */
    request(){ return isNative ? plugin('LqSystem').requestUnrestrictedBattery().catch(e => console.warn(e)) : Promise.resolve(); },
    /** Abre la ficha de la app en los Ajustes de Android. */
    openAppSettings(){ return isNative ? plugin('LqSystem').openAppSettings().catch(e => console.warn(e)) : Promise.resolve(); }
  };

  LQ.native = native;
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
