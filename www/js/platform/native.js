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

    async shareFile(filename, text){
      const { uri } = await plugin('Filesystem').writeFile({
        path: filename, data: text, directory: 'CACHE', encoding: 'utf8'
      });
      try{
        await plugin('Share').share({ title: filename, files: [uri], dialogTitle: 'Guardar copia de LifeCoinQuest' });
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
  // Notificaciones locales (@capacitor/local-notifications)
  // -------------------------------------------------------------------------
  // Canal nuevo con importancia alta: suena y aparece arriba aunque la app esté
  // cerrada. (Un canal existente no se puede cambiar; por eso tiene otro id.)
  const CHANNEL_ID = 'recordatorios-alertas';
  let channelReady = null;

  function ensureChannel(){
    if (!channelReady){
      channelReady = plugin('LocalNotifications').createChannel({
        id: CHANNEL_ID, name: 'Recordatorios', description: 'Misiones, hábitos y pagos',
        importance: 5, visibility: 1, vibration: true, lights: true, lightColor: '#D4AF37'
      }).catch(e => { channelReady = null; console.warn('createChannel', e); });
    }
    return channelReady;
  }

  function toNative(n, exact){
    return {
      id: n.id,
      title: n.title,
      body: n.body,
      largeBody: n.body,
      channelId: CHANNEL_ID,
      smallIcon: 'ic_stat_lifequest',
      iconColor: '#D4AF37',
      autoCancel: true,
      // Con el permiso de "Alarmas y recordatorios" la alarma es exacta y suena
      // aunque la app esté cerrada y el teléfono en reposo. Sin él, Android la
      // trata como inexacta (puede retrasarla); nunca se abre el permiso solo.
      schedule: { at: n.at, allowWhileIdle: true },
      isExactNotification: exact,
      extra: Object.assign({ kind: n.kind, date: n.date }, n.billId ? { billId: n.billId } : {})
    };
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

    /** Sustituye todos los recordatorios programados por los de `list`. */
    async replaceAll(list){
      if (!isNative) return;
      const LN = plugin('LocalNotifications');
      const [lo, hi] = LQ.Reminders.ID_RANGE;
      const { notifications } = await LN.getPending();
      const ours = (notifications || []).filter(n => n.id >= lo && n.id <= hi).map(n => ({ id: n.id }));
      if (ours.length) await LN.cancel({ notifications: ours });
      if (!list.length) return;
      await ensureChannel();
      const exact = await native.notifications.exactAllowed();
      await LN.schedule({ notifications: list.map(n => toNative(n, exact)) });
    },

    /** Programa una notificación de prueba dentro de `seconds` segundos. */
    async test(seconds){
      if (!isNative) return false;
      await ensureChannel();
      const exact = await native.notifications.exactAllowed();
      await plugin('LocalNotifications').schedule({ notifications: [toNative({
        id: 999, kind: 'test', date: '',
        at: new Date(Date.now() + (seconds || 60) * 1000),
        title: '🔔 Prueba de LifeCoinQuest',
        body: 'Si ves y oyes esto con la app cerrada, tus recordatorios funcionan.'
      }, exact)] });
      return exact;
    },

    /** Llama a fn(extra) cuando el usuario toca un recordatorio. */
    onOpen(fn){
      if (!isNative) return;
      plugin('LocalNotifications').addListener('localNotificationActionPerformed', (e) => {
        fn((e && e.notification && e.notification.extra) || {});
      });
    }
  };

  LQ.native = native;
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
