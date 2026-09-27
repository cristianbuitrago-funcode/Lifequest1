/*
 * Rueda (gráfico radar) reutilizable: la usan Resumen (XP por categoría) y
 * Hábitos (constancia de cada hábito). Toma los colores del tema actual.
 */
(function (LQ) {
  "use strict";

  const ui = LQ.ui;

  function shorten(text, max){
    text = String(text || '');
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {string[]} labels  nombre de cada eje
   * @param {number[]} values  valor de cada eje entre 0 y 1
   * @param {{suffixes?: string[], radius?: number, maxLabel?: number}} [opts]
   *        suffixes: texto pequeño bajo cada etiqueta (p. ej. "80 %")
   */
  ui.drawRadar = function(canvas, labels, values, opts){
    if (!canvas) return;
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    const cx = canvas.width / 2, cy = canvas.height / 2 + 6, R = opts.radius || 104;
    const n = labels.length;
    const styles = getComputedStyle(document.documentElement);
    const lineColor = styles.getPropertyValue('--line').trim();
    const muted = styles.getPropertyValue('--muted').trim();
    const text = styles.getPropertyValue('--text').trim();
    const accent = styles.getPropertyValue('--accent').trim();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!n) return;
    const angle = (i) => (Math.PI * 2 * i / n) - Math.PI / 2;

    // anillos
    for (let ring = 1; ring <= 4; ring++){
      ctx.beginPath();
      for (let i = 0; i <= n; i++){
        const a = angle(i), r = R * ring / 4;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = lineColor; ctx.lineWidth = 1; ctx.stroke();
    }
    // ejes y etiquetas
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++){
      const a = angle(i);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.strokeStyle = lineColor; ctx.stroke();
      const lx = cx + Math.cos(a) * (R + 24), ly = cy + Math.sin(a) * (R + 22);
      ctx.fillStyle = muted; ctx.font = '11px Manrope, sans-serif';
      ctx.fillText(shorten(labels[i], opts.maxLabel || 14), lx, ly - (opts.suffixes ? 6 : 0));
      if (opts.suffixes){
        ctx.fillStyle = text; ctx.font = '700 11px Manrope, sans-serif';
        ctx.fillText(opts.suffixes[i], lx, ly + 7);
      }
    }
    // polígono de datos
    ctx.beginPath();
    for (let i = 0; i <= n; i++){
      const idx = i % n, a = angle(idx);
      const r = R * Math.max(0.04, Math.min(1, values[idx] || 0));
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = accent + '33';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();
  };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
