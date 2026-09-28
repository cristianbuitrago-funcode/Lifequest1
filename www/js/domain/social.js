/*
 * Reglas del modo social — funciones puras (sin DOM ni red):
 * semana actual, XP semanal, datos del perfil público y reto semanal del clan.
 */
(function (LQ) {
  "use strict";

  const CLAN_MAX = 30;
  const CLAN_GOAL_PER_MEMBER = 400;   // XP semanal por integrante para ganar el reto
  const CLAN_REWARD = 40;             // monedas por reto de clan completado

  /** Semana ISO: "2026-W39". Las semanas empiezan el lunes. */
  function weekKey(date){
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return d.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
  }

  /** Lunes (AAAA-MM-DD) de la semana de `date`. */
  function weekStart(date){
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return LQ.utils.fmtDate(d);
  }

  /** XP ganada con misiones desde el lunes. */
  function weeklyXp(state, now){
    const from = weekStart(now || new Date());
    return (state.completions || []).filter(c => c.date >= from).reduce((s, c) => s + (c.xp || 0), 0);
  }

  function cleanName(name){
    return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 30);
  }

  /** Lo que ven los demás en el ranking y en el clan (nada de finanzas ni misiones). */
  function publicProfile(state, now){
    now = now || new Date();
    const p = state.profile, c = state.character;
    const info = LQ.Rules.levelInfo(c.totalXp || 0, state.settings);
    return {
      name: cleanName(p.displayName) || 'Aventurero',
      photo: p.photo || null,
      level: info.level,
      totalXp: c.totalXp || 0,
      weeklyXp: weeklyXp(state, now),
      weekKey: weekKey(now),
      streak: c.streak || 0,
      achievements: Object.keys(p.achievements || {}).length,
      clanId: (p.social && p.social.clanId) || null,
      clanName: (p.social && p.social.clanName) || null
    };
  }

  /** Progreso del reto semanal a partir de los perfiles públicos del clan. */
  function clanChallenge(members, now){
    const wk = weekKey(now || new Date());
    const goal = CLAN_GOAL_PER_MEMBER * Math.max(1, members.length);
    const total = members.reduce((s, m) => s + (m.weekKey === wk ? (m.weeklyXp || 0) : 0), 0);
    return { weekKey: wk, goal, total, pct: Math.min(1, total / goal), done: total >= goal, reward: CLAN_REWARD };
  }

  /** Código de invitación de 6 caracteres sin letras confusas (0/O, 1/I). */
  function inviteCode(rand){
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    rand = rand || Math.random;
    let out = '';
    for (let i = 0; i < 6; i++) out += abc[Math.floor(rand() * abc.length)];
    return out;
  }

  LQ.Social = { CLAN_MAX, CLAN_GOAL_PER_MEMBER, CLAN_REWARD, weekKey, weekStart, weeklyXp, cleanName, publicProfile, clanChallenge, inviteCode };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
