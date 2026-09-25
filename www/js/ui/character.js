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
    $('coinsVal').textContent = state.character.coins||0;
    $('streakVal').textContent = state.character.streak||0;
    $('xpFill').style.width = info.pct + '%';
    $('xpIntoVal').textContent = info.xpIntoLevel;
    $('xpNeedVal').textContent = info.xpForNext;
    $('xpTotalVal').textContent = (state.character.totalXp||0) + ' XP totales';
    $('levelSub').textContent = TITLES[Math.min(TITLES.length-1, Math.floor((info.level-1)/3))];
  };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
