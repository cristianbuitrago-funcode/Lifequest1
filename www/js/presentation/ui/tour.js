/*
 * Tutorial guiado: pasos cortos que resaltan cada parte de la app.
 * Se muestra la primera vez (settings.tutorialDone) y se puede repetir desde Ajustes.
 */
(function (LQ) {
  "use strict";

  const ui = LQ.ui;

  // tab: pestaña que se abre antes del paso · target: selector a resaltar (opcional)
  const STEPS = [
    { title: '¡Bienvenido a LifeCoinQuest! ⚔️', pick: true,
      text: 'Convierte tus tareas en un juego: cumple misiones y gana XP y monedas. Misiones, Hábitos y Resumen siempre están; elige qué más quieres usar (puedes cambiarlo en Ajustes):' },
    { tab: 'resumen', target: '#charCard', title: 'Tu personaje',
      text: 'Tu nivel, tus monedas 🪙 y tu racha 🔥. Todo sube al cumplir lo que te propones.' },
    { tab: 'misiones', target: '#view-misiones .panel', title: 'Crea misiones',
      text: 'Escribe una tarea y elige su dificultad. Las diarias se repiten cada día.' },
    { tab: 'misiones', target: '#view-misiones .quest-check', fallback: '#view-misiones .panel:last-child', title: 'Complétalas',
      text: 'Toca ✓ al terminar para ganar XP y monedas. Si no haces una diaria, pierdes monedas.' },
    { tab: 'habitos', target: '#view-habitos .panel', title: 'Hábitos',
      text: 'Márcalos cada día en tu rastreador del mes. Cada hábito cumplido suma un bloque a tu escalera de recompensas.' },
    { tab: 'finanzas', target: '#view-finanzas .segmented', title: 'Tu dinero',
      text: 'Registra ingresos y gastos, tus pagos y reparte el dinero en sobres.' },
    { tab: 'finanzas', target: '[data-fin-section="pagos"]', title: 'Pagos',
      text: 'Agrega lo que debes pagar: te avisamos días antes y el mismo día.' },
    { tab: 'tienda', target: '#view-tienda .shop-hero', title: 'Tienda',
      text: 'Gasta tus monedas en temas, mascotas y poderes.' },
    { tab: 'social', target: '#view-social .segmented', title: 'Social',
      text: 'Tu perfil, tus logros, el ranking, tu clan y Familia: los padres pueden ver el progreso de sus hijos.' },
    { tab: 'decidia', target: '#view-decidia .decidia-hero', title: 'DECIDIA 🧠',
      text: 'Convierte tus decisiones en escenarios: escribe qué estás pensando y compara opciones. No da XP: es solo para ti.' },
    { tab: 'ajustes', target: '#remindersPanel', title: 'Recordatorios',
      text: 'Activa las alarmas para que la app te avise aunque esté cerrada.' },
    { tab: 'resumen', target: '#settingsBtn', title: 'Ajustes',
      text: 'Los Ajustes están en este engranaje ⚙️. Ahí puedes repetir este tutorial.' },
    { tab: 'resumen', target: '#tabs', title: '¡Listo! 🎉',
      text: 'Muévete entre secciones con esta barra. ¡A cumplir misiones!' }
  ];

  let root = null, index = 0, onKey = null, onResize = null;

  function goTab(tab){
    if (!tab) return;
    if (LQ.app && LQ.app.router && LQ.app.router.current() !== tab) ui.showTab(tab);
  }

  function findTarget(step){
    if (!step.target) return null;
    const el = document.querySelector(step.target) || (step.fallback && document.querySelector(step.fallback));
    return el && !el.hidden && el.getClientRects().length ? el : null;
  }

  function place(){
    if (!root) return;
    const step = STEPS[index];
    const spot = root.querySelector('.tour-spot');
    const card = root.querySelector('.tour-card');
    const el = findTarget(step);
    const vw = innerWidth, vh = innerHeight, pad = 8;
    if (!el){
      Object.assign(spot.style, { left: vw / 2 + 'px', top: vh / 2 + 'px', width: '0px', height: '0px' });
      spot.classList.add('empty');
      card.style.top = Math.max(16, (vh - card.offsetHeight) / 2) + 'px';
      return;
    }
    spot.classList.remove('empty');
    const r = el.getBoundingClientRect();
    // Los elementos muy altos se resaltan solo en su parte superior, para que quepa la tarjeta.
    const top = Math.max(4, r.top - pad);
    const bottom = Math.min(vh - 4, r.bottom + pad, top + vh * 0.5);
    Object.assign(spot.style, {
      left: Math.max(4, r.left - pad) + 'px', top: top + 'px',
      width: Math.min(vw - 8, r.width + pad * 2) + 'px', height: Math.max(0, bottom - top) + 'px'
    });
    const h = card.offsetHeight;
    let y = bottom + 12;                                  // debajo del elemento…
    if (y + h > vh - 12) y = top - h - 12;               // …o encima si no cabe
    card.style.top = Math.min(vh - h - 12, Math.max(12, y)) + 'px';
  }

  // En modo menor (Familia) no existe Finanzas: esos pasos se saltan.
  // Tampoco los de secciones que el usuario ocultó.
  function hiddenStep(step){ return !!(step.tab && LQ.Modules && !LQ.Modules.enabled(LQ.state.settings, step.tab)); }

  function show(i, dir){
    while (STEPS[i] && hiddenStep(STEPS[i])) i += dir || 1;
    if (!STEPS[i]) return finish();
    index = i;
    const step = STEPS[i];
    goTab(step.tab);
    const last = i === STEPS.length - 1;
    root.querySelector('.tour-card').innerHTML = `
      <div class="tour-dots" aria-hidden="true">${STEPS.map((st, k) => hiddenStep(st) ? '' : `<span class="${k === i ? 'on' : ''}"></span>`).join('')}</div>
      <h3>${step.title}</h3>
      <p>${step.text}</p>
      ${step.pick ? ui.modulePicker() : ''}
      <div class="tour-actions">
        ${last ? '' : '<button class="btn ghost small" data-skip>Saltar</button>'}
        ${i > 0 && !last ? '<button class="btn ghost small" data-prev>Atrás</button>' : ''}
        <button class="btn small" data-next>${last ? '¡Empezar!' : i === 0 ? 'Empezar el recorrido' : 'Siguiente'}</button>
      </div>`;
    const card = root.querySelector('.tour-card');
    card.querySelector('[data-next]').onclick = async () => {
      if (step.pick) await ui.saveModulePicker(card);
      last ? finish() : show(i + 1);
    };
    const skip = card.querySelector('[data-skip]');
    if (skip) skip.onclick = async () => { if (step.pick) await ui.saveModulePicker(card); finish(); };
    const prev = card.querySelector('[data-prev]'); if (prev) prev.onclick = () => show(i - 1, -1);

    // Espera a que la pestaña se dibuje, lleva el elemento a la vista y lo resalta.
    requestAnimationFrame(() => {
      const el = findTarget(step);
      if (el && step.target !== '#tabs' && step.target !== '#settingsBtn'){
        const tall = el.getBoundingClientRect().height > innerHeight * 0.5;
        el.scrollIntoView({ block: tall ? 'start' : 'center', behavior: 'auto' });
        if (tall) window.scrollBy(0, -16);
      }
      requestAnimationFrame(() => { place(); card.querySelector('[data-next]').focus(); });
    });
  }

  function start(){
    if (root) return;
    root = document.createElement('div');
    root.className = 'tour';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Tutorial');
    root.innerHTML = '<div class="tour-spot"></div><div class="tour-card"></div>';
    document.body.appendChild(root);
    requestAnimationFrame(() => root.classList.add('show'));
    onKey = (e) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight' && index < STEPS.length - 1) show(index + 1);
      else if (e.key === 'ArrowLeft' && index > 0) show(index - 1, -1);
    };
    onResize = () => place();
    document.addEventListener('keydown', onKey);
    addEventListener('resize', onResize);
    show(0);
  }

  async function finish(){
    if (!root) return;
    document.removeEventListener('keydown', onKey);
    removeEventListener('resize', onResize);
    const el = root; root = null;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 200);
    goTab('resumen');
    window.scrollTo(0, 0);
    if (!LQ.state.settings.tutorialDone){
      LQ.state.settings.tutorialDone = true;
      await LQ.store.saveSettings();
    }
    if (LQ.pwa) setTimeout(LQ.pwa.maybeShowHint, 1500);
  }

  /** Abre el tutorial si el usuario aún no lo ha visto. */
  function maybeStart(){
    if (!LQ.state.settings.tutorialDone) start();
  }

  ui.tour = { start, finish, maybeStart, get active(){ return !!root; }, STEPS };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
