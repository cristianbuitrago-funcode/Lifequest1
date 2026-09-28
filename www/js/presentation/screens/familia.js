/*
 * Familia (supervisión parental, tipo "Family Link"). Se muestra dentro de la
 * pestaña Social:
 *   - Padre/madre: vincula a un menor con un código + PIN y ve su progreso.
 *   - Menor: escribe el código; su app pasa a modo menor (sin Finanzas) y
 *     comparte un resumen de su progreso con sus padres.
 * También expone ui.family.requirePin(), que pide el PIN del adulto antes de
 * acciones delicadas en modo menor (salir del modo, importar copia, cerrar sesión…).
 */
(function (LQ) {
  "use strict";

  const { state, store, ui } = LQ;
  const F = LQ.Family;
  const E = LQ.Evolution;
  const { escapeHtml } = LQ.utils;

  const fam = () => LQ.cloud && LQ.cloud.family;
  const fset = () => state.settings.family || (state.settings.family = F.defaults());
  const cache = { children: null, progress: {}, at: 0, open: {} };

  // -------------------------------------------------------------------------
  // PIN del adulto
  // -------------------------------------------------------------------------
  /** Pide un PIN (y su confirmación si `create`). Resuelve con el PIN o null. */
  function askPin(title, text, create){
    return new Promise(resolve => {
      let done = false;
      const finish = (v) => { if (!done){ done = true; resolve(v); } };
      const close = ui.openModal(title, (body, closeFn) => {
        body.innerHTML = `
          <div class="sub">${text}</div>
          <input type="password" id="pin1" class="pin-input" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••" aria-label="PIN de 4 dígitos">
          ${create ? '<input type="password" id="pin2" class="pin-input" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="Repite el PIN" aria-label="Repite el PIN">' : ''}
          <div class="pin-error" id="pinErr"></div>
          <div class="row" style="margin-top:12px"><button class="btn" id="pinOk">Aceptar</button></div>`;
        const p1 = body.querySelector('#pin1'), p2 = body.querySelector('#pin2'), err = body.querySelector('#pinErr');
        setTimeout(() => p1.focus(), 50);
        const ok = () => {
          const v = p1.value.trim();
          if (!F.validPin(v)){ err.textContent = 'El PIN son 4 números.'; return; }
          if (create && p2.value.trim() !== v){ err.textContent = 'Los PIN no coinciden.'; return; }
          finish(v); closeFn();
        };
        body.querySelector('#pinOk').onclick = ok;
        body.querySelectorAll('.pin-input').forEach(i => i.onkeydown = (e) => { if (e.key === 'Enter') ok(); });
      });
      // Si se cierra sin aceptar.
      const all = document.querySelectorAll('.modal');
      const wrap = all[all.length - 1];
      if (wrap) new MutationObserver((_, obs) => { if (!document.body.contains(wrap)){ obs.disconnect(); finish(null); } })
        .observe(document.body, { childList: true });
      return close;
    });
  }

  /** En modo menor pide el PIN de un adulto; fuera de él deja pasar. */
  async function requirePin(what){
    if (!F.isChildMode(state.settings)) return true;
    const pin = await askPin('PIN de un adulto', 'Para ' + escapeHtml(what) + ' se necesita el PIN de tu padre, madre o acudiente.');
    if (pin == null) return false;
    if (F.checkPin(state.settings, pin)) return true;
    ui.showToast('PIN incorrecto');
    return false;
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  function render(box){
    if (F.isChildMode(state.settings)) return renderChild(box);
    box.innerHTML = `
      <div class="panel family-hero">
        <div class="family-emoji">👨‍👩‍👧</div>
        <h2>Familia</h2>
        <div class="sub">Si eres padre, madre o acudiente, puedes ver el progreso de un menor (misiones, hábitos, nivel y logros) además del tuyo. En su app no aparecerá Finanzas.</div>
      </div>
      <div class="panel" id="famParent"></div>
      <div class="panel">
        <h2>¿Eres menor de edad?</h2>
        <div class="sub">Si un adulto te dio un código de familia, escríbelo aquí.</div>
        <div class="family-code-row">
          <input type="text" id="famCode" maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="Código" aria-label="Código de familia">
          <button class="btn" id="famJoin">Vincular</button>
        </div>
      </div>
      <div class="panel">
        <h2>Modo menor en este teléfono</h2>
        <div class="sub">Sin cuenta ni internet: un adulto pone un PIN y la app oculta Finanzas. (Para que los padres vean el progreso desde su teléfono, usa el código.)</div>
        <button class="btn ghost small" id="famLocal">🛡️ Activar modo menor</button>
      </div>`;
    document.getElementById('famJoin').onclick = () => join(document.getElementById('famCode').value);
    document.getElementById('famLocal').onclick = activateLocal;
    renderParent();
  }

  function needCloud(box, what){
    if (!LQ.cloud || !LQ.cloud.configured){
      box.innerHTML = `<h2>Supervisar a un menor</h2><div class="empty">🌐 ${what} necesita la nube de LifeCoinQuest.</div>`;
      return false;
    }
    if (!LQ.cloud.user){
      box.innerHTML = `<h2>Supervisar a un menor</h2><div class="sub">${what} necesita que inicies sesión con Google (en tu teléfono y en el del menor).</div>
        <button class="btn" id="famSignIn">Iniciar sesión con Google</button>`;
      box.querySelector('#famSignIn').onclick = signIn;
      return false;
    }
    return true;
  }

  async function signIn(){
    try{ await LQ.cloud.signIn(); ui.views.social.render(); }
    catch(e){ ui.showToast((e && e.message) || 'No se pudo iniciar sesión'); }
  }

  // ------------------------------------------------------------ padre
  async function renderParent(force){
    const box = document.getElementById('famParent');
    if (!box || !needCloud(box, 'Ver el progreso de un menor')) return;
    box.innerHTML = `
      <div class="section-head"><h2>Menores que supervisas</h2><button class="icon-btn" id="famReload" aria-label="Actualizar">↻</button></div>
      <div id="famKids"><div class="empty">Cargando…</div></div>
      <button class="btn" id="famInvite">➕ Vincular a un menor</button>`;
    box.querySelector('#famInvite').onclick = createInvite;
    box.querySelector('#famReload').onclick = () => renderParent(true);
    try{
      if (force || !cache.children || Date.now() - cache.at > 60000){
        cache.children = await fam().children();
        const list = await Promise.all(cache.children.map(k => fam().progress(k.id).catch(() => null)));
        cache.children.forEach((k, i) => { cache.progress[k.id] = list[i]; });
        cache.at = Date.now();
      }
      drawKids();
    }catch(e){
      const kids = document.getElementById('famKids');
      if (kids) kids.innerHTML = `<div class="empty">${escapeHtml(errorText(e))}</div>`;
    }
  }

  function ago(ts){
    const ms = ts && ts.toMillis ? ts.toMillis() : Number(ts) || 0;
    if (!ms) return 'aún sin datos';
    const min = Math.round((Date.now() - ms) / 60000);
    if (min < 2) return 'hace un momento';
    if (min < 60) return 'hace ' + min + ' min';
    const h = Math.round(min / 60);
    if (h < 24) return 'hace ' + h + ' h';
    return 'hace ' + Math.round(h / 24) + ' días';
  }

  function drawKids(){
    const box = document.getElementById('famKids');
    if (!box) return;
    const kids = cache.children || [];
    if (!kids.length){
      box.innerHTML = '<div class="empty">Aún no supervisas a nadie. Toca "Vincular a un menor" y escribe el código en su teléfono.</div>';
      return;
    }
    box.innerHTML = kids.map(k => {
      const p = cache.progress[k.id];
      const name = escapeHtml((p && p.name) || k.childName || 'Menor');
      if (!p) return `
        <div class="kid-card">
          <div class="kid-top"><div class="kid-avatar">🧒</div><div class="kid-main"><b>${escapeHtml(k.childName || 'Menor')}</b><small>Vinculado. Esperando su primera actualización…</small></div></div>
          <button class="link-danger" data-unlink="${escapeHtml(k.id)}">Dejar de supervisar</button>
        </div>`;
      const t = F.todaySummary(p);
      const pct = p.xpNeed ? Math.round(p.xpInto / p.xpNeed * 100) : 0;
      const open = !!cache.open[k.id];
      return `
        <div class="kid-card">
          <div class="kid-top">
            <div class="kid-avatar">${p.photo ? `<img src="${escapeHtml(p.photo)}" alt="">` : '🧒'}</div>
            <div class="kid-main"><b>${name}</b><small>Nivel ${p.level} · actualizado ${escapeHtml(ago(p.updatedAt))}</small></div>
            <div class="kid-streak">🔥 ${p.streak}</div>
          </div>
          <div class="xp-track"><div class="xp-fill" style="width:${pct}%"></div></div>
          <div class="kid-stats">
            <div><b class="num">${p.totalXp}</b><small>XP total</small></div>
            <div><b class="num">${p.weeklyXp || 0}</b><small>XP semana</small></div>
            <div><b class="num">${p.coins}</b><small>🪙</small></div>
            <div><b class="num">${p.achievements}</b><small>🏆 logros</small></div>
          </div>
          <div class="kid-today">${t.stale
            ? `Hoy aún no ha abierto la app${p.lastActive ? ' · última actividad: ' + escapeHtml(p.lastActive) : ''}.`
            : `Hoy: <b>${t.quests.done}/${t.quests.total}</b> misiones diarias · <b>${t.habits.done}/${t.habits.total}</b> hábitos`}</div>
          <button class="btn ghost small" data-kid-open="${escapeHtml(k.id)}">${open ? 'Ocultar detalle' : 'Ver detalle'}</button>
          ${open ? detailHtml(k.id, p) : ''}
        </div>`;
    }).join('');
    box.querySelectorAll('[data-kid-open]').forEach(b => b.onclick = () => {
      cache.open[b.dataset.kidOpen] = !cache.open[b.dataset.kidOpen]; drawKids();
    });
    box.querySelectorAll('[data-unlink]').forEach(b => b.onclick = () => unlink(b.dataset.unlink));
    kids.forEach(k => {
      const p = cache.progress[k.id], c = document.getElementById('kidRadar-' + k.id);
      if (!p || !c || !(p.pillars || []).length) return;
      const axes = p.pillars.concat(Array.from({ length: Math.max(0, 3 - p.pillars.length) }, () => ({ name: '', level: 0, color: '' })));
      ui.drawRadar(c, axes.map(x => x.name), axes.map(x => (x.level || 0) / 10),
        { rings: 10, ringLabels: true, colors: axes.map(x => x.color), suffixes: axes.map(x => x.name ? 'nivel ' + x.level : ''), radius: 80, maxLabel: 12 });
    });
  }

  function detailHtml(id, p){
    const today = p.today === LQ.utils.fmtDate(new Date());
    const m = p.month || {};
    return `
      <div class="kid-detail">
        <h3>Misiones diarias ${today ? 'de hoy' : '(' + escapeHtml(p.today || '') + ')'}</h3>
        ${(p.quests || []).length ? `<ul class="kid-list">${p.quests.map(q => `<li class="${q.done ? 'ok' : ''}">${q.done ? '✅' : '⬜'} ${escapeHtml(q.title)}</li>`).join('')}</ul>` : '<div class="hint">Sin misiones diarias.</div>'}
        ${(p.pendingOnce || []).length ? `<h3>Misiones pendientes</h3><ul class="kid-list">${p.pendingOnce.map(t => `<li>🎯 ${escapeHtml(t)}</li>`).join('')}</ul>` : ''}
        <h3>Hábitos</h3>
        ${(p.habits || []).length ? `<ul class="kid-list">${p.habits.map(h => `<li class="${h.doneToday && today ? 'ok' : ''}">${h.doneToday && today ? '✅' : '⬜'} ${escapeHtml(h.title)} <small>· racha ${h.streak} · ${h.month} días este mes</small></li>`).join('')}</ul>` : '<div class="hint">Sin hábitos.</div>'}
        ${m.key ? `<h3>Rastreador de ${escapeHtml(E.monthLabel(m.key))}</h3>
          <div class="kid-month">${(m.perDay || []).map((n, i) => `<i title="Día ${i + 1}: ${n}" style="--n:${Math.min(1, n / Math.max(1, (p.habits || []).length))}"></i>`).join('')}</div>
          <div class="hint">${m.total} hábitos cumplidos este mes · marcos: ${(m.milestones || []).map(x => (x.reached ? '✅ ' : '⬜ ') + x.at).join(' · ')}</div>` : ''}
        ${(p.pillars || []).length ? `<h3>Mapa de evolución</h3><div class="radar-wrap"><canvas id="kidRadar-${escapeHtml(id)}" width="300" height="260"></canvas></div>` : ''}
        ${(p.recent || []).length ? `<h3>Actividad reciente</h3><ul class="kid-list">${p.recent.map(r => `<li>⚔️ ${escapeHtml(r.title)} <small>· ${escapeHtml(r.date)} · +${r.xp} XP</small></li>`).join('')}</ul>` : ''}
        <button class="link-danger" data-unlink="${escapeHtml(id)}">Dejar de supervisar</button>
      </div>`;
  }

  async function createInvite(){
    const pin = await askPin('PIN para el modo menor', 'Elige un PIN de 4 números. Lo necesitará el menor para salir del modo menor o cerrar sesión. No se lo digas.', true);
    if (pin == null) return;
    const parentName = LQ.Social.cleanName(state.profile.displayName) || (LQ.cloud.user && LQ.cloud.user.name) || 'Tu padre/madre';
    try{
      const code = await fam().createInvite(parentName, F.makePin(pin));
      ui.openModal('Código de familia', (body, close) => {
        body.innerHTML = `
          <div class="sub">En el teléfono del menor: abre LifeCoinQuest, inicia sesión con su cuenta de Google, ve a <b>Social → Familia</b> y escribe:</div>
          <div class="family-code">${escapeHtml(code)}</div>
          <div class="hint">Sirve una sola vez y vence en ${F.INVITE_DAYS} días. Cuando lo use, aparecerá aquí con su progreso.</div>
          <div class="row" style="margin-top:12px">
            <button class="btn" id="codeDone">Listo</button>
            <button class="btn ghost small" id="codeCancel">Anular código</button>
          </div>`;
        body.querySelector('#codeDone').onclick = () => { close(); renderParent(true); };
        body.querySelector('#codeCancel').onclick = async () => {
          await fam().cancelInvite(code).catch(() => {});
          close(); ui.showToast('Código anulado');
        };
      });
    }catch(e){ ui.showToast(errorText(e)); }
  }

  async function unlink(childUid){
    const k = (cache.children || []).find(x => x.id === childUid);
    if (!confirm('¿Dejar de supervisar a ' + ((k && k.childName) || 'este menor') + '? Ya no verás su progreso y su app saldrá del modo menor si no tiene más adultos vinculados.')) return;
    try{
      await fam().unlinkChild(childUid);
      cache.children = (cache.children || []).filter(x => x.id !== childUid);
      delete cache.progress[childUid];
      drawKids();
      ui.showToast('Listo: ya no supervisas a ese menor');
    }catch(e){ ui.showToast(errorText(e)); }
  }

  // ------------------------------------------------------------ menor
  async function join(raw){
    const code = String(raw || '').trim().toUpperCase();
    if (code.length !== 6){ ui.showToast('El código tiene 6 letras y números'); return; }
    if (!LQ.cloud || !LQ.cloud.configured){ ui.showToast('Necesitas la nube de LifeCoinQuest para vincularte'); return; }
    if (!LQ.cloud.user){
      ui.showToast('Primero inicia sesión con Google');
      await signIn();
      if (!LQ.cloud.user) return;
    }
    try{
      const invite = await fam().readInvite(code);
      if (!invite || !F.inviteFresh(invite)){ ui.showToast('Ese código no existe o ya venció. Pide uno nuevo.'); return; }
      const who = invite.parentName || 'un adulto';
      const name = LQ.Social.cleanName(state.profile.displayName) || prompt('¿Cómo te llamas?', '') || 'Menor';
      if (!confirm('¿Vincularte con ' + who + '?\n\n• Verá tu progreso: nivel, misiones, hábitos y logros.\n• Tu app pasará a modo menor: sin Finanzas.\n• Para salir se necesitará su PIN.')) return;
      await fam().accept(invite, name);
      const f = fset();
      f.childMode = true;
      f.pins = (f.pins || []).filter(p => p.by !== invite.parentUid).concat({ by: invite.parentUid, salt: invite.salt, hash: invite.pinHash });
      f.parents = (f.parents || []).filter(p => p.uid !== invite.parentUid).concat({ uid: invite.parentUid, name: who });
      await store.saveSettings();
      await publishNow();
      startWatch();
      ui.renderAll();
      ui.showToast('Vinculado con ' + who + ' 👨‍👩‍👧');
    }catch(e){ ui.showToast(errorText(e)); }
  }

  async function activateLocal(){
    const pin = await askPin('PIN del adulto', 'Un adulto elige un PIN de 4 números. Se pedirá para salir del modo menor.', true);
    if (pin == null) return;
    const f = fset();
    f.childMode = true;
    f.pins = (f.pins || []).filter(p => p.by !== null).concat(Object.assign({ by: null }, F.makePin(pin)));
    await store.saveSettings();
    ui.renderAll();
    ui.showToast('Modo menor activado: Finanzas está oculta');
  }

  function renderChild(box){
    const f = fset();
    const parents = f.parents || [];
    box.innerHTML = `
      <div class="panel family-hero child">
        <div class="family-emoji">🛡️</div>
        <h2>Modo menor activo</h2>
        <div class="sub">${parents.length
          ? 'Tus padres ven tu progreso: nivel, misiones, hábitos y logros. Tus notas y datos privados no se comparten.'
          : 'Un adulto activó el modo menor en este teléfono.'} La sección de Finanzas está desactivada.</div>
      </div>
      ${parents.length ? `<div class="panel"><h2>Adultos vinculados</h2>
        <ul class="kid-list">${parents.map(p => `<li>👤 ${escapeHtml(p.name || 'Adulto')}</li>`).join('')}</ul>
        ${LQ.cloud && LQ.cloud.user ? '<button class="btn ghost small" id="famShare">↻ Compartir mi progreso ahora</button>' : '<div class="hint">Inicia sesión para que vean tu progreso actualizado.</div>'}
      </div>` : ''}
      <div class="panel">
        <h2>¿Tienes otro código?</h2>
        <div class="family-code-row">
          <input type="text" id="famCode" maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="Código" aria-label="Código de familia">
          <button class="btn" id="famJoin">Vincular</button>
        </div>
      </div>
      <button class="btn ghost small" id="famExit">Salir del modo menor (PIN de un adulto)</button>`;
    const share = document.getElementById('famShare');
    if (share) share.onclick = async () => { await publishNow(); ui.showToast('Progreso compartido'); };
    document.getElementById('famJoin').onclick = () => join(document.getElementById('famCode').value);
    document.getElementById('famExit').onclick = exitChildMode;
  }

  async function exitChildMode(){
    if (!(await requirePin('salir del modo menor'))) return;
    const f = fset();
    if (fam() && (f.parents || []).length){
      for (const p of f.parents) await fam().leave(p.uid).catch(e => console.warn('familia', e));
    }
    Object.assign(f, F.defaults());
    await store.saveSettings();
    ui.renderAll();
    ui.showToast('Modo menor desactivado');
  }

  // -------------------------------------------------------------------------
  // Publicación del progreso y escucha de los padres
  // -------------------------------------------------------------------------
  async function publishNow(){
    const f = fset();
    if (!f.childMode || !(f.parents || []).length || !fam()) return;
    await fam().publish(F.buildProgress(state));
  }

  let unwatch = null, watchedUid = null;
  /** Si un padre desvincula, se quita su PIN; sin adultos, el modo menor se apaga. */
  function startWatch(){
    const f = fset();
    const uid = LQ.cloud && LQ.cloud.user && LQ.cloud.user.uid;
    if (!uid || !f.childMode || !fam()){ stopWatch(); return; }
    if (unwatch && watchedUid === uid) return;
    stopWatch();
    watchedUid = uid;
    unwatch = fam().watchParents(async (list) => {
      const g = fset();
      if (!g.childMode) return;
      const ids = new Set(list.map(p => p.id));
      const before = (g.parents || []).length;
      g.parents = list.map(p => ({ uid: p.id, name: p.parentName || 'Adulto' }));
      g.pins = (g.pins || []).filter(p => p.by === null || ids.has(p.by));
      let msg = null;
      if (!g.parents.length && !g.pins.length){
        Object.assign(g, F.defaults());
        msg = 'Tu padre o madre te desvinculó: el modo menor se desactivó';
      } else if (g.parents.length < before){
        msg = 'Un adulto dejó de supervisarte';
      }
      await store.saveSettings();
      if (msg){ ui.showToast(msg); ui.renderAll(); }
    });
  }
  function stopWatch(){
    if (unwatch){ try{ unwatch(); }catch(e){ /* ya cerrada */ } }
    unwatch = null; watchedUid = null;
  }

  function errorText(e){
    const code = (e && e.code) || '';
    if (code === 'permission-denied') return 'No tienes permiso para hacer eso (¿el código ya se usó?).';
    if (code === 'unavailable') return 'Sin conexión. Inténtalo cuando vuelva el internet.';
    return (e && e.message) || 'Algo salió mal. Inténtalo de nuevo.';
  }

  ui.family = {
    render, requirePin, askPin,
    publishNow: () => publishNow().catch(e => console.warn('LifeCoinQuest: familia', e)),
    startWatch, stopWatch
  };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
