/*
 * Motor de reglas — funciones puras, sin acceso a DOM ni a almacenamiento.
 * (Trasladado sin cambios desde la versión monolítica.)
 */
(function (LQ) {
  "use strict";

  const { HABIT_LADDER } = LQ.config;
  const { fmtDate } = LQ.utils;

  const Rules = {
    levelInfo(totalXp, cfg){
      let level = 1;
      let needed = Math.round(cfg.xpBase * Math.pow(level, cfg.xpGrowth));
      let remaining = Math.max(0, totalXp);
      while (remaining >= needed){
        remaining -= needed;
        level++;
        needed = Math.round(cfg.xpBase * Math.pow(level, cfg.xpGrowth));
      }
      return { level, xpIntoLevel: remaining, xpForNext: needed, pct: Math.min(100, Math.round((remaining/needed)*100)) };
    },
    reward(difficulty, cfg){
      return cfg.rewardTable[difficulty] || {xp:10, coins:2};
    },
    nextStreak(lastActiveDate, today, yesterday){
      if (lastActiveDate === today) return null; // unchanged, already counted today
      if (lastActiveDate === yesterday) return 'inc';
      return 'reset';
    },
    habitStreakInfo(log){
      const days = Object.keys(log||{}).filter(d=>log[d]).sort();
      if (!days.length) return {streak:0, tier:null, nextTier:HABIT_LADDER[0]};
      const set = new Set(days);
      let d = new Date();
      // if today not logged, start counting from yesterday
      let cursor = set.has(fmtDate(d)) ? d : new Date(d.getTime()-86400000);
      let streak = 0;
      while (set.has(fmtDate(cursor))){
        streak++;
        cursor = new Date(cursor.getTime()-86400000);
      }
      let tier = null, nextTier = null;
      for (const t of HABIT_LADDER){
        if (streak >= t.days) tier = t; else { nextTier = t; break; }
      }
      return {streak, tier, nextTier};
    }
  };

  LQ.Rules = Rules;
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
