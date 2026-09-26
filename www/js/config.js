/*
 * Configuración por defecto de LifeQuest.
 * Datos puros: sin DOM ni almacenamiento.
 */
(function (LQ) {
  "use strict";

  const APP_VERSION = '1.2.1';
  const APP_OWNER = 'Cristian Camilo Buitrago Espinosa';

  const DEFAULT_CATEGORIES = [
    {id:'salud', name:'Salud', color:'#1a8f63'},
    {id:'estudio', name:'Estudio', color:'#6d4aff'},
    {id:'trabajo', name:'Trabajo', color:'#0891a8'},
    {id:'hogar', name:'Hogar', color:'#b8860a'},
    {id:'social', name:'Social', color:'#c23a56'},
    {id:'finanzas', name:'Finanzas', color:'#e08a3d'}
  ];
  const DEFAULT_SETTINGS = {
    categories: DEFAULT_CATEGORIES,
    xpBase: 80,
    xpGrowth: 1.35,
    punishmentCoins: 10,
    rewardTable: {
      facil:   {xp:10,  coins:2},
      media:   {xp:25,  coins:5},
      dificil: {xp:50,  coins:12},
      epica:   {xp:100, coins:30}
    },
    theme: 'system',
    // Recordatorios diarios (notificaciones locales en la app Android)
    reminders: {
      morning: {enabled:false, time:'08:00'},
      evening: {enabled:false, time:'20:00'}
    },
    // Recompensa por registrar un pago (a tiempo / con retraso)
    billRewards: {
      onTime: {xp:15, coins:5},
      late:   {xp:5,  coins:0}
    },
    // Distribución del dinero: cómo se reparte cada ingreso entre "sobres"
    distribution: {
      mode: 'auto',          // 'auto' (porcentajes) | 'manual' (el usuario reparte)
      autoOnIncome: true,    // repartir al registrar un ingreso en Finanzas
      buckets: [
        {id:'esenciales',      emoji:'🏠', name:'Gastos esenciales', percent:50},
        {id:'alimentacion',    emoji:'🍔', name:'Alimentación',      percent:15},
        {id:'transporte',      emoji:'🚍', name:'Transporte',        percent:10},
        {id:'entretenimiento', emoji:'🎮', name:'Entretenimiento',   percent:10},
        {id:'ahorro',          emoji:'💰', name:'Ahorro',            percent:15}
      ]
    }
  };
  const DEFAULT_CHARACTER = { totalXp:0, coins:0, streak:0, lastActiveDate:null };
  const HABIT_LADDER = [
    {days:3,  label:'Chispa',       reward:5},
    {days:7,  label:'Llama',        reward:15},
    {days:14, label:'Hoguera',      reward:30},
    {days:30, label:'Fuego eterno', reward:60}
  ];
  const DIFF_LABELS = {facil:'Fácil', media:'Media', dificil:'Difícil', epica:'Épica'};

  const BILL_FREQUENCIES = {
    unico: 'Único', diario: 'Diario', semanal: 'Semanal',
    quincenal: 'Quincenal', mensual: 'Mensual', personalizado: 'Personalizado'
  };
  const BILL_STATUS_LABELS = { pendiente: 'Pendiente', pagado: 'Pagado', vencido: 'Vencido' };

  // Perfil del jugador (objetos de la tienda equipados, consumibles, estadísticas)
  const DEFAULT_PROFILE = {
    equipped: {
      theme: null, background: null, avatar: null, frame: null, pet: null,
      effect: null, aura: null, sound: null, title: null, badges: []
    },
    boosts: { xpDouble: 0 },   // misiones restantes con XP doble
    shields: 0,                // escudos de racha activos
    stats: { billsPaid: 0, billsOnTime: 0, billStreak: 0, bestBillStreak: 0, purchases: 0, coinsSpent: 0 }
  };

  const SAMPLE_QUESTS = [
    {title:'Beber 2L de agua', categoryId:'salud', difficulty:'facil', recurrence:'diaria'},
    {title:'Repasar apuntes 30 min', categoryId:'estudio', difficulty:'media', recurrence:'diaria'},
    {title:'Ordenar el escritorio', categoryId:'hogar', difficulty:'facil', recurrence:'diaria'},
    {title:'Enviar el informe pendiente', categoryId:'trabajo', difficulty:'dificil', recurrence:'unica'}
  ];

  function defaultSettings(){ return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); }

  function defaultProfile(){ return JSON.parse(JSON.stringify(DEFAULT_PROFILE)); }

  function mergeProfile(p){
    const out = defaultProfile();
    if (!p) return out;
    Object.assign(out.equipped, p.equipped || {});
    if (!Array.isArray(out.equipped.badges)) out.equipped.badges = [];
    Object.assign(out.boosts, p.boosts || {});
    if (typeof p.shields === 'number') out.shields = p.shields;
    Object.assign(out.stats, p.stats || {});
    if (p.updatedAt) out.updatedAt = p.updatedAt;
    return out;
  }

  function mergeSettings(s){
    const out = defaultSettings();
    if (!s) return out;
    if (s.categories && s.categories.length) out.categories = s.categories;
    if (s.xpBase) out.xpBase = s.xpBase;
    if (s.xpGrowth) out.xpGrowth = s.xpGrowth;
    if (typeof s.punishmentCoins === 'number') out.punishmentCoins = s.punishmentCoins;
    if (s.rewardTable) out.rewardTable = Object.assign(out.rewardTable, s.rewardTable);
    if (s.theme) out.theme = s.theme;
    if (s.billRewards){
      ['onTime','late'].forEach(k => {
        if (s.billRewards[k]) out.billRewards[k] = Object.assign(out.billRewards[k], s.billRewards[k]);
      });
    }
    if (s.distribution){
      if (s.distribution.mode === 'auto' || s.distribution.mode === 'manual') out.distribution.mode = s.distribution.mode;
      if (typeof s.distribution.autoOnIncome === 'boolean') out.distribution.autoOnIncome = s.distribution.autoOnIncome;
      if (Array.isArray(s.distribution.buckets) && s.distribution.buckets.length) out.distribution.buckets = s.distribution.buckets;
    }
    if (s.reminders){
      ['morning','evening'].forEach(k => {
        if (s.reminders[k]) out.reminders[k] = Object.assign(out.reminders[k], s.reminders[k]);
      });
    }
    return out;
  }

  LQ.config = {
    APP_VERSION, APP_OWNER,
    DEFAULT_CATEGORIES, DEFAULT_SETTINGS, DEFAULT_CHARACTER, HABIT_LADDER, DIFF_LABELS, SAMPLE_QUESTS,
    BILL_FREQUENCIES, BILL_STATUS_LABELS, DEFAULT_PROFILE,
    defaultSettings, mergeSettings, defaultProfile, mergeProfile
  };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
