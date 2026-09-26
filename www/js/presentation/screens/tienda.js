/*
 * Pestaña Tienda: catálogo (con las monedas del juego), inventario y
 * administración de productos.
 */
(function (LQ) {
  "use strict";

  const { state, ui } = LQ;
  const { escapeHtml } = LQ.utils;
  const Shop = LQ.Shop;

  let section = 'tienda';
  let category = 'todos';
  let editingProductId = null;   // null = cerrado, '' = nuevo, id = editando

  function render(){
    const el = document.getElementById('view-tienda');
    const lvl = LQ.Rules.levelInfo(state.character.totalXp || 0, state.settings).level;
    const owned = state.inventory.filter(i => i.qty > 0).length;
    el.innerHTML = `
      <div class="shop-hero">
        <div>
          <div class="shop-hero-label">Tus monedas</div>
          <div class="shop-hero-coins"><span aria-hidden="true">💰</span> <b class="num">${ui.coins(state.character.coins || 0)}</b> monedas</div>
          <div class="shop-hero-sub">Nivel ${lvl} · Gana monedas con misiones, rachas de hábitos y pagos al día.</div>
        </div>
        <div class="shop-hero-icon" aria-hidden="true">🛒</div>
      </div>
      <div class="segmented" role="tablist" aria-label="Secciones de la tienda">
        ${seg('tienda', '🛍️', 'Tienda')}
        ${seg('inventario', '🎒', 'Inventario', owned || '')}
        ${seg('admin', '🛠️', 'Administrar')}
      </div>
      <div id="shopSection"></div>`;
    el.querySelectorAll('[data-shop-section]').forEach(b => { b.onclick = () => { section = b.dataset.shopSection; render(); }; });
    const box = document.getElementById('shopSection');
    if (section === 'inventario') renderInventory(box);
    else if (section === 'admin') renderAdmin(box);
    else renderCatalog(box);
  }

  function seg(id, emoji, label, badge){
    return `<button class="seg-btn ${section === id ? 'active' : ''}" role="tab" aria-selected="${section === id}" data-shop-section="${id}">
      <span aria-hidden="true">${emoji}</span> ${label}${badge ? ` <span class="seg-badge neutral">${badge}</span>` : ''}</button>`;
  }

  // =========================================================================
  // Catálogo
  // =========================================================================
  function renderCatalog(el){
    const products = Shop.allProducts();
    const cats = Shop.CATEGORIES.filter(c => products.some(p => p.category === c.id));
    const list = products.filter(p => category === 'todos' || p.category === category);
    el.innerHTML = `
      <div class="chips" role="tablist" aria-label="Categorías">
        <button class="chip ${category === 'todos' ? 'active' : ''}" data-cat="todos">✨ Todo</button>
        ${cats.map(c => `<button class="chip ${category === c.id ? 'active' : ''}" data-cat="${c.id}">${c.emoji} ${c.label}</button>`).join('')}
      </div>
      <div class="product-grid">${list.map(productCard).join('') || '<div class="empty">No hay productos en esta categoría.</div>'}</div>`;
    el.querySelectorAll('[data-cat]').forEach(b => { b.onclick = () => { category = b.dataset.cat; render(); }; });
  }

  function productCard(p){
    const v = Shop.view(p);
    let action;
    if (v.status === 'no_disponible') action = `<button class="btn small" disabled>No disponible</button>`;
    else if (v.status === 'bloqueado') action = `<button class="btn small ghost" disabled>🔒 ${p.unlockLevel ? 'Nivel ' + p.unlockLevel : 'Bloqueado'}</button>`;
    else if (v.unique && v.owned){
      action = v.equipable
        ? `<button class="btn small ${v.equipped ? 'ghost' : ''}" data-action="shop-equip" data-id="${escapeHtml(p.id)}">${v.equipped ? '✓ Equipado' : 'Equipar'}</button>`
        : `<button class="btn small ghost" disabled>✓ Comprado</button>`;
    } else {
      action = `<button class="btn small ${v.affordable ? '' : 'ghost'}" data-action="shop-buy" data-id="${escapeHtml(p.id)}">${v.affordable ? 'Comprar' : 'Te faltan ' + ui.coins(v.missing)}</button>`;
    }
    const soundPreview = p.effect && p.effect.kind === 'sound'
      ? `<button class="icon-btn preview-btn" data-action="shop-preview-sound" data-id="${escapeHtml(p.effect.value)}" aria-label="Escuchar">▶</button>` : '';
    return `
      <div class="product-card ${v.status !== 'disponible' ? 'is-locked' : ''} ${v.equipped ? 'is-equipped' : ''}">
        ${v.qty > 0 && !v.unique ? `<span class="qty-badge">×${v.qty}</span>` : ''}
        ${v.equipped ? '<span class="equipped-badge">Equipado</span>' : ''}
        <div class="product-icon">${ui.iconHtml(p.icon)}${soundPreview}</div>
        <div class="product-name">${escapeHtml(p.name)}</div>
        <div class="product-desc">${escapeHtml(p.description || '')}</div>
        <div class="product-foot">
          <span class="price ${v.affordable || v.owned && v.unique ? '' : 'short'}">🪙 ${ui.coins(p.price)}</span>
          ${action}
        </div>
        ${v.status === 'bloqueado' ? `<div class="lock-note">${escapeHtml(v.lockReason)}</div>` : ''}
      </div>`;
  }

  // =========================================================================
  // Inventario
  // =========================================================================
  function renderInventory(el){
    const items = state.inventory.filter(i => i.qty > 0)
      .map(i => ({ item: i, product: Shop.productFromInventory(i.id) }))
      .filter(x => x.product);
    const p = state.profile;
    el.innerHTML = `
      <div class="panel">
        <h2>Efectos activos</h2>
        <div class="active-effects">
          <div class="effect-tile ${p.boosts.xpDouble > 0 ? 'on' : ''}"><span>🧪</span><b class="num">${p.boosts.xpDouble || 0}</b><small>misiones con XP doble</small></div>
          <div class="effect-tile ${p.shields > 0 ? 'on' : ''}"><span>🛡️</span><b class="num">${p.shields || 0}</b><small>escudos de racha</small></div>
          <div class="effect-tile"><span>🛍️</span><b class="num">${p.stats.purchases || 0}</b><small>compras · ${ui.coins(p.stats.coinsSpent || 0)} 🪙</small></div>
        </div>
      </div>
      <div class="panel">
        <h2>Mis objetos</h2>
        <div class="sub">Equipa tus objetos para personalizar tu perfil y la app. Los consumibles se activan al usarlos.</div>
        ${items.length ? `<div class="inv-list">${items.map(invRow).join('')}</div>` :
          `<div class="empty">Tu inventario está vacío. <button class="btn small" data-action="shop-go-catalog">Ir a la tienda</button></div>`}
      </div>`;
  }

  function invRow({ item, product }){
    const v = Shop.view(product);
    const kindLabel = (Shop.EFFECT_KINDS[(product.effect || {}).kind] || {}).label || 'Objeto';
    let action = '';
    if (v.consumable) action = `<button class="btn small" data-action="shop-use" data-id="${escapeHtml(product.id)}">Usar (${item.qty})</button>`;
    else if (v.equipable) action = `<button class="btn small ${v.equipped ? 'ghost' : ''}" data-action="shop-equip" data-id="${escapeHtml(product.id)}">${v.equipped ? 'Quitar' : 'Equipar'}</button>`;
    else action = `<span class="tag">Coleccionable</span>`;
    return `<div class="inv-row ${v.equipped ? 'is-equipped' : ''}">
      <div class="inv-icon">${ui.iconHtml(product.icon)}</div>
      <div class="quest-main"><div class="quest-title">${escapeHtml(product.name)}</div>
        <div class="quest-meta"><span class="tag">${escapeHtml(kindLabel)}</span>${v.equipped ? '<span class="tag tag-ok">Equipado</span>' : ''}${product.deleted ? '<span class="tag">Retirado de la tienda</span>' : ''}</div></div>
      ${action}
    </div>`;
  }

  // =========================================================================
  // Administración de productos
  // =========================================================================
  function renderAdmin(el){
    const products = Shop.allProducts({ includeDeleted: true });
    el.innerHTML = `
      <div class="panel">
        <div class="section-head">
          <h2>Administrar tienda</h2>
          <button class="btn small" id="newProductBtn">+ Nuevo producto</button>
        </div>
        <div class="sub">Crea, edita o retira productos. Los cambios se guardan con tus datos y se sincronizan con tu cuenta.</div>
        <div id="productForm"></div>
        <div class="admin-list">
          ${products.map(p => `
            <div class="admin-row ${p.deleted ? 'is-deleted' : ''}">
              <div class="inv-icon">${ui.iconHtml(p.icon || '🎁')}</div>
              <div class="quest-main">
                <div class="quest-title">${escapeHtml(p.name || p.id)}</div>
                <div class="quest-meta">
                  <span class="tag">🪙 ${ui.coins(p.price || 0)}</span>
                  <span class="tag">${escapeHtml(statusLabel(p))}</span>
                  <span class="tag">${p.purchase === 'reutilizable' ? 'Reutilizable' : 'Compra única'}</span>
                  ${p.custom ? '<span class="tag">Personalizado</span>' : p.customized ? '<span class="tag">Modificado</span>' : ''}
                </div>
              </div>
              <div class="bill-actions">
                ${p.deleted
                  ? (p.base ? `<button class="btn small ghost" data-action="shop-admin-restore" data-id="${escapeHtml(p.id)}">Restaurar</button>` : '')
                  : `<button class="icon-btn" data-action="shop-admin-edit" data-id="${escapeHtml(p.id)}" aria-label="Editar"><svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
                     ${p.customized ? `<button class="icon-btn" data-action="shop-admin-restore" data-id="${escapeHtml(p.id)}" aria-label="Restaurar original" title="Restaurar original">↺</button>` : ''}
                     <button class="icon-btn" data-action="shop-admin-delete" data-id="${escapeHtml(p.id)}" aria-label="Retirar">${ui.svgTrash()}</button>`}
              </div>
            </div>`).join('')}
        </div>
      </div>`;
    document.getElementById('newProductBtn').onclick = () => { editingProductId = editingProductId === '' ? null : ''; render(); };
    renderProductForm();
  }

  function statusLabel(p){
    if (p.deleted) return 'Retirado';
    if (p.status === 'bloqueado') return p.unlockLevel ? 'Bloqueado hasta nivel ' + p.unlockLevel : 'Bloqueado';
    return p.status === 'no_disponible' ? 'No disponible' : 'Disponible';
  }

  // Tipos de efecto que se pueden elegir al crear/editar, con su campo de valor.
  const EFFECT_FORM = {
    badge:       { input: 'emoji',  hint: 'Emoji de la insignia' },
    avatar:      { input: 'emoji',  hint: 'Emoji del avatar' },
    pet:         { input: 'emoji',  hint: 'Emoji de la mascota' },
    theme:       { input: 'colors', hint: 'Colores de acento' },
    background:  { input: 'color',  hint: 'Color del resplandor de fondo' },
    frame:       { input: 'select', options: { oro: 'Dorado', neon: 'Neón', runas: 'Rúnico' } },
    aura:        { input: 'select', options: { fuego: 'Fuego', hielo: 'Hielo', arcana: 'Arcana' } },
    celebration: { input: 'select', options: { estrellas: 'Lluvia de estrellas', monedas: 'Lluvia de monedas', fuegos: 'Fuegos artificiales' } },
    sound:       { input: 'select', options: { campanas: 'Campanas', arcade: 'Arcade 8 bits', fanfarria: 'Fanfarria' } },
    xpBoost:     { input: 'number', hint: 'Número de misiones con XP doble' },
    shield:      { input: 'number', hint: 'Escudos que da cada unidad' },
    collectible: { input: 'none' }
  };

  function renderProductForm(){
    const box = document.getElementById('productForm');
    if (editingProductId === null){ box.innerHTML = ''; return; }
    const p = editingProductId ? Shop.allProducts().find(x => x.id === editingProductId) : null;
    const kind = p ? (p.effect || {}).kind || 'collectible' : 'badge';
    box.innerHTML = `
      <div class="subpanel">
        <h3>${p ? 'Editar "' + escapeHtml(p.name) + '"' : 'Nuevo producto'}</h3>
        <div class="grid2">
          <div class="field"><label for="pName">Nombre</label><input type="text" id="pName" value="${p ? escapeHtml(p.name) : ''}" placeholder="Ej: Corona de campeón"></div>
          <div class="field"><label for="pIcon">Icono (emoji o ruta de imagen)</label><input type="text" id="pIcon" value="${p ? escapeHtml(p.icon) : '🎁'}"></div>
          <div class="field"><label for="pPrice">Precio (monedas)</label><input type="number" id="pPrice" min="0" step="1" value="${p ? p.price : 50}"></div>
          <div class="field"><label for="pCategory">Categoría</label><select id="pCategory">${Shop.CATEGORIES.map(c => `<option value="${c.id}" ${p && p.category === c.id ? 'selected' : ''}>${c.emoji} ${c.label}</option>`).join('')}</select></div>
          <div class="field"><label for="pStatus">Estado</label><select id="pStatus">
            <option value="disponible">Disponible</option><option value="no_disponible">No disponible</option><option value="bloqueado">Bloqueado</option></select></div>
          <div class="field" id="pLevelField"><label for="pLevel">Se desbloquea en el nivel (opcional)</label><input type="number" id="pLevel" min="1" step="1" value="${p && p.unlockLevel ? p.unlockLevel : ''}"></div>
          <div class="field"><label for="pPurchase">Tipo de compra</label><select id="pPurchase">
            <option value="unica">Compra única (se equipa)</option><option value="reutilizable">Reutilizable (se acumula y se usa)</option></select></div>
          <div class="field"><label for="pKind">Qué hace</label><select id="pKind">
            ${Object.keys(EFFECT_FORM).map(k => `<option value="${k}" ${k === kind ? 'selected' : ''}>${escapeHtml(Shop.EFFECT_KINDS[k].label)}</option>`).join('')}</select></div>
        </div>
        <div class="field" id="pValueField"></div>
        <div class="field"><label for="pDesc">Descripción</label><input type="text" id="pDesc" value="${p ? escapeHtml(p.description || '') : ''}" placeholder="Qué es y por qué vale la pena"></div>
        <div class="row">
          <button class="btn" id="pSave">${p ? 'Guardar cambios' : 'Crear producto'}</button>
          <button class="btn ghost" id="pCancel">Cancelar</button>
        </div>
      </div>`;
    document.getElementById('pStatus').value = p ? p.status : 'disponible';
    document.getElementById('pPurchase').value = p ? p.purchase : 'unica';
    const syncLevel = () => { document.getElementById('pLevelField').hidden = document.getElementById('pStatus').value !== 'bloqueado'; };
    document.getElementById('pStatus').onchange = syncLevel; syncLevel();
    const kindEl = document.getElementById('pKind');
    const renderValue = () => {
      const k = kindEl.value, f = EFFECT_FORM[k];
      const cur = p && (p.effect || {}).kind === k ? p.effect.value : null;
      const field = document.getElementById('pValueField');
      if (Shop.EFFECT_KINDS[k].consumable) document.getElementById('pPurchase').value = 'reutilizable';
      else if (Shop.EFFECT_KINDS[k].slot) document.getElementById('pPurchase').value = 'unica';
      if (f.input === 'none'){ field.innerHTML = '<div class="hint">Se guarda en el inventario como objeto de colección.</div>'; return; }
      if (f.input === 'emoji') field.innerHTML = `<label for="pValue">${f.hint}</label><input type="text" id="pValue" value="${escapeHtml(cur || document.getElementById('pIcon').value || '⭐')}">`;
      else if (f.input === 'number') field.innerHTML = `<label for="pValue">${f.hint}</label><input type="number" id="pValue" min="1" step="1" value="${cur || (k === 'xpBoost' ? 3 : 1)}">`;
      else if (f.input === 'select') field.innerHTML = `<label for="pValue">Variante</label><select id="pValue">${Object.entries(f.options).map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
      else if (f.input === 'colors'){
        const [a, b] = cur && cur.dark ? cur.dark : ['#9b83ff', '#3fd6e8'];
        field.innerHTML = `<label>${f.hint}</label><div class="row"><input type="color" id="pColorA" value="${a}" aria-label="Color principal"><input type="color" id="pColorB" value="${b}" aria-label="Color secundario"></div>`;
      } else if (f.input === 'color'){
        const m = cur && /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(cur);
        const hex = m ? '#' + [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('') : '#9b83ff';
        field.innerHTML = `<label for="pValue">${f.hint}</label><input type="color" id="pValue" value="${hex}">`;
      }
    };
    kindEl.onchange = renderValue; renderValue();
    document.getElementById('pCancel').onclick = () => { editingProductId = null; render(); };
    document.getElementById('pSave').onclick = async () => {
      const k = kindEl.value, f = EFFECT_FORM[k];
      let value = null;
      if (f.input === 'emoji' || f.input === 'select') value = document.getElementById('pValue').value.trim();
      else if (f.input === 'number') value = Math.max(1, parseInt(document.getElementById('pValue').value, 10) || 1);
      else if (f.input === 'colors'){
        const a = document.getElementById('pColorA').value, b = document.getElementById('pColorB').value;
        value = { light: [a, b], dark: [a, b] };
      } else if (f.input === 'color'){
        const hex = document.getElementById('pValue').value;
        const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
        value = `radial-gradient(1000px 600px at 20% -10%, rgba(${r},${g},${b},.28), transparent 60%), radial-gradient(800px 500px at 100% 100%, rgba(${r},${g},${b},.14), transparent 60%)`;
      }
      const r = await Shop.saveProduct({
        id: editingProductId || undefined,
        name: document.getElementById('pName').value,
        description: document.getElementById('pDesc').value,
        icon: document.getElementById('pIcon').value,
        price: parseInt(document.getElementById('pPrice').value, 10),
        category: document.getElementById('pCategory').value,
        status: document.getElementById('pStatus').value,
        unlockLevel: parseInt(document.getElementById('pLevel').value, 10) || null,
        purchase: document.getElementById('pPurchase').value,
        effect: { kind: k, value }
      });
      if (!r.ok){ ui.showToast(r.error); return; }
      ui.showToast(editingProductId ? 'Producto actualizado' : 'Producto creado');
      editingProductId = null;
      render();
    };
  }

  // =========================================================================
  // Acciones
  // =========================================================================
  ui.actions['shop-buy'] = async (id, el) => {
    const r = await Shop.purchase(id);
    if (!r.ok){
      if (r.reason === 'coins'){
        ui.openModal('No tienes suficientes monedas.', (body) => {
          const p = Shop.getProduct(id);
          body.innerHTML = `
            <div class="short-coins">
              <div class="short-icon">${ui.iconHtml(p.icon)}</div>
              <p><b>${escapeHtml(p.name)}</b> cuesta <b>🪙 ${ui.coins(p.price)}</b> y tienes <b>🪙 ${ui.coins(state.character.coins || 0)}</b>.</p>
              <p class="short-missing">Te faltan <b class="num">${ui.coins(r.missing)}</b> monedas.</p>
              <div class="progress"><div class="progress-fill" style="width:${Math.round((state.character.coins || 0) / p.price * 100)}%"></div></div>
              <p class="hint">Completa misiones, mantén tus hábitos o registra tus pagos a tiempo para ganar más.</p>
            </div>`;
        });
      } else {
        ui.showToast(r.message);
      }
      return;
    }
    ui.renderCharacterCard();
    render();
    const p = r.product;
    const actions = [];
    if (r.view.equipable) actions.push({ label: 'Equipar ahora', primary: true, onClick: () => ui.actions['shop-equip'](p.id) });
    if (r.view.consumable) actions.push({ label: 'Usar ahora', primary: true, onClick: () => ui.actions['shop-use'](p.id) });
    ui.celebrate({
      icon: p.icon,
      title: '¡Compra exitosa!',
      message: p.name + ' ya está en tu inventario.',
      rewards: ['-' + ui.coins(p.price) + ' 🪙', 'Te quedan ' + ui.coins(state.character.coins || 0) + ' 🪙'],
      actions
    });
  };

  ui.actions['shop-equip'] = async (id) => {
    const r = await Shop.toggleEquip(id);
    if (!r.ok){ ui.showToast(r.message); return; }
    ui.sound.play('short');
    ui.showToast((r.equipped ? 'Equipado: ' : 'Quitado: ') + r.product.name);
    ui.renderAll();
    if (document.getElementById('view-tienda') && !document.getElementById('view-tienda').hidden) render();
  };

  ui.actions['shop-use'] = async (id) => {
    const r = await Shop.use(id);
    if (!r.ok){ ui.showToast(r.message); return; }
    ui.celebrate({
      icon: r.product.icon,
      title: r.kind === 'xpBoost' ? '¡Poción activada!' : '¡Escudo activado!',
      message: r.kind === 'xpBoost'
        ? 'Tus próximas ' + state.profile.boosts.xpDouble + ' misiones darán el doble de XP.'
        : 'Tienes ' + state.profile.shields + ' escudo(s): si fallas un día, no perderás monedas ni tu racha.'
    });
    ui.renderAll();
    if (!document.getElementById('view-tienda').hidden) render();
  };

  ui.actions['shop-preview-sound'] = (pack) => ui.sound.preview(pack);
  ui.actions['shop-go-catalog'] = () => { section = 'tienda'; render(); };
  ui.actions['shop-admin-edit'] = (id) => { editingProductId = id; render(); document.getElementById('productForm').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  ui.actions['shop-admin-delete'] = async (id) => {
    const p = Shop.getProduct(id);
    if (!p || !confirm('¿Retirar "' + p.name + '" de la tienda? Quien ya lo compró lo conserva.')) return;
    await Shop.deleteProduct(id);
    ui.showToast('Producto retirado');
    render();
  };
  ui.actions['shop-admin-restore'] = async (id) => {
    await Shop.restoreProduct(id);
    ui.showToast('Producto restaurado');
    render();
  };

  ui.views.tienda = { render };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
