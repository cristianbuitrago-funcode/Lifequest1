/*
 * Sonidos de recompensa (Tienda → Sonidos), sintetizados con Web Audio:
 * no hay archivos de audio. Sin un paquete equipado, la app no suena.
 */
(function (LQ) {
  "use strict";

  let ctx = null;
  function audio(){
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(ac, freq, start, dur, type, gain){
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(ac.destination);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  // Notas (Hz) por paquete: [evento corto, celebración]
  const PACKS = {
    campanas:  { type: 'sine',     gain: 0.18, short: [1318.5, 1760],            long: [1046.5, 1318.5, 1568, 2093] },
    arcade:    { type: 'square',   gain: 0.07, short: [880, 1320],               long: [523.3, 659.3, 784, 1046.5, 1318.5] },
    fanfarria: { type: 'sawtooth', gain: 0.07, short: [523.3, 784],              long: [392, 523.3, 659.3, 784, 1046.5] }
  };

  /** Reproduce el sonido del paquete equipado. kind: 'short' | 'long' */
  function play(kind){
    const equipped = LQ.Shop && LQ.Shop.equippedProducts().sound;
    const pack = equipped && PACKS[equipped.effect.value];
    if (!pack) return;
    try{
      const ac = audio(); if (!ac) return;
      const notes = pack[kind === 'long' ? 'long' : 'short'];
      const step = kind === 'long' ? 0.11 : 0.08;
      const t0 = ac.currentTime + 0.02;
      notes.forEach((f, i) => tone(ac, f, t0 + i * step, kind === 'long' && i === notes.length - 1 ? 0.6 : 0.22, pack.type, pack.gain));
    }catch(e){ /* sin audio disponible */ }
  }

  /** Vista previa de un paquete (desde la tienda). */
  function preview(packId){
    const pack = PACKS[packId]; if (!pack) return;
    try{
      const ac = audio(); if (!ac) return;
      const t0 = ac.currentTime + 0.02;
      pack.long.forEach((f, i) => tone(ac, f, t0 + i * 0.11, i === pack.long.length - 1 ? 0.6 : 0.22, pack.type, pack.gain));
    }catch(e){}
  }

  LQ.ui = LQ.ui || {};
  LQ.ui.sound = { play, preview, PACKS };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
