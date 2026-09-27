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
          <button class="theme-btn" id="themeBtn" type="button" aria-label="Cambiar tema">
            <svg id="themeIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="2"/></svg>
          </button>
        </header>

        <section class="char-card" id="charCard" data-region="character" aria-label="Progreso del personaje">
          <span class="char-pet" id="charPet" hidden aria-hidden="true"></span>
          <div class="char-top">
            <div class="level-badge">
              <div class="char-avatar" id="charAvatar" hidden aria-hidden="true"></div>
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
          <button class="tab-btn" type="button" data-tab="ajustes">Ajustes</button>
        </nav>

        <main class="app-content" data-region="content">
          <section id="view-resumen" data-view="resumen"></section>
          <section id="view-misiones" data-view="misiones" hidden></section>
          <section id="view-habitos" data-view="habitos" hidden></section>
          <section id="view-finanzas" data-view="finanzas" hidden></section>
          <section id="view-tienda" data-view="tienda" hidden></section>
          <section id="view-ajustes" data-view="ajustes" hidden></section>
        </main>
      </div>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
    `;
  }

  LQ.app = LQ.app || {};
  LQ.app.mountShell = mountShell;
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
