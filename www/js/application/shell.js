(function (LQ) {
  "use strict";

  function mountShell(root) {
    root.innerHTML = `
      <div class="app" id="lifequestApp">
        <header class="topbar" data-region="header">
          <div class="brand">
            <img class="brand-logo" src="img/logo-192.png" alt="" width="40" height="40">
            <h1>LifeCoinQuest</h1>
          </div>
          <div class="topbar-actions">
          <button class="theme-btn" id="settingsBtn" type="button" aria-label="Ajustes">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" stroke="currentColor" stroke-width="2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" stroke="currentColor" stroke-width="1.6"/></svg>
          </button>
          <button class="theme-btn" id="themeBtn" type="button" aria-label="Cambiar tema">
            <svg id="themeIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="2"/></svg>
          </button>
          </div>
        </header>

        <section class="char-card" id="charCard" data-region="character" aria-label="Progreso del personaje">
          <span class="char-pet" id="charPet" hidden aria-hidden="true"></span>
          <div class="char-top">
            <div class="level-badge">
              <button class="char-avatar" id="charAvatar" type="button" aria-label="Mi perfil"></button>
              <div class="level-ring" id="levelRing"><span id="levelNum">1</span></div>
              <div class="level-label">
                <div class="l1">Nivel</div>
                <div class="l2" id="levelSub">Aventurero novato</div>
                <div class="char-badges" id="charBadges" hidden></div>
              </div>
            </div>
            <div class="stat-pills">
              <div class="pill gold">🪙 <span class="num" id="coinsVal">0</span></div>
              <div class="pill streak">🔥 <span class="num" id="streakVal">0</span> días</div>
              <div class="pill boost" id="boostPill" hidden></div>
            </div>
          </div>
          <div>
            <div class="xp-track"><div class="xp-fill" id="xpFill" style="width:0%"></div></div>
            <div class="xp-caption"><span><span class="num" id="xpIntoVal">0</span> / <span class="num" id="xpNeedVal">0</span> XP</span><span id="xpTotalVal">0 XP totales</span></div>
          </div>
        </section>

        <nav class="tabs" id="tabs" aria-label="Secciones principales">
          <button class="tab-btn active" type="button" data-tab="resumen">Resumen</button>
          <button class="tab-btn" type="button" data-tab="misiones">Misiones</button>
          <button class="tab-btn" type="button" data-tab="habitos">Hábitos</button>
          <button class="tab-btn" type="button" data-tab="finanzas">Finanzas</button>
          <button class="tab-btn" type="button" data-tab="tienda">🛒 Tienda</button>
          <button class="tab-btn" type="button" data-tab="social">👥 Social</button>
          <button class="tab-btn" type="button" data-tab="decidia">🧠 Decidia</button>
        </nav>

        <main class="app-content" data-region="content">
          <section id="view-resumen" data-view="resumen"></section>
          <section id="view-misiones" data-view="misiones" hidden></section>
          <section id="view-habitos" data-view="habitos" hidden></section>
          <section id="view-finanzas" data-view="finanzas" hidden></section>
          <section id="view-tienda" data-view="tienda" hidden></section>
          <section id="view-social" data-view="social" hidden></section>
          <section id="view-decidia" data-view="decidia" hidden></section>
          <section id="view-ajustes" data-view="ajustes" hidden></section>
        </main>
      </div>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
    `;
  }

  LQ.app = LQ.app || {};
  LQ.app.mountShell = mountShell;
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
