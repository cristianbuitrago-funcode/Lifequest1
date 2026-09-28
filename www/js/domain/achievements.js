/*
 * Logros — reglas puras (sin DOM): qué logros hay, cuánto llevas de cada uno y
 * cuáles acabas de desbloquear. Cada logro da monedas una sola vez.
 */
(function (LQ) {
  "use strict";

  const { fmtDate, addDays } = LQ.utils;

  // tier: bronce | plata | oro (estilo de la medalla)
  const ACHIEVEMENTS = [
    { id: 'mision-1',    icon: '⚔️', tier: 'bronce', name: 'Primera misión',       desc: 'Completa tu primera misión.',               stat: 'quests',       goal: 1,    reward: 5 },
    { id: 'mision-10',   icon: '🗡️', tier: 'bronce', name: 'Aprendiz',             desc: 'Completa 10 misiones.',                     stat: 'quests',       goal: 10,   reward: 15 },
    { id: 'mision-50',   icon: '🛡️', tier: 'plata',  name: 'Caballero',            desc: 'Completa 50 misiones.',                     stat: 'quests',       goal: 50,   reward: 40 },
    { id: 'mision-200',  icon: '👑', tier: 'oro',    name: 'Leyenda',              desc: 'Completa 200 misiones.',                    stat: 'quests',       goal: 200,  reward: 120 },
    { id: 'nivel-5',     icon: '⭐', tier: 'bronce', name: 'En ascenso',           desc: 'Llega al nivel 5.',                         stat: 'level',        goal: 5,    reward: 20 },
    { id: 'nivel-10',    icon: '🌟', tier: 'plata',  name: 'Veterano',             desc: 'Llega al nivel 10.',                        stat: 'level',        goal: 10,   reward: 50 },
    { id: 'nivel-20',    icon: '💫', tier: 'oro',    name: 'Maestro',              desc: 'Llega al nivel 20.',                        stat: 'level',        goal: 20,   reward: 150 },
    { id: 'racha-3',     icon: '🔥', tier: 'bronce', name: 'Encendido',            desc: 'Mantén una racha de 3 días.',               stat: 'bestStreak',   goal: 3,    reward: 10 },
    { id: 'racha-7',     icon: '🔥', tier: 'plata',  name: 'Semana perfecta',      desc: 'Mantén una racha de 7 días.',               stat: 'bestStreak',   goal: 7,    reward: 30 },
    { id: 'racha-30',    icon: '☄️', tier: 'oro',    name: 'Imparable',            desc: 'Mantén una racha de 30 días.',              stat: 'bestStreak',   goal: 30,   reward: 120 },
    { id: 'habitos-3',   icon: '🌱', tier: 'bronce', name: 'Rutina',               desc: 'Crea 3 hábitos.',                           stat: 'habits',       goal: 3,    reward: 10 },
    { id: 'habito-7',    icon: '🌿', tier: 'plata',  name: 'Constante',            desc: 'Cumple un hábito 7 días seguidos.',         stat: 'habitStreak',  goal: 7,    reward: 30 },
    { id: 'habito-30',   icon: '🌳', tier: 'oro',    name: 'Hábito de hierro',     desc: 'Cumple un hábito 30 días seguidos.',        stat: 'habitStreak',  goal: 30,   reward: 100 },
    { id: 'pago-1',      icon: '💳', tier: 'bronce', name: 'Cuentas claras',       desc: 'Paga una cuenta a tiempo.',                 stat: 'billsOnTime',  goal: 1,    reward: 10 },
    { id: 'pago-10',     icon: '🏦', tier: 'plata',  name: 'Siempre al día',       desc: 'Paga 10 cuentas a tiempo.',                 stat: 'billsOnTime',  goal: 10,   reward: 40 },
    { id: 'pago-racha-5',icon: '📈', tier: 'oro',    name: 'Finanzas de acero',    desc: '5 pagos a tiempo seguidos.',                stat: 'billStreak',   goal: 5,    reward: 60 },
    { id: 'ahorro-1',    icon: '🪙', tier: 'bronce', name: 'Primer reparto',       desc: 'Distribuye un ingreso en tus sobres.',      stat: 'allocations',  goal: 1,    reward: 10 },
    { id: 'compra-1',    icon: '🛒', tier: 'bronce', name: 'De compras',           desc: 'Compra algo en la Tienda.',                 stat: 'purchases',    goal: 1,    reward: 5 },
    { id: 'compra-10',   icon: '🎁', tier: 'plata',  name: 'Coleccionista',        desc: 'Compra 10 objetos en la Tienda.',           stat: 'purchases',    goal: 10,   reward: 40 },
    { id: 'monedas-1000',icon: '💰', tier: 'oro',    name: 'Tesoro',               desc: 'Junta 1.000 monedas al mismo tiempo.',      stat: 'coins',        goal: 1000, reward: 50 },
    { id: 'perfil',      icon: '🪪', tier: 'bronce', name: 'Este soy yo',          desc: 'Ponle nombre y foto a tu perfil.',          stat: 'profile',      goal: 1,    reward: 10 },
    { id: 'clan',        icon: '🏰', tier: 'plata',  name: 'Hermandad',            desc: 'Únete a un clan o crea uno.',               stat: 'clan',         goal: 1,    reward: 25 },
    { id: 'reto-clan',   icon: '🏆', tier: 'oro',    name: 'Victoria de clan',     desc: 'Completa un reto semanal con tu clan.',     stat: 'clanWins',     goal: 1,    reward: 50 }
  ];

  /** Racha más larga de días seguidos en un registro {fecha: true}. */
  function longestRun(log){
    const days = Object.keys(log || {}).filter(d => log[d]).sort();
    let best = 0, run = 0, prev = null;
    days.forEach(d => {
      run = prev && fmtDate(addDays(new Date(prev + 'T12:00:00'), 1)) === d ? run + 1 : 1;
      best = Math.max(best, run);
      prev = d;
    });
    return best;
  }

  /** Números que usan los logros, a partir del estado completo. */
  function stats(state){
    const p = state.profile || {}, st = p.stats || {}, c = state.character || {};
    const level = LQ.Rules.levelInfo(c.totalXp || 0, state.settings).level;
    return {
      quests: (state.completions || []).length,
      level,
      bestStreak: Math.max(st.bestStreak || 0, c.streak || 0),
      habits: (state.habits || []).length,
      habitStreak: Math.max(0, ...(state.habits || []).map(h => longestRun(h.log))),
      billsOnTime: st.billsOnTime || 0,
      billStreak: st.bestBillStreak || 0,
      allocations: (state.allocations || []).length,
      purchases: st.purchases || 0,
      coins: c.coins || 0,
      profile: p.displayName && p.photo ? 1 : 0,
      clan: p.social && p.social.clanId ? 1 : 0,
      clanWins: Object.keys((p.social && p.social.claimedWeeks) || {}).length
    };
  }

  /** Lista con progreso de cada logro. */
  function progress(state){
    const s = stats(state), unlocked = (state.profile && state.profile.achievements) || {};
    return ACHIEVEMENTS.map(a => {
      const value = Math.min(a.goal, s[a.stat] || 0);
      return Object.assign({}, a, { value, pct: value / a.goal, unlockedAt: unlocked[a.id] || null });
    });
  }

  /** Logros cumplidos que aún no estaban desbloqueados. */
  function newlyEarned(state){
    return progress(state).filter(a => !a.unlockedAt && a.value >= a.goal);
  }

  LQ.Achievements = { ACHIEVEMENTS, stats, progress, newlyEarned, longestRun };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});

/*
 * Desbloqueo: marca los logros nuevos, suma sus monedas y guarda.
 * Devuelve la lista desbloqueada (vacía si no hay nada nuevo).
 */
(function (LQ) {
  "use strict";

  let running = null;

  async function claim(){
    if (running) return running;
    running = (async () => {
      const list = LQ.Achievements.newlyEarned(LQ.state);
      if (!list.length) return [];
      const today = LQ.utils.todayStr();
      const p = LQ.state.profile;
      list.forEach(a => {
        p.achievements[a.id] = today;
        LQ.state.character.coins = (LQ.state.character.coins || 0) + a.reward;
      });
      p.stats.bestStreak = LQ.Achievements.stats(LQ.state).bestStreak;
      await LQ.store.saveProfile();
      await LQ.store.saveCharacter();
      return list;
    })();
    try { return await running; } finally { running = null; }
  }

  LQ.Achievements.claim = claim;
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
