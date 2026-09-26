/*
 * Estado en memoria de la app. La capa `store` lo carga y lo persiste;
 * la UI solo lo lee.
 */
(function (LQ) {
  "use strict";

  const { DEFAULT_CHARACTER, defaultSettings, defaultProfile } = LQ.config;

  LQ.createEmptyState = function(){
    return {
      character: Object.assign({}, DEFAULT_CHARACTER),
      settings: defaultSettings(),
      quests: [],
      completions: [],
      habits: [],
      finance: [],
      // Perfil del jugador: objetos equipados, consumibles activos y estadísticas
      profile: defaultProfile(),
      bills: [],          // pagos / obligaciones
      allocations: [],    // repartos de ingresos entre sobres
      inventory: [],      // objetos comprados en la tienda
      shopProducts: []    // productos creados o editados desde "Administrar tienda"
    };
  };

  LQ.state = LQ.createEmptyState();
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
