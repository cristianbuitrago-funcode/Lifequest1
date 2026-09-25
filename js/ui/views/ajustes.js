/*
 * Pestaña Ajustes: categorías, recompensas, progresión y copia de seguridad.
 */
(function (LQ) {
  "use strict";

  const { state, store, ui } = LQ;
  const { DIFF_LABELS } = LQ.config;
  const { uid, todayStr, escapeHtml } = LQ.utils;

  const STORAGE_LABELS = {
    indexeddb: 'IndexedDB de este navegador',
    localstorage: 'localStorage de este navegador',
    memory: 'memoria temporal (no se conservará al recargar)'
  };

  function render(){
    const el = document.getElementById('view-ajustes');
    const s = state.settings;
    el.innerHTML = `
      <div class="panel">
        <h2>Categorías (pilares)</h2>
        <div class="sub">Se usan en misiones, hábitos y finanzas</div>
        <div class="settings-list" id="catList"></div>
        <button class="btn ghost small" id="addCatBtn" style="margin-top:8px;">+ Añadir categoría</button>
      </div>
      <div class="panel">
        <h2>Recompensas por dificultad</h2>
        <div class="grid2" id="rewardGrid"></div>
      </div>
      <div class="panel">
        <h2>Progresión y castigos</h2>
        <div class="grid2">
          <div class="field"><label for="stXpBase">XP base por nivel</label><input type="number" id="stXpBase" value="${s.xpBase}"></div>
          <div class="field"><label for="stXpGrowth">Curva de crecimiento</label><input type="number" step="0.05" id="stXpGrowth" value="${s.xpGrowth}"></div>
          <div class="field"><label for="stPunish">Monedas perdidas por misión diaria incumplida</label><input type="number" id="stPunish" value="${s.punishmentCoins}"></div>
        </div>
      </div>
      <button class="btn" id="saveSettingsBtn">Guardar ajustes</button>
      <div class="panel" style="margin-top:14px;">
        <h2>Copia de seguridad</h2>
        <div class="sub">Tus datos se guardan solo en este dispositivo. Exporta una copia para no perderlos si borras los datos del navegador o para pasarlos a otro equipo.</div>
        <div class="backup-actions">
          <button class="btn ghost small" id="exportBtn">Exportar datos (.json)</button>
          <button class="btn ghost small" id="importBtn">Importar copia…</button>
          <input type="file" id="importFile" accept="application/json,.json" hidden>
        </div>
        <div class="storage-info">Almacenamiento: ${escapeHtml(STORAGE_LABELS[store.storageKind] || store.storageKind)}</div>
      </div>
    `;
    renderCatList();
    renderRewardGrid();
    document.getElementById('addCatBtn').onclick = () => {
      s.categories.push({id:'cat'+uid(), name:'Nueva categoría', color:'#6d4aff'});
      renderCatList();
    };
    document.getElementById('saveSettingsBtn').onclick = async () => {
      s.xpBase = parseFloat(document.getElementById('stXpBase').value) || s.xpBase;
      s.xpGrowth = parseFloat(document.getElementById('stXpGrowth').value) || s.xpGrowth;
      s.punishmentCoins = parseFloat(document.getElementById('stPunish').value) || 0;
      document.querySelectorAll('.cat-row').forEach(row=>{
        const id = row.dataset.id;
        const cat = s.categories.find(c=>c.id===id);
        if (!cat) return;
        cat.name = row.querySelector('input[type=text]').value.trim() || cat.name;
        cat.color = row.querySelector('input[type=color]').value;
      });
      Object.keys(s.rewardTable).forEach(diff=>{
        const xpEl = document.getElementById('rw_'+diff+'_xp');
        const coinEl = document.getElementById('rw_'+diff+'_coins');
        if (xpEl) s.rewardTable[diff].xp = parseFloat(xpEl.value) || s.rewardTable[diff].xp;
        if (coinEl) s.rewardTable[diff].coins = parseFloat(coinEl.value) || s.rewardTable[diff].coins;
      });
      const ok = await store.saveSettings();
      if (ok) ui.showToast('Ajustes guardados');
      ui.renderAll();
    };
    document.getElementById('exportBtn').onclick = exportBackup;
    document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();
    document.getElementById('importFile').onchange = (e) => importBackup(e.target);
  }

  function renderCatList(){
    const box = document.getElementById('catList');
    if (!box) return;
    box.innerHTML = state.settings.categories.map(c => `
      <div class="cat-row" data-id="${escapeHtml(c.id)}">
        <input type="color" value="${escapeHtml(c.color)}" aria-label="Color">
        <input type="text" value="${escapeHtml(c.name)}" aria-label="Nombre">
        <button class="icon-btn" data-action="delete-category" data-id="${escapeHtml(c.id)}" aria-label="Eliminar">${ui.svgTrash()}</button>
      </div>
    `).join('');
  }

  function renderRewardGrid(){
    const box = document.getElementById('rewardGrid');
    if (!box) return;
    const s = state.settings;
    box.innerHTML = Object.keys(s.rewardTable).map(diff => `
      <div class="field">
        <label>${DIFF_LABELS[diff] || escapeHtml(diff)} — XP / Monedas</label>
        <div class="row">
          <input type="number" id="rw_${diff}_xp" value="${s.rewardTable[diff].xp}" aria-label="XP">
          <input type="number" id="rw_${diff}_coins" value="${s.rewardTable[diff].coins}" aria-label="Monedas">
        </div>
      </div>
    `).join('');
  }

  async function exportBackup(){
    try{
      const data = await store.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lifequest-' + todayStr() + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      ui.showToast('Copia exportada');
    }catch(e){
      console.error(e);
      ui.showToast('No se pudo exportar la copia');
    }
  }

  async function importBackup(input){
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (!confirm('Esto reemplazará todos tus datos actuales por los de la copia. ¿Continuar?')) return;
    try{
      const data = JSON.parse(await file.text());
      await store.importData(data);
      ui.applyTheme(state.settings.theme);
      ui.renderAll();
      render();
      ui.showToast('Copia importada');
    }catch(e){
      console.error(e);
      ui.showToast(e && e.message ? e.message : 'No se pudo importar la copia');
    }
  }

  ui.actions['delete-category'] = (id) => {
    state.settings.categories = state.settings.categories.filter(c=>c.id!==id);
    renderCatList();
  };

  ui.views.ajustes = { render };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
