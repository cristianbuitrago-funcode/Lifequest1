/*
 * Reglas de finanzas — funciones puras, sin DOM ni almacenamiento.
 *
 *  - Pagos (obligaciones): próxima fecha según frecuencia, estado
 *    (pendiente / pagado / vencido) y cuánto hace falta para estar al día.
 *  - Distribución del dinero: validación de porcentajes, reparto automático
 *    exacto al centavo, validación del reparto manual y saldo de cada sobre.
 *
 * Las fechas son cadenas locales 'YYYY-MM-DD'.
 */
(function (LQ) {
  "use strict";

  const { fmtDate } = LQ.utils;

  // ---------------------------------------------------------------------------
  // Fechas
  // ---------------------------------------------------------------------------
  function parseDate(str){
    const [y, m, d] = String(str).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  function addDaysStr(str, n){
    const d = parseDate(str); d.setDate(d.getDate() + n); return fmtDate(d);
  }
  function daysInMonth(y, m){ return new Date(y, m + 1, 0).getDate(); }
  /** Suma meses conservando el día de referencia (31 → último día del mes). */
  function addMonthsStr(str, n, anchorDay){
    const d = parseDate(str);
    const day = anchorDay || d.getDate();
    const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
    target.setDate(Math.min(day, daysInMonth(target.getFullYear(), target.getMonth())));
    return fmtDate(target);
  }
  function daysBetween(a, b){ return Math.round((parseDate(b) - parseDate(a)) / 86400000); }

  // ---------------------------------------------------------------------------
  // Pagos
  // ---------------------------------------------------------------------------
  const RECURRING = ['diario', 'semanal', 'quincenal', 'mensual', 'personalizado'];

  function isRecurring(bill){ return RECURRING.indexOf(bill.frequency) !== -1; }

  /** Fecha del siguiente vencimiento después de `dateStr` (null si es único). */
  function nextDue(bill, dateStr){
    switch (bill.frequency){
      case 'diario':        return addDaysStr(dateStr, 1);
      case 'semanal':       return addDaysStr(dateStr, 7);
      case 'quincenal':     return addDaysStr(dateStr, 15);
      case 'mensual':       return addMonthsStr(dateStr, 1, bill.anchorDay);
      case 'personalizado': return addDaysStr(dateStr, Math.max(1, Math.round(bill.customDays || 1)));
      default:              return null;
    }
  }

  /**
   * - Único: pagado si tiene paidAt; si no, vencido cuando la fecha pasó.
   * - Recurrente: `dueDate` es el próximo vencimiento sin pagar. Tras pagar,
   *   se muestra "Pagado" hasta la fecha del ciclo cubierto (`paidThrough`).
   */
  function billStatus(bill, today){
    if (!isRecurring(bill)){
      if (bill.paidAt) return 'pagado';
      return bill.dueDate < today ? 'vencido' : 'pendiente';
    }
    if (bill.dueDate < today) return 'vencido';
    if (bill.paidThrough && today <= bill.paidThrough) return 'pagado';
    return 'pendiente';
  }

  /** Vencimientos sin pagar de un pago hasta `until` (incluye los ya vencidos). */
  function occurrencesUntil(bill, until, limit){
    const out = [];
    if (!bill.dueDate || (!isRecurring(bill) && bill.paidAt)) return out;
    let d = bill.dueDate;
    const max = limit || 400;
    while (d && d <= until && out.length < max){
      out.push(d);
      if (!isRecurring(bill)) break;
      d = nextDue(bill, d);
    }
    return out;
  }

  /**
   * Resumen para "mantenerse al día".
   * @returns {{overdue, next7, next30, upcoming}} importes y lista ordenada
   */
  function billsSummary(bills, today, horizonDays){
    const h7 = addDaysStr(today, 7);
    const h30 = addDaysStr(today, 30);
    const horizon = addDaysStr(today, horizonDays || 30);
    const sum = { overdue: {amount:0, count:0}, next7: {amount:0, count:0}, next30: {amount:0, count:0} };
    const upcoming = [];
    (bills || []).filter(b => b.active !== false).forEach(b => {
      const amount = Number(b.amount) || 0;
      occurrencesUntil(b, horizon > h30 ? horizon : h30).forEach(date => {
        if (date < today){ sum.overdue.amount += amount; sum.overdue.count++; }
        else {
          if (date <= h7){ sum.next7.amount += amount; sum.next7.count++; }
          if (date <= h30){ sum.next30.amount += amount; sum.next30.count++; }
        }
        if (date <= horizon) upcoming.push({ billId: b.id, name: b.name, date, amount, overdue: date < today });
      });
    });
    upcoming.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    ['overdue', 'next7', 'next30'].forEach(k => { sum[k].amount = round2(sum[k].amount); });
    return Object.assign(sum, { upcoming, needed: round2(sum.overdue.amount + sum.next30.amount) });
  }

  /** Cambios a guardar al marcar el vencimiento actual como pagado. */
  function payPatch(bill, today){
    const onTime = bill.dueDate >= today;
    if (!isRecurring(bill)){
      return { patch: { paidAt: today, lastPaidDate: today }, onTime, paidDue: bill.dueDate };
    }
    const anchorDay = bill.anchorDay || (bill.frequency === 'mensual' ? parseDate(bill.dueDate).getDate() : undefined);
    const patch = {
      paidThrough: bill.dueDate,
      dueDate: nextDue(Object.assign({}, bill, { anchorDay }), bill.dueDate),
      lastPaidDate: today
    };
    if (anchorDay) patch.anchorDay = anchorDay;
    return { patch, onTime, paidDue: bill.dueDate };
  }

  // ---------------------------------------------------------------------------
  // Distribución del dinero
  // ---------------------------------------------------------------------------
  const toCents = (n) => Math.round((Number(n) || 0) * 100);
  const fromCents = (c) => c / 100;
  function round2(n){ return Math.round((Number(n) || 0) * 100) / 100; }

  /** Comprueba nombres, ids y que los porcentajes sumen exactamente 100 %. */
  function validateBuckets(buckets){
    if (!Array.isArray(buckets) || !buckets.length) return { ok:false, total:0, error:'Añade al menos una categoría.' };
    const ids = new Set();
    let totalHundredths = 0;
    for (const b of buckets){
      if (!b || !String(b.name || '').trim()) return { ok:false, total: totalHundredths / 100, error:'Todas las categorías necesitan un nombre.' };
      if (ids.has(b.id)) return { ok:false, total: totalHundredths / 100, error:'Hay categorías repetidas.' };
      ids.add(b.id);
      const p = Number(b.percent);
      if (!isFinite(p) || p < 0) return { ok:false, total: totalHundredths / 100, error:'Los porcentajes deben ser números positivos.' };
      totalHundredths += Math.round(p * 100);
    }
    const total = totalHundredths / 100;
    if (totalHundredths !== 10000){
      const diff = round2(100 - total);
      return { ok:false, total, error: diff > 0 ? 'Falta asignar ' + diff + ' %.' : 'Sobran ' + (-diff) + ' %.' };
    }
    return { ok:true, total, error:null };
  }

  /**
   * Reparto automático exacto al centavo (método del mayor resto): la suma de
   * las partes es siempre igual al monto recibido.
   */
  function autoDistribute(amount, buckets){
    const cents = toCents(amount);
    const raw = buckets.map((b, i) => {
      const exact = cents * (Number(b.percent) || 0) / 100;
      return { i, bucketId: b.id, cents: Math.floor(exact), rest: exact - Math.floor(exact) };
    });
    let left = cents - raw.reduce((s, r) => s + r.cents, 0);
    raw.slice().sort((a, b) => b.rest - a.rest || a.i - b.i).forEach(r => { if (left > 0){ r.cents++; left--; } });
    return raw.map(r => ({ bucketId: r.bucketId, amount: fromCents(r.cents) }));
  }

  /** Reparto manual: nunca más de lo recibido. Devuelve lo que queda libre. */
  function checkManual(amount, parts){
    const total = toCents(amount);
    let used = 0;
    for (const p of parts || []){
      const c = toCents(p.amount);
      if (c < 0) return { ok:false, remaining: fromCents(total - used), error:'Los montos no pueden ser negativos.' };
      used += c;
    }
    const remaining = fromCents(total - used);
    if (used > total) return { ok:false, remaining, error:'Estás repartiendo más dinero del que recibiste.' };
    return { ok:true, remaining, error:null };
  }

  /**
   * Saldo de cada sobre: lo asignado en los repartos menos los gastos pagados
   * desde ese sobre. Lo no repartido queda en "Sin asignar" (id '_libre').
   */
  function bucketBalances(buckets, allocations, finance){
    const map = {};
    const ensure = (id) => (map[id] = map[id] || { allocated:0, spent:0 });
    (buckets || []).forEach(b => ensure(b.id));
    (allocations || []).forEach(a => {
      let used = 0;
      (a.parts || []).forEach(p => { ensure(p.bucketId).allocated += toCents(p.amount); used += toCents(p.amount); });
      const free = toCents(a.amount) - used;
      if (free > 0) ensure('_libre').allocated += free;
    });
    (finance || []).forEach(f => {
      if (f.type === 'gasto' && f.bucketId) ensure(f.bucketId).spent += toCents(f.amount);
    });
    const out = {};
    Object.keys(map).forEach(id => {
      const m = map[id];
      out[id] = { allocated: fromCents(m.allocated), spent: fromCents(m.spent), balance: fromCents(m.allocated - m.spent) };
    });
    return out;
  }

  LQ.FinanceRules = {
    parseDate, addDaysStr, addMonthsStr, daysBetween,
    isRecurring, nextDue, billStatus, occurrencesUntil, billsSummary, payPatch,
    validateBuckets, autoDistribute, checkManual, bucketBalances, round2
  };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
