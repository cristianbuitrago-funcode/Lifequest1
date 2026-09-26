/*
 * Tarjeta de personaje (nivel, XP, monedas, racha).
 */
(function (LQ) {
  "use strict";

  const { Rules, state, ui } = LQ;
  const { $ } = ui;
  const TITLES = ['Aventurero novato','Explorador','Estratega','Veterano','Maestro de misiones','Leyenda viviente'];

  ui.renderCharacterCard = function(){
    const info = Rules.levelInfo(state.character.totalXp||0, state.settings);
    $('levelNum').textContent = info.level;
    $('levelRing').style.setProperty('--pct', info.pct);
    $('coinsVal').textContent = ui.coins(state.character.coins||0);
    $('streakVal').textContent = state.character.streak||0;
    $('xpFill').style.width = info.pct + '%';
    $('xpIntoVal').textContent = info.xpIntoLevel;
    $('xpNeedVal').textContent = info.xpForNext;
    $('xpTotalVal').textContent = (state.character.totalXp||0) + ' XP totales';
    $('levelSub').textContent = TITLES[Math.min(TITLES.length-1, Math.floor((info.level-1)/3))];

    // Consumibles activos de la Tienda (poción de XP doble, escudos de racha)
    const p = state.profile, bits = [];
    if ((p.boosts.xpDouble||0) > 0) bits.push('🧪 x2 · ' + p.boosts.xpDouble);
    if ((p.shields||0) > 0) bits.push('🛡️ ' + p.shields);
    const boost = $('boostPill');
    boost.hidden = !bits.length;
    boost.textContent = bits.join('  ');
    boost.title = [
      (p.boosts.xpDouble||0) > 0 ? 'XP doble en las próximas ' + p.boosts.xpDouble + ' misiones' : '',
      (p.shields||0) > 0 ? p.shields + ' escudo(s) de racha' : ''
    ].filter(Boolean).join(' · ');

    ui.applyCosmetics();
  };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
