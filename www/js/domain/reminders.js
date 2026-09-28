/*
 * Planificador de recordatorios — funciones puras, sin DOM ni plugins.
 *
 * Las notificaciones locales se programan por adelantado, así que su texto se
 * calcula ahora: para hoy se usan las misiones que realmente faltan; para los
 * días siguientes, las misiones diarias y hábitos activos. La app vuelve a
 * planificar cada vez que se abre o cambia algo, y así el texto se mantiene al día.
 *
 * Tipos de recordatorio:
 *   morning   resumen de la mañana
 *   evening   aviso de pendientes
 *   extra     horas adicionales elegidas por el usuario ("por si lo dejo para después")
 *   bill      pagos: unos días antes y varias veces el día del vencimiento
 */
(function (LQ) {
  "use strict";

  const { fmtDate, addDays } = LQ.utils;

  const DAYS_AHEAD = 14;
  const MAX_EXTRA = 6;
  // Rangos de ids por tipo (todos dentro de ID_RANGE, que la app limpia al replanificar).
  const ID_BASE = { morning: 1000, evening: 2000, extra: 3000, bill: 5000 };
  const ID_RANGE = [1000, 9999];
  const MAX_BILL_NOTIFICATIONS = 300;

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
  function money(n){ return '$' + (Number(n) || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 }); }
  function dateFromStr(s){ const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function shortDate(s){ return dateFromStr(s).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }); }

  function cfgOf(state){ return (state.settings && state.settings.reminders) || {}; }
  function activeExtras(cfg){ return (cfg.extra || []).filter(x => x && x.enabled).slice(0, MAX_EXTRA); }
  function billsEnabled(cfg){ return !cfg.bills || cfg.bills.enabled !== false; }
  // Modo menor (Familia): no hay Finanzas, así que tampoco avisos de pagos.
  // …ni cuando el usuario ocultó Finanzas (Ajustes → Secciones).
  function childMode(state){
    const s = state.settings || {};
    return !!((s.family && s.family.childMode) || (s.modules && s.modules.finanzas === false));
  }

  /** true si hay algún recordatorio que programar (para no pedir permisos en vano). */
  function wanted(state){
    const cfg = cfgOf(state);
    if ((cfg.morning || {}).enabled || (cfg.evening || {}).enabled || activeExtras(cfg).length) return true;
    return billsEnabled(cfg) && !childMode(state) && (state.bills || []).some(b => isLive(b) && b.dueDate && !(b.paidAt && !isRecurringBill(b)));
  }
  function isLive(b){ return b && b.active !== false && !b.deleted; }
  function isRecurringBill(b){ return !!(LQ.FinanceRules && LQ.FinanceRules.isRecurring(b)); }

  // -------------------------------------------------------------------------
  // Misiones y hábitos (mañana, noche y horas extra)
  // -------------------------------------------------------------------------
  function planDaily(state, now, days, out){
    const cfg = cfgOf(state);
    const morning = cfg.morning || {}, evening = cfg.evening || {};
    const extras = activeExtras(cfg);
    if (!morning.enabled && !evening.enabled && !extras.length) return;

    const today = fmtDate(now);
    const daily = state.quests.filter(q => q.active && q.recurrence === 'diaria');
    const habits = state.habits || [];
    const streak = state.character.streak || 0;
    const activeToday = state.character.lastActiveDate === today;
    const penalty = state.settings.punishmentCoins || 0;

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

      // Texto de "lo que falta" (noche y horas extra).
      const pending = (title) => {
        let t = title, body;
        if (isToday){
          const names = quests.map(q => q.title).concat(habitsLeft.map(h => h.title));
          body = 'Te falta' + (names.length === 1 ? ' ' : 'n ') + listNames(names) + '.';
          if (streak > 0 && !activeToday) t = '🔥 ¡No pierdas tu racha de ' + plural(streak, 'día', 'días') + '!';
        } else {
          body = '¿Ya completaste tus ' + joinParts(parts) + ' de hoy?';
        }
        if (quests.length && penalty > 0) body += ' Cada misión diaria sin hacer cuesta ' + penalty + ' 🪙.';
        return { title: t, body };
      };

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
          const p = pending('🌙 Misiones pendientes');
          out.push({ id: ID_BASE.evening + i, kind: 'evening', date: ds, at, title: p.title, body: p.body });
        }
      }

      extras.forEach((x, slot) => {
        const at = atTime(day, x.time, '18:00');
        if (at > now){
          const p = pending('⏰ ¿Ya lo hiciste?');
          out.push({ id: ID_BASE.extra + slot * 100 + i, kind: 'extra', date: ds, at, title: p.title, body: p.body });
        }
      });
    }
  }

  // -------------------------------------------------------------------------
  // Pagos: N días antes y varias veces el día del vencimiento
  // -------------------------------------------------------------------------
  function planBills(state, now, days, out){
    const cfg = cfgOf(state);
    if (!billsEnabled(cfg) || childMode(state) || !LQ.FinanceRules) return;
    const b = Object.assign({ daysBefore: 3, beforeTime: '09:00', dueTimes: ['08:00', '13:00', '19:00'] }, cfg.bills || {});
    const FR = LQ.FinanceRules;
    const today = fmtDate(now);
    const until = fmtDate(addDays(now, days - 1 + Math.max(0, b.daysBefore)));
    const lastDay = fmtDate(addDays(now, days - 1));
    const list = [];

    (state.bills || []).filter(isLive).forEach(bill => {
      const amount = money(bill.amount);
      let overdueDone = false;
      FR.occurrencesUntil(bill, until).forEach(due => {
        if (due < today){
          if (overdueDone) return;
          overdueDone = true;
          // Vencido: un aviso diario por la mañana durante los próximos días (máx. 3).
          for (let i = 0; i < Math.min(3, days); i++){
            const day = addDays(now, i);
            const at = atTime(day, b.dueTimes[0], '08:00');
            if (at > now) list.push({ kind: 'bill', date: fmtDate(day), at, billId: bill.id,
              title: '⚠️ Pago vencido: ' + bill.name,
              body: amount + ' · venció el ' + shortDate(due) + '. Ponte al día y márcalo como pagado.' });
          }
          return;
        }
        // Unos días antes (los pagos diarios no lo necesitan).
        if (b.daysBefore > 0 && bill.frequency !== 'diario'){
          const beforeDay = FR.addDaysStr(due, -b.daysBefore);
          if (beforeDay >= today && beforeDay <= lastDay){
            const at = atTime(dateFromStr(beforeDay), b.beforeTime, '09:00');
            if (at > now) list.push({ kind: 'bill', date: beforeDay, at, billId: bill.id,
              title: '💳 En ' + plural(b.daysBefore, 'día', 'días') + ' vence ' + bill.name,
              body: amount + ' · vence el ' + shortDate(due) + '. Ve apartando el dinero.' });
          }
        }
        // El día del pago, varias veces (una sola para los pagos diarios).
        if (due <= lastDay){
          const times = bill.frequency === 'diario' ? b.dueTimes.slice(0, 1) : b.dueTimes;
          times.forEach((t, k) => {
            const at = atTime(dateFromStr(due), t, '08:00');
            if (at > now) list.push({ kind: 'bill', date: due, at, billId: bill.id,
              title: (k === 0 ? '💳 Hoy vence: ' : '⏰ Recuerda pagar: ') + bill.name,
              body: amount + ' · márcalo como pagado en LifeCoinQuest y gana XP.' });
          });
        }
      });
    });

    list.sort((x, y) => x.at - y.at).slice(0, MAX_BILL_NOTIFICATIONS)
      .forEach((n, k) => out.push(Object.assign({ id: ID_BASE.bill + k }, n)));
  }

  /**
   * @returns {Array<{id:number, kind:string, date:string, at:Date, title:string, body:string}>}
   */
  function plan(state, now, days){
    now = now || new Date();
    days = days || DAYS_AHEAD;
    const out = [];
    planDaily(state, now, days, out);
    planBills(state, now, days, out);
    return out;
  }

  LQ.Reminders = { plan, wanted, parseTime, DAYS_AHEAD, ID_RANGE, MAX_EXTRA };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
