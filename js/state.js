/*
 * Estado en memoria de la app. La capa `store` lo carga y lo persiste;
 * la UI solo lo lee.
 */
(function (LQ) {
  "use strict";

  const { DEFAULT_CHARACTER, defaultSettings } = LQ.config;

  LQ.createEmptyState = function(){
    return {
      character: Object.assign({}, DEFAULT_CHARACTER),
      settings: defaultSettings(),
      quests: [],
      completions: [],
      habits: [],
      finance: []
    };
  };

  LQ.state = LQ.createEmptyState();
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
