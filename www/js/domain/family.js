/*
 * Familia (supervisión parental) — funciones puras, sin DOM ni red.
 *
 * - Modo menor: la app oculta Finanzas (pestaña, avisos de pagos y tutorial).
 *   Solo se sale con el PIN de un adulto o cuando el padre desvincula.
 * - Resumen de progreso: lo que el menor comparte con sus padres vinculados
 *   (nivel, XP, racha, misiones y hábitos de hoy, rastreador del mes, mapa de
 *   evolución, logros y actividad). Nunca incluye finanzas.
 *
 *   settings.family = {
 *     childMode: false,
 *     pins: [{ by: uid|null, salt, hash }],    // PIN de cada adulto que puede desbloquear
 *     parents: [{ uid, name }]                 // padres vinculados (copia local)
 *   }
 */
(function (LQ) {
  "use strict";

  const MAX_PARENTS = 4;
  const INVITE_DAYS = 7;

  function defaults(){ return { childMode: false, pins: [], parents: [] }; }

  function of(settings){ return Object.assign(defaults(), (settings && settings.family) || {}); }
  function isChildMode(settings){ return !!of(settings).childMode; }

  /** Categorías de misiones visibles: en modo menor se quita la de Finanzas. */
  function visibleCategories(settings){
    const cats = (settings && settings.categories) || [];
    return isChildMode(settings) ? cats.filter(c => c.id !== 'finanzas') : cats;
  }

  // -------------------------------------------------------------------------
  // PIN de 4 a 6 dígitos. No es criptografía fuerte: evita guardarlo en texto
  // claro y, con el bloqueo tras varios intentos fallidos (lockFor), dificulta
  // adivinarlo. La seguridad real de los datos la dan las reglas de Firestore.
  // -------------------------------------------------------------------------
  function validPin(pin){ return /^\d{4,6}$/.test(String(pin || '')); }

  /**
   * Bloqueo tras fallos seguidos: con 5 fallos, 1 minuto; cada fallo más
   * duplica la espera (máximo 30 minutos). Devuelve milisegundos de bloqueo.
   */
  const FREE_TRIES = 5;
  function lockFor(fails){
    if (fails < FREE_TRIES) return 0;
    return Math.min(30 * 60000, 60000 * Math.pow(2, fails - FREE_TRIES));
  }

  function hashPin(pin, salt){
    let h = 0x811c9dc5;
    const text = String(salt || '') + ':' + String(pin || '');
    for (let round = 0; round < 500; round++){
      for (let i = 0; i < text.length; i++){
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      h ^= round;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  function newSalt(rand){
    rand = rand || Math.random;
    return Math.floor(rand() * 0xffffffff).toString(36) + Math.floor(rand() * 0xffffffff).toString(36);
  }

  /** { salt, hash } para guardar un PIN nuevo. */
  function makePin(pin, rand){
    const salt = newSalt(rand);
    return { salt, hash: hashPin(pin, salt) };
  }

  /** true si `pin` coincide con el de algún adulto registrado. */
  function checkPin(settings, pin){
    if (!validPin(pin)) return false;
    return of(settings).pins.some(p => p && p.hash === hashPin(pin, p.salt));
  }

  /** ¿Sigue vigente una invitación? (las viejas no se aceptan). */
  function inviteFresh(invite, now){
    if (!invite) return false;
    const t = invite.createdAt && invite.createdAt.toMillis ? invite.createdAt.toMillis() : Number(invite.createdAt) || 0;
    if (!t) return true;
    return (now || Date.now()) - t < INVITE_DAYS * 86400000;
  }

  // -------------------------------------------------------------------------
  // Resumen de progreso del menor
  // -------------------------------------------------------------------------
  const clip = (s, n) => String(s || '').slice(0, n);

  function buildProgress(state, now){
    now = now || new Date();
    const c = state.character, p = state.profile;
    const today = LQ.utils.fmtDate(now);
    const info = LQ.Rules.levelInfo(c.totalXp || 0, state.settings);
    const E = LQ.Evolution;
    const month = E.monthKey(now);
    const tracker = E.tracker(state, month);
    const ladder = E.ladder(state.settings, month, tracker.total);

    const daily = (state.quests || []).filter(q => q.active && q.recurrence === 'diaria').slice(0, 30);
    const once = (state.quests || []).filter(q => q.active && q.recurrence !== 'diaria').slice(0, 10);

    return {
      name: LQ.Social.cleanName(p.displayName) || 'Aventurero',
      photo: p.photo || null,
      level: info.level,
      totalXp: c.totalXp || 0,
      xpInto: info.xpIntoLevel,
      xpNeed: info.xpForNext,
      weeklyXp: LQ.Social.weeklyXp(state, now),
      coins: c.coins || 0,
      streak: c.streak || 0,
      lastActive: c.lastActiveDate || null,
      achievements: Object.keys(p.achievements || {}).length,
      today,
      quests: daily.map(q => ({ title: clip(q.title, 60), done: q.lastCompletedDate === today })),
      pendingOnce: once.map(q => clip(q.title, 60)),
      habits: (state.habits || []).slice(0, 20).map(h => ({
        title: clip(h.title, 60),
        doneToday: !!(h.log || {})[today],
        streak: LQ.Rules.habitStreakInfo(h.log || {}).streak,
        month: tracker.rows.find(r => r.habit.id === h.id).done
      })),
      month: {
        key: month, days: tracker.days, total: tracker.total, perDay: tracker.perDay,
        milestones: ladder.milestones.map(m => ({ at: m.at, reached: m.reached }))
      },
      pillars: E.evolution(state, month).map(x => ({ name: clip(x.name, 24), color: clip(x.color, 9), level: x.level, done: x.done, meta: x.meta })),
      recent: (state.completions || []).slice(0, 8).map(x => ({ title: clip(x.questTitle, 60), date: x.date, xp: x.xp || 0 }))
    };
  }

  /** Texto corto del estado de hoy para la tarjeta del padre. */
  function todaySummary(progress, now){
    const today = LQ.utils.fmtDate(now || new Date());
    if (!progress || progress.today !== today) return { quests: null, habits: null, stale: true };
    const q = progress.quests || [], h = progress.habits || [];
    return {
      stale: false,
      quests: { done: q.filter(x => x.done).length, total: q.length },
      habits: { done: h.filter(x => x.doneToday).length, total: h.length }
    };
  }

  LQ.Family = { MAX_PARENTS, INVITE_DAYS, FREE_TRIES, defaults, of, isChildMode, visibleCategories, validPin, lockFor, hashPin, makePin, checkPin, inviteFresh, buildProgress, todaySummary };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
