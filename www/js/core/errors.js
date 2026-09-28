/*
 * Registro de errores local. Guarda en el teléfono los últimos fallos de la
 * app (mensaje, dónde ocurrió, versión y pestaña). Nunca se envía solo: el
 * usuario decide compartirlo desde Ajustes → Ayuda y errores.
 */
(function (LQ) {
  "use strict";

  const KEY = 'lifecoinquest:errors';
  const MAX = 30;

  function read(){
    try{ return JSON.parse(localStorage.getItem(KEY) || '[]'); }catch(e){ return []; }
  }
  function write(list){
    try{ localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); }catch(e){ /* sin almacenamiento */ }
  }

  function text(v){
    if (v == null) return '';
    if (v instanceof Error || (v && v.message)) return String(v.message || v);
    if (typeof v === 'object'){ try{ return JSON.stringify(v).slice(0, 300); }catch(e){ return String(v); } }
    return String(v);
  }

  function record(message, stack){
    const msg = text(message).slice(0, 300);
    if (!msg) return;
    // Ruido de red que no es un fallo de la app.
    if (/ERR_CERT|Failed to load resource|ResizeObserver loop/.test(msg)) return;
    const list = read();
    const last = list[list.length - 1];
    if (last && last.msg === msg && Date.now() - last.t < 5000){ last.n = (last.n || 1) + 1; write(list); return; }
    list.push({
      t: Date.now(), msg,
      at: String(stack || '').split('\n').slice(0, 3).join(' | ').slice(0, 300),
      v: (LQ.config && LQ.config.APP_VERSION) || '',
      tab: (LQ.app && LQ.app.router && LQ.app.router.current && LQ.app.router.current()) || ''
    });
    write(list);
  }

  if (typeof window !== 'undefined'){
    window.addEventListener('error', (e) => record(e.message || e.error, e.error && e.error.stack));
    window.addEventListener('unhandledrejection', (e) => record(e.reason, e.reason && e.reason.stack));
    // Los errores ya atrapados que la app anota con console.error también cuentan.
    const orig = console.error.bind(console);
    console.error = function(){
      try{
        const args = Array.from(arguments);
        const err = args.find(a => a && a.stack);
        record(args.map(text).join(' '), err && err.stack);
      }catch(e){ /* nunca romper el log */ }
      return orig.apply(console, arguments);
    };
  }

  /** Informe legible para compartir (sin datos personales: solo errores y el teléfono). */
  function report(){
    const list = read();
    const nav = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    const lines = [
      'Informe de errores de LifeCoinQuest',
      'Versión: ' + ((LQ.config && LQ.config.APP_VERSION) || '?'),
      'Dispositivo: ' + nav,
      'Fecha: ' + new Date().toISOString(),
      '',
      list.length ? list.map(e => '- ' + new Date(e.t).toISOString() + ' [' + (e.v || '?') + (e.tab ? ' · ' + e.tab : '') + ']'
        + (e.n > 1 ? ' ×' + e.n : '') + '\n  ' + e.msg + (e.at ? '\n  en: ' + e.at : '')).join('\n') : 'Sin errores registrados.'
    ];
    return lines.join('\n');
  }

  LQ.errors = { record, list: read, count: () => read().length, clear: () => write([]), report };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
