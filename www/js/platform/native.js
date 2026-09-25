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
        await plugin('Share').share({ title: filename, files: [uri], dialogTitle: 'Guardar copia de LifeQuest' });
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
  // abre después en el SDK web de Firebase (ver js/cloud/cloud.js).
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
  const CHANNEL_ID = 'recordatorios';
  let channelReady = null;

  function ensureChannel(){
    if (!channelReady){
      channelReady = plugin('LocalNotifications').createChannel({
        id: CHANNEL_ID, name: 'Recordatorios', description: 'Recordatorios diarios de misiones y hábitos',
        importance: 4, visibility: 1, vibration: true
      }).catch(e => { channelReady = null; console.warn('createChannel', e); });
    }
    return channelReady;
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
      await LN.schedule({
        notifications: list.map(n => ({
          id: n.id,
          title: n.title,
          body: n.body,
          channelId: CHANNEL_ID,
          smallIcon: 'ic_stat_lifequest',
          iconColor: '#6d4aff',
          autoCancel: true,
          // Alarma inexacta que sí suena con el teléfono en reposo; evita pedir
          // el permiso especial de "alarmas exactas" (puede llegar unos minutos tarde).
          schedule: { at: n.at, allowWhileIdle: true },
          isExactNotification: false,
          extra: { kind: n.kind, date: n.date }
        }))
      });
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
