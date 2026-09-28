/*
 * Pestaña Social: perfil (nombre y foto), logros, ranking y clanes con su reto
 * semanal (modo en grupo). Perfil y logros funcionan sin conexión; ranking y
 * clanes necesitan la nube (Firebase) y haber iniciado sesión con Google.
 */
(function (LQ) {
  "use strict";

  const { state, store, ui } = LQ;
  const { escapeHtml } = LQ.utils;
  const S = LQ.Social;

  let section = 'perfil';
  let rankMode = 'semanal';
  const cache = { rank: {}, clan: null, members: null, openClans: null, at: {} };
  const FRESH_MS = 60000;
  const TIER_LABEL = { bronce: 'Bronce', plata: 'Plata', oro: 'Oro' };
  const CLAN_EMOJIS = ['🛡️', '🐉', '🦁', '🐺', '🦅', '⚔️', '🔥', '🌟', '👑', '🏰', '🌙', '⚡'];

  const social = () => LQ.cloud && LQ.cloud.social;
  const prof = () => state.profile;
  const fresh = (key) => cache.at[key] && Date.now() - cache.at[key] < FRESH_MS;

  // -------------------------------------------------------------------------
  function render(){
    const el = document.getElementById('view-social');
    if (!el) return;
    el.innerHTML = `
      <div class="segmented" role="tablist" aria-label="Secciones sociales">
        ${seg('perfil', '🪪', 'Perfil')}
        ${seg('logros', '🏆', 'Logros')}
        ${seg('ranking', '📊', 'Ranking')}
        ${seg('clan', '🏰', 'Clan')}
      </div>
      <div id="socialSection"></div>`;
    el.querySelectorAll('[data-social-section]').forEach(b => {
      b.onclick = () => { section = b.dataset.socialSection; render(); };
    });
    const box = document.getElementById('socialSection');
    if (section === 'logros') renderAchievements(box);
    else if (section === 'ranking') renderRanking(box);
    else if (section === 'clan') renderClan(box);
    else renderProfile(box);
  }

  function seg(id, emoji, label, badge){
    return `<button class="seg-btn ${section === id ? 'active' : ''}" role="tab" aria-selected="${section === id}" data-social-section="${id}">
      <span aria-hidden="true">${emoji}</span> ${label}${badge ? ` <span class="seg-badge neutral">${badge}</span>` : ''}</button>`;
  }

  function unlockedCount(){ return Object.keys(prof().achievements || {}).length; }

  // -------------------------------------------------------------------------
  // Perfil
  // -------------------------------------------------------------------------
  function renderProfile(box){
    const p = prof();
    const info = LQ.Rules.levelInfo(state.character.totalXp || 0, state.settings);
    const st = LQ.Achievements.stats(state);
    box.innerHTML = `
      <div class="panel profile-panel">
        <div class="profile-head">
          <button class="profile-photo" id="photoBtn" aria-label="Cambiar foto">${ui.avatarHtml(p.photo)}<span class="profile-photo-edit">📷</span></button>
          <div class="profile-id">
            <div class="profile-name">${escapeHtml(p.displayName || 'Aventurero')}</div>
            <div class="sub" style="margin:0">Nivel ${info.level} · ${unlockedCount()} logros · mejor racha ${st.bestStreak} 🔥</div>
          </div>
        </div>
        <div class="field" style="margin-top:14px">
          <label for="pName">Nombre (opcional)</label>
          <input type="text" id="pName" maxlength="30" placeholder="Cómo quieres que te vean" value="${escapeHtml(p.displayName || '')}">
        </div>
        <div class="row">
          <button class="btn small" id="pSave">Guardar nombre</button>
          <button class="btn ghost small" id="pPhoto">${p.photo ? 'Cambiar foto' : 'Subir foto'}</button>
          ${p.photo ? '<button class="btn ghost small" id="pPhotoDel">Quitar foto</button>' : ''}
        </div>
        <div class="hint">La foto se toma de tu galería, se recorta en cuadrado y se guarda en tu teléfono. ${p.photo ? '' : 'Mientras no pongas foto, se muestra tu avatar de la Tienda.'}</div>
      </div>
      <div class="panel" id="publicPanel"></div>`;
    document.getElementById('photoBtn').onclick = choosePhoto;
    document.getElementById('pPhoto').onclick = choosePhoto;
    const del = document.getElementById('pPhotoDel');
    if (del) del.onclick = async () => { p.photo = null; await saveProfile('Foto quitada'); };
    document.getElementById('pSave').onclick = async () => {
      p.displayName = S.cleanName(document.getElementById('pName').value);
      await saveProfile(p.displayName ? 'Nombre guardado' : 'Nombre quitado');
    };
    renderPublicPanel();
  }

  async function choosePhoto(){
    try{
      const photo = await ui.pickPhoto();
      if (!photo) return;
      prof().photo = photo;
      await saveProfile('Foto actualizada');
    }catch(e){ ui.showToast(e.message || 'No se pudo cargar la foto'); }
  }

  async function saveProfile(msg){
    await store.saveProfile();
    ui.showToast(msg);
    ui.renderCharacterCard();
    render();
  }

  /** Estado de la parte en línea (cuenta y perfil público). */
  function onlineState(){
    if (!LQ.cloud || !LQ.cloud.configured) return 'off';
    if (!LQ.cloud.user) return 'signed-out';
    return prof().social.public ? 'public' : 'private';
  }

  function onlineGate(box, what){
    const st = onlineState();
    if (st === 'off'){
      box.innerHTML = `<div class="panel"><div class="empty">🌐 ${what} necesita la nube de LifeCoinQuest, que aún no está activada en esta versión de la app.</div></div>`;
      return false;
    }
    if (st === 'signed-out'){
      box.innerHTML = `<div class="panel"><div class="empty">🔐 Para ${what.toLowerCase()} inicia sesión con Google.<br><br>
        <button class="btn" id="gateSignIn">Iniciar sesión con Google</button></div></div>`;
      document.getElementById('gateSignIn').onclick = signIn;
      return false;
    }
    if (st === 'private'){
      box.innerHTML = `<div class="panel"><div class="empty">👁️ Para ${what.toLowerCase()} activa tu perfil público: los demás verán tu nombre, foto, nivel y XP (nunca tus finanzas ni tus misiones).<br><br>
        <button class="btn" id="gatePublic">Activar perfil público</button></div></div>`;
      document.getElementById('gatePublic').onclick = () => setPublic(true);
      return false;
    }
    return true;
  }

  function renderPublicPanel(){
    const box = document.getElementById('publicPanel');
    if (!box) return;
    const st = onlineState();
    box.innerHTML = `
      <h2>Ranking y clanes</h2>
      <div class="sub">${st === 'off' ? 'Necesitan la nube de LifeCoinQuest (aún no activada en esta versión).'
        : st === 'signed-out' ? 'Inicia sesión con Google para competir en el ranking y unirte a un clan.'
        : 'Tu perfil público muestra nombre, foto, nivel, XP, racha y logros. Nunca tus finanzas, misiones ni hábitos.'}</div>
      ${st === 'signed-out' ? '<button class="btn" id="pSignIn">Iniciar sesión con Google</button>' : ''}
      ${st === 'public' || st === 'private' ? `
        <label class="check-row"><input type="checkbox" id="pPublic" ${st === 'public' ? 'checked' : ''}> Mostrar mi perfil en el ranking y en mi clan</label>` : ''}`;
    const si = document.getElementById('pSignIn'); if (si) si.onclick = signIn;
    const pub = document.getElementById('pPublic');
    if (pub) pub.onchange = () => setPublic(pub.checked);
  }

  async function signIn(){
    try{ await LQ.cloud.signIn(); render(); }
    catch(e){ ui.showToast((e && e.message) || 'No se pudo iniciar sesión'); }
  }

  async function setPublic(on){
    const s = prof().social;
    try{
      if (!on && s.clanId){
        if (!confirm('Al ocultar tu perfil saldrás de tu clan. ¿Continuar?')){ render(); return; }
        await social().leaveClan(s.clanId);
        s.clanId = null; s.clanName = null;
      }
      s.public = on;
      await store.saveProfile();
      if (on) await publishNow(); else await social().unpublish();
      cache.at = {};
      ui.showToast(on ? 'Perfil público activado' : 'Perfil público ocultado');
    }catch(e){ ui.showToast(errorText(e)); }
    render();
  }

  /** Sube el perfil público si corresponde (lo usa también la app al cambiar datos). */
  async function publishNow(){
    if (onlineState() !== 'public') return;
    await social().publish(S.publicProfile(state));
  }

  // -------------------------------------------------------------------------
  // Logros
  // -------------------------------------------------------------------------
  function renderAchievements(box){
    const list = LQ.Achievements.progress(state);
    const done = list.filter(a => a.unlockedAt).length;
    const earned = list.filter(a => a.unlockedAt).reduce((s, a) => s + a.reward, 0);
    box.innerHTML = `
      <div class="panel">
        <h2>Logros</h2>
        <div class="sub">${done} de ${list.length} desbloqueados · ${earned} 🪙 ganadas</div>
        <div class="progress"><div class="progress-fill" style="width:${Math.round(done / list.length * 100)}%"></div></div>
      </div>
      <div class="ach-grid">
        ${list.sort((a, b) => (!!b.unlockedAt - !!a.unlockedAt) || (b.pct - a.pct)).map(a => `
          <div class="ach-card tier-${a.tier} ${a.unlockedAt ? 'is-done' : ''}">
            <div class="ach-icon">${a.icon}</div>
            <div class="ach-name">${escapeHtml(a.name)}</div>
            <div class="ach-desc">${escapeHtml(a.desc)}</div>
            ${a.unlockedAt
              ? `<div class="ach-foot"><span class="tag tag-ok">✓ ${escapeHtml(a.unlockedAt)}</span><span class="ach-tier">${TIER_LABEL[a.tier]}</span></div>`
              : `<div class="progress small"><div class="progress-fill" style="width:${Math.round(a.pct * 100)}%"></div></div>
                 <div class="ach-foot"><span class="num">${a.value}/${a.goal}</span><span class="price">+${a.reward} 🪙</span></div>`}
          </div>`).join('')}
      </div>`;
  }

  // -------------------------------------------------------------------------
  // Ranking
  // -------------------------------------------------------------------------
  function renderRanking(box){
    if (!onlineGate(box, 'El ranking')) return;
    box.innerHTML = `
      <div class="chips">
        ${[['semanal', '📅 Esta semana'], ['global', '🌍 Global'], ['clan', '🏰 Mi clan']].map(([id, label]) =>
          `<button class="chip ${rankMode === id ? 'active' : ''}" data-rank="${id}">${label}</button>`).join('')}
      </div>
      <div class="panel"><div id="rankList"><div class="empty">Cargando…</div></div></div>`;
    box.querySelectorAll('[data-rank]').forEach(b => { b.onclick = () => { rankMode = b.dataset.rank; renderRanking(box); }; });
    loadRanking().then(list => drawRanking(list)).catch(e => {
      const el = document.getElementById('rankList');
      if (el) el.innerHTML = `<div class="empty">${escapeHtml(errorText(e))}</div>`;
    });
  }

  async function loadRanking(){
    const key = 'rank:' + rankMode;
    if (fresh(key)) return cache.rank[rankMode];
    await publishNow();
    let list;
    if (rankMode === 'global') list = await social().topGlobal(50);
    else if (rankMode === 'semanal') list = await social().topWeekly(S.weekKey(new Date()), 50);
    else {
      const clan = await loadClan();
      list = clan ? (await social().members(clan)).sort((a, b) => weekly(b) - weekly(a)) : null;
    }
    cache.rank[rankMode] = list; cache.at[key] = Date.now();
    return list;
  }

  function weekly(p){ return p.weekKey === S.weekKey(new Date()) ? (p.weeklyXp || 0) : 0; }

  function drawRanking(list){
    const el = document.getElementById('rankList');
    if (!el) return;
    if (list === null){ el.innerHTML = '<div class="empty">Aún no estás en un clan. Únete a uno en la sección Clan.</div>'; return; }
    if (!list.length){ el.innerHTML = '<div class="empty">Todavía no hay nadie aquí. ¡Sé el primero!</div>'; return; }
    const me = social().uid;
    const value = (p) => rankMode === 'global' ? (p.totalXp || 0) : weekly(p);
    el.innerHTML = list.map((p, i) => `
      <div class="rank-row ${p.id === me ? 'is-me' : ''}">
        <div class="rank-pos">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</div>
        <div class="rank-avatar">${ui.avatarHtml(p.photo)}</div>
        <div class="rank-main">
          <div class="rank-name">${escapeHtml(p.name)}${p.id === me ? ' <span class="tag">Tú</span>' : ''}</div>
          <div class="rank-meta">Nivel ${p.level} · 🔥 ${p.streak || 0} · 🏆 ${p.achievements || 0}${p.clanName && rankMode !== 'clan' ? ' · 🏰 ' + escapeHtml(p.clanName) : ''}</div>
        </div>
        <div class="rank-xp num">${value(p).toLocaleString('es-CO')}<small>XP</small></div>
      </div>`).join('');
  }

  // -------------------------------------------------------------------------
  // Clan (modo en grupo)
  // -------------------------------------------------------------------------
  async function loadClan(){
    const s = prof().social;
    if (!s.clanId) return null;
    if (fresh('clan') && cache.clan && cache.clan.id === s.clanId) return cache.clan;
    const clan = await social().getClan(s.clanId);
    if (!clan || !clan.members.includes(social().uid)){
      // El clan desapareció o ya no somos integrantes.
      s.clanId = null; s.clanName = null;
      await store.saveProfile();
      cache.clan = null;
      return null;
    }
    if (s.clanName !== clan.name){ s.clanName = clan.name; await store.saveProfile(); }
    cache.clan = clan; cache.at.clan = Date.now();
    return clan;
  }

  function renderClan(box){
    if (!onlineGate(box, 'El clan')) return;
    box.innerHTML = '<div class="panel"><div class="empty">Cargando…</div></div>';
    loadClan().then(clan => clan ? drawMyClan(box, clan) : drawNoClan(box)).catch(e => {
      box.innerHTML = `<div class="panel"><div class="empty">${escapeHtml(errorText(e))}</div></div>`;
    });
  }

  async function drawMyClan(box, clan){
    await publishNow();
    const members = (fresh('members') && cache.members) || await social().members(clan);
    cache.members = members; cache.at.members = Date.now();
    const ch = S.clanChallenge(members);
    const claimed = !!prof().social.claimedWeeks[ch.weekKey];
    const me = social().uid;
    const sorted = members.slice().sort((a, b) => weekly(b) - weekly(a));
    box.innerHTML = `
      <div class="panel clan-hero">
        <div class="clan-emoji">${escapeHtml(clan.emoji || '🛡️')}</div>
        <div class="clan-main">
          <h2>${escapeHtml(clan.name)}</h2>
          <div class="sub" style="margin:0">${clan.memberCount} de ${S.CLAN_MAX} integrantes · ${clan.open ? 'Abierto' : 'Privado'}</div>
          ${clan.description ? `<p class="clan-desc">${escapeHtml(clan.description)}</p>` : ''}
        </div>
      </div>
      <div class="panel">
        <h2>Reto semanal del clan</h2>
        <div class="sub">Sumen ${ch.goal.toLocaleString('es-CO')} XP entre todos antes del domingo. Premio: +${ch.reward} 🪙 para cada integrante.</div>
        <div class="progress-row"><div class="progress"><div class="progress-fill" style="width:${Math.round(ch.pct * 100)}%"></div></div>
          <span class="num">${ch.total.toLocaleString('es-CO')} / ${ch.goal.toLocaleString('es-CO')}</span></div>
        ${ch.done ? (claimed ? '<div class="hint">✓ Premio de esta semana reclamado.</div>'
          : '<button class="btn" id="claimClan" style="margin-top:12px">🏆 Reclamar premio</button>') : ''}
      </div>
      <div class="panel">
        <div class="section-head"><h2>Integrantes</h2><button class="btn ghost small" id="clanRefresh">↻</button></div>
        ${sorted.map((m, i) => `
          <div class="rank-row ${m.id === me ? 'is-me' : ''}">
            <div class="rank-pos">${i + 1}</div>
            <div class="rank-avatar">${ui.avatarHtml(m.photo)}</div>
            <div class="rank-main">
              <div class="rank-name">${escapeHtml(m.name)}${m.id === clan.ownerUid ? ' 👑' : ''}${m.id === me ? ' <span class="tag">Tú</span>' : ''}</div>
              <div class="rank-meta">Nivel ${m.level} · 🔥 ${m.streak || 0}</div>
            </div>
            <div class="rank-xp num">${weekly(m).toLocaleString('es-CO')}<small>XP semana</small></div>
          </div>`).join('')}
        ${clan.members.length > members.length ? `<div class="hint">${clan.members.length - members.length} integrante(s) aún sin perfil público.</div>` : ''}
      </div>
      <div class="panel">
        <h2>Invita a tus amigos</h2>
        <div class="sub">Comparte este código: con él pueden unirse aunque el clan sea privado.</div>
        <div class="clan-code num">${escapeHtml(clan.code)}</div>
        <div class="row">
          <button class="btn small" id="shareCode">Compartir código</button>
          ${clan.ownerUid === me ? `<button class="btn ghost small" id="toggleOpen">${clan.open ? 'Hacer privado' : 'Hacer abierto'}</button>` : ''}
          <button class="btn ghost small" id="leaveClan">Salir del clan</button>
        </div>
      </div>`;
    const claim = document.getElementById('claimClan');
    if (claim) claim.onclick = async () => {
      const s = prof().social;
      if (s.claimedWeeks[ch.weekKey]) return;
      s.claimedWeeks[ch.weekKey] = true;
      state.character.coins = (state.character.coins || 0) + ch.reward;
      await store.saveProfile(); await store.saveCharacter();
      ui.renderCharacterCard();
      ui.celebrate({ icon: '🏆', title: '¡Reto de clan superado!', message: clan.name + ' sumó ' + ch.total.toLocaleString('es-CO') + ' XP esta semana.', rewards: ['+' + ch.reward + ' 🪙'] });
      render();
    };
    document.getElementById('clanRefresh').onclick = () => { cache.at = {}; render(); };
    document.getElementById('shareCode').onclick = () => shareCode(clan);
    document.getElementById('leaveClan').onclick = async () => {
      if (!confirm('¿Salir de ' + clan.name + '?' + (clan.memberCount === 1 ? ' Eres el último integrante: el clan se borrará.' : ''))) return;
      try{
        await social().leaveClan(clan.id);
        Object.assign(prof().social, { clanId: null, clanName: null });
        await store.saveProfile(); await publishNow();
        cache.clan = null; cache.at = {};
        ui.showToast('Saliste del clan');
      }catch(e){ ui.showToast(errorText(e)); }
      render();
    };
    const toggle = document.getElementById('toggleOpen');
    if (toggle) toggle.onclick = async () => {
      try{ cache.clan = await social().updateClan(clan.id, { open: !clan.open }); cache.at.clan = Date.now(); }
      catch(e){ ui.showToast(errorText(e)); }
      render();
    };
  }

  async function shareCode(clan){
    const text = 'Únete a mi clan "' + clan.name + '" en LifeCoinQuest con el código ' + clan.code;
    try{
      if (navigator.share){ await navigator.share({ title: 'LifeCoinQuest', text }); return; }
    }catch(e){ if (e && e.name === 'AbortError') return; }
    try{ await navigator.clipboard.writeText(text); ui.showToast('Código copiado'); }
    catch(e){ ui.showToast('Código: ' + clan.code); }
  }

  async function drawNoClan(box){
    box.innerHTML = `
      <div class="panel">
        <h2>Únete con un código</h2>
        <div class="sub">Pídele el código a un amigo que ya tenga clan.</div>
        <div class="row"><input type="text" id="joinCode" maxlength="6" placeholder="Ej: K7MP2Q" style="flex:1;text-transform:uppercase">
          <button class="btn" id="joinBtn">Unirme</button></div>
      </div>
      <div class="panel">
        <h2>Crea tu clan</h2>
        <div class="sub">Hasta ${S.CLAN_MAX} integrantes. Juntos tienen un reto de XP cada semana.</div>
        <div class="field"><label>Emblema</label><div class="emoji-pick" id="emojiPick">
          ${CLAN_EMOJIS.map((e, i) => `<button class="chip ${i === 0 ? 'active' : ''}" data-emoji="${e}">${e}</button>`).join('')}</div></div>
        <div class="field"><label for="clanName">Nombre</label><input type="text" id="clanName" maxlength="30" placeholder="Ej: Los Madrugadores"></div>
        <div class="field"><label for="clanDesc">Descripción (opcional)</label><input type="text" id="clanDesc" maxlength="140" placeholder="Qué los une"></div>
        <label class="check-row"><input type="checkbox" id="clanOpen" checked> Abierto: cualquiera puede encontrarlo y unirse</label>
        <button class="btn" id="createClan" style="margin-top:12px">Crear clan</button>
      </div>
      <div class="panel">
        <h2>Clanes abiertos</h2>
        <div id="openClans"><div class="empty">Cargando…</div></div>
      </div>`;
    let emoji = CLAN_EMOJIS[0];
    box.querySelectorAll('[data-emoji]').forEach(b => {
      b.onclick = () => { emoji = b.dataset.emoji; box.querySelectorAll('[data-emoji]').forEach(x => x.classList.toggle('active', x === b)); };
    });
    document.getElementById('joinBtn').onclick = async () => {
      const code = document.getElementById('joinCode').value.trim();
      if (code.length !== 6){ ui.showToast('El código tiene 6 caracteres'); return; }
      try{
        const clan = await social().findByCode(code);
        if (!clan){ ui.showToast('No existe un clan con ese código'); return; }
        await join(clan.id);
      }catch(e){ ui.showToast(errorText(e)); }
    };
    document.getElementById('createClan').onclick = async () => {
      const name = S.cleanName(document.getElementById('clanName').value);
      if (name.length < 3){ ui.showToast('El nombre necesita al menos 3 letras'); return; }
      try{
        const clan = await social().createClan({ name, emoji, open: document.getElementById('clanOpen').checked,
          description: document.getElementById('clanDesc').value.trim().slice(0, 140) });
        await afterJoin(clan, '¡Clan creado! Comparte el código ' + clan.code);
      }catch(e){ ui.showToast(errorText(e)); }
    };
    try{
      const list = (fresh('openClans') && cache.openClans) || await social().listOpenClans(20);
      cache.openClans = list; cache.at.openClans = Date.now();
      const el = document.getElementById('openClans');
      if (!el) return;
      el.innerHTML = list.length ? list.map(c => `
        <div class="rank-row">
          <div class="rank-avatar clan-mini">${escapeHtml(c.emoji || '🛡️')}</div>
          <div class="rank-main"><div class="rank-name">${escapeHtml(c.name)}</div>
            <div class="rank-meta">${c.memberCount}/${S.CLAN_MAX} integrantes${c.description ? ' · ' + escapeHtml(c.description) : ''}</div></div>
          <button class="btn small" data-join="${escapeHtml(c.id)}" ${c.memberCount >= S.CLAN_MAX ? 'disabled' : ''}>Unirme</button>
        </div>`).join('') : '<div class="empty">Aún no hay clanes abiertos. ¡Crea el primero!</div>';
      el.querySelectorAll('[data-join]').forEach(b => { b.onclick = () => join(b.dataset.join); });
    }catch(e){
      const el = document.getElementById('openClans');
      if (el) el.innerHTML = `<div class="empty">${escapeHtml(errorText(e))}</div>`;
    }
  }

  async function join(id){
    try{ await afterJoin(await social().joinClan(id), null); }
    catch(e){ ui.showToast(errorText(e)); }
  }

  async function afterJoin(clan, msg){
    Object.assign(prof().social, { clanId: clan.id, clanName: clan.name });
    await store.saveProfile();
    await publishNow();
    cache.clan = clan; cache.at = { clan: Date.now() };
    ui.showToast(msg || '¡Te uniste a ' + clan.name + '!');
    render();
  }

  function errorText(e){
    const code = (e && e.code) || '';
    if (code === 'permission-denied') return 'No tienes permiso para hacer eso.';
    if (code === 'unavailable') return 'Sin conexión. Inténtalo cuando vuelva el internet.';
    if (code === 'failed-precondition') return 'Falta configurar un índice en Firebase (ver docs/firebase-setup.md).';
    return (e && e.message) || 'Algo salió mal. Inténtalo de nuevo.';
  }

  ui.views.social = {
    render,
    showSection: (s) => { section = s; render(); },
    publishNow: () => publishNow().catch(e => console.warn('LifeCoinQuest: perfil público', e))
  };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
