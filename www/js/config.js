/*
 * Configuración por defecto de LifeQuest.
 * Datos puros: sin DOM ni almacenamiento.
 */
(function (LQ) {
  "use strict";

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
    theme: 'system'
  };
  const DEFAULT_CHARACTER = { totalXp:0, coins:0, streak:0, lastActiveDate:null };
  const HABIT_LADDER = [
    {days:3,  label:'Chispa',       reward:5},
    {days:7,  label:'Llama',        reward:15},
    {days:14, label:'Hoguera',      reward:30},
    {days:30, label:'Fuego eterno', reward:60}
  ];
  const DIFF_LABELS = {facil:'Fácil', media:'Media', dificil:'Difícil', epica:'Épica'};

  const SAMPLE_QUESTS = [
    {title:'Beber 2L de agua', categoryId:'salud', difficulty:'facil', recurrence:'diaria'},
    {title:'Repasar apuntes 30 min', categoryId:'estudio', difficulty:'media', recurrence:'diaria'},
    {title:'Ordenar el escritorio', categoryId:'hogar', difficulty:'facil', recurrence:'diaria'},
    {title:'Enviar el informe pendiente', categoryId:'trabajo', difficulty:'dificil', recurrence:'unica'}
  ];

  function defaultSettings(){ return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); }

  function mergeSettings(s){
    const out = defaultSettings();
    if (!s) return out;
    if (s.categories && s.categories.length) out.categories = s.categories;
    if (s.xpBase) out.xpBase = s.xpBase;
    if (s.xpGrowth) out.xpGrowth = s.xpGrowth;
    if (typeof s.punishmentCoins === 'number') out.punishmentCoins = s.punishmentCoins;
    if (s.rewardTable) out.rewardTable = Object.assign(out.rewardTable, s.rewardTable);
    if (s.theme) out.theme = s.theme;
    return out;
  }

  LQ.config = {
    DEFAULT_CATEGORIES, DEFAULT_SETTINGS, DEFAULT_CHARACTER, HABIT_LADDER, DIFF_LABELS, SAMPLE_QUESTS,
    defaultSettings, mergeSettings
  };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
