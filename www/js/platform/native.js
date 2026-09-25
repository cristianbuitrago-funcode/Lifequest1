/*
 * Integración con Android (Capacitor). En el navegador todo esto es un no-op,
 * así que la misma carpeta www/ sirve como web y como app nativa.
 *
 *   isNative                     true dentro de la app Android
 *   init({onBack, onResume})     botón "atrás" del sistema y regreso a la app
 *   setTheme(theme)              color de iconos de la barra de estado
 *   shareFile(nombre, texto)     guarda un archivo y abre el menú "Compartir"
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

  LQ.native = native;
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
