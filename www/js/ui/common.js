/*
 * Helpers compartidos de la interfaz.
 */
(function (LQ) {
  "use strict";

  const { escapeHtml } = LQ.utils;
  const state = LQ.state;

  const ui = LQ.ui = LQ.ui || {};
  ui.views = ui.views || {};
  // Acciones invocadas desde botones con data-action="nombre" data-id="…"
  ui.actions = ui.actions || {};

  ui.$ = (id) => document.getElementById(id);

  ui.showToast = function showToast(msg){
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=>t.classList.remove('show'), 2600);
  };

  ui.svgCheck = () => '<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  ui.svgTrash = () => '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0-1 13a1 1 0 01-1 1H8a1 1 0 01-1-1L6 7h12z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  ui.catById = (id) => (state.settings.categories||[]).find(c=>c.id===id);
  ui.catName = (id) => { const c = ui.catById(id); return c ? c.name : '—'; };
  ui.catColor = (id) => { const c = ui.catById(id); return c ? c.color : '#8890b0'; };
  ui.categoryOptions = () => state.settings.categories.map(c=>`<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
