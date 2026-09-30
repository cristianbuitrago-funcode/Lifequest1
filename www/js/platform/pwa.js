/*
 * Versión web instalable (PWA), pensada sobre todo para iPhone:
 * - registra el service worker (sw.js) para funcionar sin internet;
 * - en Safari de iPhone/iPad muestra cómo "Agregar a pantalla de inicio";
 * - en Chrome/Android ofrece el botón "Instalar".
 * Dentro de la app nativa (Android o iOS) no hace nada.
 */
(function (LQ) {
  "use strict";

  const DISMISS_KEY = 'lifecoinquest:installHint';
  const isNative = !!(LQ.native && LQ.native.isNative);
  const web = !isNative && /^https?:$/.test(location.protocol);
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let deferredPrompt = null;

  if (web && 'serviceWorker' in navigator){
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(e => console.warn('LifeCoinQuest: sin modo sin conexión', e));
    });
  }

  function dismissed(){ try{ return !!localStorage.getItem(DISMISS_KEY); }catch(e){ return false; } }
  function dismiss(){ try{ localStorage.setItem(DISMISS_KEY, '1'); }catch(e){ /* nada */ } }

  function banner(html, onAction){
    if (document.querySelector('.install-hint')) return;
    const el = document.createElement('div');
    el.className = 'install-hint';
    el.setAttribute('role', 'status');
    el.innerHTML = html + '<button class="install-close" aria-label="Cerrar">×</button>';
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    const close = () => { dismiss(); el.classList.remove('show'); setTimeout(() => el.remove(), 250); };
    el.querySelector('.install-close').onclick = close;
    const act = el.querySelector('[data-install]');
    if (act) act.onclick = async () => { await onAction(); close(); };
  }

  /** Se llama cuando la app ya arrancó (sin tapar el tutorial de la primera vez). */
  function maybeShowHint(){
    if (!web || standalone || dismissed()) return;
    if (isIOS){
      banner(`<span class="install-icon">📲</span><span><b>Instala LifeCoinQuest en tu iPhone</b>
        Toca <span class="ios-share" aria-label="Compartir">⬆︎</span> <b>Compartir</b> y luego <b>"Agregar a inicio"</b>.</span>`);
    } else if (deferredPrompt){
      banner(`<span class="install-icon">📲</span><span><b>Instala LifeCoinQuest</b> para abrirla como una app.</span>
        <button class="btn small" data-install>Instalar</button>`, async () => {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice.catch(() => null);
        deferredPrompt = null;
      });
    }
  }

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });

  LQ.pwa = { web, isIOS, standalone, maybeShowHint };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
