/*
 * Celebraciones tipo videojuego: ventana con check animado, recompensas y
 * partículas (confeti, monedas, estrellas o fuegos artificiales según el
 * efecto equipado en la Tienda). Respeta "reducir movimiento" del sistema.
 * También incluye un modal genérico y el "+XP" flotante.
 */
(function (LQ) {
  "use strict";

  const { escapeHtml } = LQ.utils;
  const ui = LQ.ui;
  const reduceMotion = () => globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // -------------------------------------------------------------------------
  // Partículas
  // -------------------------------------------------------------------------
  const COLORS = ['#f0c451', '#9b83ff', '#3fd6e8', '#3fe0a5', '#ff6b85', '#ffa94d'];

  function runParticles(canvas, variant){
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const W = canvas.width = innerWidth * dpr;
    const H = canvas.height = innerHeight * dpr;
    const c = canvas.getContext('2d');
    const parts = [];
    const rand = (a, b) => a + Math.random() * (b - a);
    const cx = W / 2, cy = H * 0.38;

    function burst(x, y, n, speed){
      for (let i = 0; i < n; i++){
        const a = rand(0, Math.PI * 2), v = rand(speed * 0.4, speed) * dpr;
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2 * dpr, g: 0.12 * dpr, life: rand(60, 110), age: 0,
                     size: rand(3, 6) * dpr, color: COLORS[i % COLORS.length], rot: rand(0, 6), vr: rand(-0.2, 0.2), shape: variant });
      }
    }

    if (variant === 'estrellas'){
      for (let i = 0; i < 70; i++) parts.push({ x: rand(0, W), y: rand(-H * 0.6, 0), vx: rand(-1, 1) * dpr, vy: rand(3, 7) * dpr, g: 0.02 * dpr,
        life: 140, age: 0, size: rand(5, 10) * dpr, color: i % 3 ? '#f0c451' : '#ffffff', rot: rand(0, 6), vr: rand(-0.1, 0.1), shape: 'estrella' });
    } else if (variant === 'monedas'){
      for (let i = 0; i < 45; i++) parts.push({ x: rand(0, W), y: rand(-H * 0.5, -20), vx: rand(-0.6, 0.6) * dpr, vy: rand(3, 6) * dpr, g: 0.08 * dpr,
        life: 150, age: 0, size: rand(9, 14) * dpr, color: '#f0c451', rot: rand(0, 6), vr: rand(0.05, 0.15), shape: 'moneda' });
      burst(cx, cy, 30, 9);
    } else if (variant === 'fuegos'){
      [[0.25, 0.3], [0.75, 0.25], [0.5, 0.15]].forEach(([fx, fy], k) => setTimeout(() => burst(W * fx, H * fy, 60, 8), k * 280));
    } else {
      // confeti por defecto + unas monedas
      for (let i = 0; i < 110; i++) parts.push({ x: rand(0, W), y: rand(-H * 0.5, -10), vx: rand(-1.5, 1.5) * dpr, vy: rand(2, 5) * dpr, g: 0.05 * dpr,
        life: 170, age: 0, size: rand(5, 9) * dpr, color: COLORS[i % COLORS.length], rot: rand(0, 6), vr: rand(-0.25, 0.25), shape: 'confeti' });
      burst(cx, cy, 18, 7);
      parts.slice(-18).forEach(p => { p.shape = 'moneda'; p.color = '#f0c451'; p.size = 8 * dpr; });
    }

    function drawStar(x, y, r){
      c.beginPath();
      for (let i = 0; i < 10; i++){
        const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
        c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      c.closePath(); c.fill();
    }

    let raf = null;
    function frame(){
      c.clearRect(0, 0, W, H);
      for (let i = parts.length - 1; i >= 0; i--){
        const p = parts[i];
        p.age++; p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        if (p.age > p.life || p.y > H + 40){ parts.splice(i, 1); continue; }
        c.globalAlpha = Math.max(0, 1 - Math.max(0, p.age - p.life * 0.7) / (p.life * 0.3));
        c.fillStyle = p.color;
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        if (p.shape === 'moneda'){
          c.beginPath(); c.ellipse(0, 0, p.size * Math.abs(Math.cos(p.rot * 2)) + 1, p.size, 0, 0, Math.PI * 2); c.fill();
          c.fillStyle = 'rgba(255,255,255,.45)'; c.fillRect(-1, -p.size * 0.6, 2, p.size * 1.2);
        } else if (p.shape === 'estrella'){
          drawStar(0, 0, p.size);
        } else if (p.shape === 'confeti'){
          c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          c.beginPath(); c.arc(0, 0, p.size / 2, 0, Math.PI * 2); c.fill();
        }
        c.restore();
      }
      c.globalAlpha = 1;
      if (parts.length) raf = requestAnimationFrame(frame);
    }
    frame();
    return () => cancelAnimationFrame(raf);
  }

  // -------------------------------------------------------------------------
  // Ventana de celebración
  // -------------------------------------------------------------------------
  /**
   * @param {object} o {title, message, icon, rewards:[texto], actions:[{label, primary, onClick}]}
   */
  function celebrate(o){
    closeCelebration();
    const equipped = LQ.Shop ? LQ.Shop.equippedProducts().effect : null;
    const variant = equipped ? equipped.effect.value : 'confeti';
    const wrap = document.createElement('div');
    wrap.className = 'celebrate';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = `
      <canvas class="celebrate-fx" aria-hidden="true"></canvas>
      <div class="celebrate-card">
        <div class="celebrate-glow" aria-hidden="true"></div>
        ${o.icon ? `<div class="celebrate-icon">${iconHtml(o.icon)}</div>` : `
        <svg class="celebrate-check" viewBox="0 0 52 52" aria-hidden="true">
          <circle cx="26" cy="26" r="23" fill="none" stroke-width="3"/>
          <path d="M15 27l7 7 15-16" fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`}
        <h2>${escapeHtml(o.title || '¡Felicidades!')}</h2>
        ${o.message ? `<p>${escapeHtml(o.message)}</p>` : ''}
        ${(o.rewards || []).length ? `<div class="celebrate-rewards">${o.rewards.map(r => `<span>${escapeHtml(r)}</span>`).join('')}</div>` : ''}
        ${o.extraHtml || ''}
        <div class="celebrate-actions">
          ${(o.actions || []).map((a, i) => `<button class="btn ${a.primary ? '' : 'ghost'}" data-i="${i}">${escapeHtml(a.label)}</button>`).join('')}
          <button class="btn ${(o.actions || []).some(a => a.primary) ? 'ghost' : ''}" data-close>¡Genial!</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('show'));
    const stop = reduceMotion() ? () => {} : runParticles(wrap.querySelector('canvas'), variant);
    ui.sound.play('long');
    if (navigator.vibrate) try{ navigator.vibrate(30); }catch(e){}

    const close = () => { stop(); wrap.classList.remove('show'); setTimeout(() => wrap.remove(), 250); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    wrap.querySelector('[data-close]').onclick = close;
    wrap.querySelector('[data-close]').focus();
    wrap.querySelectorAll('[data-i]').forEach(b => {
      b.onclick = async () => { close(); const a = o.actions[+b.dataset.i]; if (a && a.onClick) await a.onClick(); };
    });
    wrap.onclick = (e) => { if (e.target === wrap) close(); };
    celebrate._close = close;
  }
  function closeCelebration(){ if (celebrate._close){ celebrate._close(); celebrate._close = null; } }

  function iconHtml(icon){
    if (/^(img\/|https?:|data:image)/.test(icon)) return `<img src="${escapeHtml(icon)}" alt="">`;
    return escapeHtml(icon);
  }

  // -------------------------------------------------------------------------
  // Modal genérico
  // -------------------------------------------------------------------------
  /** Abre un modal. `render(body, close)` rellena el contenido. Devuelve close(). */
  function openModal(title, render){
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = `<div class="modal-card"><div class="modal-head"><h2>${escapeHtml(title)}</h2>
      <button class="icon-btn" data-close aria-label="Cerrar"><svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>
      <div class="modal-body"></div></div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('show'));
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    function close(){ wrap.classList.remove('show'); setTimeout(() => wrap.remove(), 200); document.removeEventListener('keydown', onKey); }
    document.addEventListener('keydown', onKey);
    wrap.querySelector('[data-close]').onclick = close;
    wrap.onclick = (e) => { if (e.target === wrap) close(); };
    render(wrap.querySelector('.modal-body'), close);
    return close;
  }

  // -------------------------------------------------------------------------
  // "+10 XP" flotante sobre un elemento (microinteracción)
  // -------------------------------------------------------------------------
  function floatReward(anchor, text){
    if (!anchor || reduceMotion()) return;
    const r = anchor.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'float-reward';
    el.textContent = text;
    el.style.left = (r.left + r.width / 2) + 'px';
    el.style.top = (r.top + scrollY) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  /** Celebración de subida de nivel, con lo que se desbloquea en la Tienda. */
  function celebrateLevelUp(level){
    const unlocked = LQ.Shop ? LQ.Shop.unlockedAt(level) : [];
    celebrate({
      icon: '⭐',
      title: '¡Nivel ' + level + '!',
      message: unlocked.length ? 'Desbloqueaste nuevas recompensas en la Tienda:' : 'Sigue así: cada misión te hace más fuerte.',
      extraHtml: unlocked.length ? `<div class="celebrate-unlocks">${unlocked.map(p => `<span>${iconHtml(p.icon)} ${escapeHtml(p.name)}</span>`).join('')}</div>` : '',
      actions: unlocked.length ? [{ label: 'Ir a la Tienda', primary: true, onClick: () => ui.showTab && ui.showTab('tienda') }] : []
    });
  }

  Object.assign(ui, { celebrate, closeCelebration, openModal, floatReward, celebrateLevelUp, iconHtml });
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
