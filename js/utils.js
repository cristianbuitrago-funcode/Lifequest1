/*
 * Utilidades puras (fechas, ids, escape de HTML).
 */
(function (LQ) {
  "use strict";

  // Fecha local YYYY-MM-DD. (Antes usaba toISOString(), que da la fecha UTC:
  // en Colombia, a partir de las 7 p. m. "hoy" pasaba a ser mañana.)
  function fmtDate(d){
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function addDays(d, n){ const x = new Date(d.getTime()); x.setDate(x.getDate()+n); return x; }
  function todayStr(){ return fmtDate(new Date()); }
  function yesterdayStr(){ return fmtDate(addDays(new Date(), -1)); }

  // Id ordenable por fecha de creación y único entre dispositivos
  // (prefijo de tiempo + aleatorio), apto para una futura sincronización.
  function uid(){
    const time = Date.now().toString(36).padStart(9, '0');
    let rand;
    if (globalThis.crypto && globalThis.crypto.getRandomValues){
      rand = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2,'0')).join('');
    } else {
      rand = Math.random().toString(36).slice(2, 14).padEnd(12, '0');
    }
    return time + rand;
  }

  function clone(o){ return o == null ? o : JSON.parse(JSON.stringify(o)); }

  function escapeHtml(str){
    return String(str||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  LQ.utils = { fmtDate, addDays, todayStr, yesterdayStr, uid, clone, escapeHtml };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
