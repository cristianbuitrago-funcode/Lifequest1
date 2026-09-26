/*
 * Planificador de recordatorios — funciones puras, sin DOM ni plugins.
 *
 * Las notificaciones locales se programan por adelantado, así que su texto se
 * calcula ahora: para hoy se usan las misiones que realmente faltan; para los
 * días siguientes, las misiones diarias y hábitos activos. La app vuelve a
 * planificar cada vez que se abre o cambia algo, y así el texto se mantiene al día.
 */
(function (LQ) {
  "use strict";

  const { fmtDate, addDays } = LQ.utils;

  const DAYS_AHEAD = 14;
  const ID_BASE = { morning: 1000, evening: 2000 };
  const ID_RANGE = [1000, 2999];

  function parseTime(str, fallback){
    const m = /^(\d{1,2}):(\d{2})$/.exec(str || '');
    if (!m) return parseTime(fallback, '08:00');
    return [Math.min(23, +m[1]), Math.min(59, +m[2])];
  }
  function atTime(day, time, fallback){
    const [h, mi] = parseTime(time, fallback);
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, mi, 0, 0);
  }
  function plural(n, one, many){ return n + ' ' + (n === 1 ? one : many); }
  function listNames(names){
    const shown = names.slice(0, 3).map(n => '«' + n + '»');
    const rest = names.length - shown.length;
    if (rest > 0) return shown.join(', ') + ' y ' + plural(rest, 'más', 'más');
    if (shown.length <= 1) return shown.join('');
    return shown.slice(0, -1).join(', ') + ' y ' + shown[shown.length - 1];
  }
  function joinParts(parts){ return parts.length === 2 ? parts[0] + ' y ' + parts[1] : parts[0]; }

  /**
   * @returns {Array<{id:number, kind:'morning'|'evening', date:string, at:Date, title:string, body:string}>}
   */
  function plan(state, now, days){
    now = now || new Date();
    days = days || DAYS_AHEAD;
    const cfg = (state.settings && state.settings.reminders) || {};
    const morning = cfg.morning || {}, evening = cfg.evening || {};
    if (!morning.enabled && !evening.enabled) return [];

    const today = fmtDate(now);
    const daily = state.quests.filter(q => q.active && q.recurrence === 'diaria');
    const habits = state.habits;
    const streak = state.character.streak || 0;
    const activeToday = state.character.lastActiveDate === today;
    const penalty = state.settings.punishmentCoins || 0;
    const out = [];

    for (let i = 0; i < days; i++){
      const day = addDays(now, i);
      const ds = fmtDate(day);
      const isToday = ds === today;
      const quests = isToday ? daily.filter(q => q.lastCompletedDate !== today) : daily;
      const habitsLeft = isToday ? habits.filter(h => !(h.log || {})[today]) : habits;
      if (!quests.length && !habitsLeft.length) continue;

      const parts = [];
      if (quests.length) parts.push(plural(quests.length, 'misión diaria', 'misiones diarias'));
      if (habitsLeft.length) parts.push(plural(habitsLeft.length, 'hábito', 'hábitos'));

      if (morning.enabled){
        const at = atTime(day, morning.time, '08:00');
        if (at > now){
          let body = 'Hoy tienes ' + joinParts(parts) + '.';
          if (isToday && streak > 0) body += ' Racha actual: ' + plural(streak, 'día', 'días') + ' 🔥';
          out.push({ id: ID_BASE.morning + i, kind: 'morning', date: ds, at,
                     title: '⚔️ Nuevo día, nuevas misiones', body });
        }
      }

      if (evening.enabled){
        const at = atTime(day, evening.time, '20:00');
        if (at > now){
          let title = '🌙 Misiones pendientes';
          let body;
          if (isToday){
            const names = quests.map(q => q.title).concat(habitsLeft.map(h => h.title));
            body = 'Te falta' + (names.length === 1 ? ' ' : 'n ') + listNames(names) + '.';
            if (streak > 0 && !activeToday) title = '🔥 ¡No pierdas tu racha de ' + plural(streak, 'día', 'días') + '!';
          } else {
            body = '¿Ya completaste tus ' + joinParts(parts) + ' de hoy?';
          }
          if (quests.length && penalty > 0) body += ' Cada misión diaria sin hacer cuesta ' + penalty + ' 🪙.';
          out.push({ id: ID_BASE.evening + i, kind: 'evening', date: ds, at, title, body });
        }
      }
    }
    return out;
  }

  LQ.Reminders = { plan, parseTime, DAYS_AHEAD, ID_RANGE };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
