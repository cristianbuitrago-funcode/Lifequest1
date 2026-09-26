/*
 * Lógica de la Tienda (sin DOM): catálogo efectivo, compras con las monedas
 * del juego, inventario, equipar/usar y administración de productos.
 */
(function (LQ) {
  "use strict";

  const { CATEGORIES, EFFECT_KINDS, PRODUCTS } = LQ.ShopCatalog;
  const { uid } = LQ.utils;
  const state = LQ.state;
  const store = LQ.store;

  const STATUSES = ['disponible', 'no_disponible', 'bloqueado'];
  const PURCHASES = ['unica', 'reutilizable'];

  function level(){ return LQ.Rules.levelInfo(state.character.totalXp || 0, state.settings).level; }

  // -------------------------------------------------------------------------
  // Catálogo efectivo = catálogo base + cambios guardados (shopProducts)
  // -------------------------------------------------------------------------
  function allProducts(opts){
    const overrides = new Map(state.shopProducts.map(p => [p.id, p]));
    const out = [];
    PRODUCTS.forEach(base => {
      const o = overrides.get(base.id);
      if (o && o.deleted){ if (opts && opts.includeDeleted) out.push(Object.assign({}, base, o, { base: true })); return; }
      out.push(Object.assign({}, base, o ? stripMeta(o) : {}, { base: true, customized: !!o }));
    });
    state.shopProducts.forEach(p => {
      if (PRODUCTS.some(b => b.id === p.id)) return;
      if (p.deleted && !(opts && opts.includeDeleted)) return;
      out.push(Object.assign({}, stripMeta(p), { base: false, custom: true }));
    });
    return out;
  }
  function stripMeta(p){ const c = Object.assign({}, p); delete c.updatedAt; return c; }
  function getProduct(id){ return allProducts().find(p => p.id === id) || null; }
  function inventoryItem(id){ return state.inventory.find(i => i.id === id) || null; }

  function effectInfo(p){ return EFFECT_KINDS[(p.effect || {}).kind] || EFFECT_KINDS.collectible; }

  /** Estado de un producto para la persona usuaria actual. */
  function view(p){
    const lvl = level();
    const owned = inventoryItem(p.id);
    const qty = owned ? (owned.qty || 0) : 0;
    const info = effectInfo(p);
    let status = p.status;
    if (status === 'bloqueado' && p.unlockLevel && lvl >= p.unlockLevel) status = 'disponible';
    const coins = state.character.coins || 0;
    return {
      product: p, status, qty,
      owned: qty > 0,
      unique: p.purchase !== 'reutilizable',
      equipable: !!info.slot,
      consumable: !!info.consumable,
      equipped: isEquipped(p),
      affordable: coins >= p.price,
      missing: Math.max(0, p.price - coins),
      lockReason: status === 'bloqueado' ? (p.unlockLevel ? 'Se desbloquea en el nivel ' + p.unlockLevel : 'Bloqueado') : null
    };
  }

  function isEquipped(p){
    const info = effectInfo(p);
    if (!info.slot) return false;
    const eq = state.profile.equipped;
    return info.multi ? (eq.badges || []).indexOf(p.id) !== -1 : eq[info.slot] === p.id;
  }

  // -------------------------------------------------------------------------
  // Comprar, equipar, usar
  // -------------------------------------------------------------------------
  async function purchase(id){
    const p = getProduct(id);
    if (!p) return { ok:false, reason:'missing', message:'Ese producto ya no está en la tienda.' };
    const v = view(p);
    if (v.status === 'no_disponible') return { ok:false, reason:'unavailable', message:'Este producto no está disponible ahora.' };
    if (v.status === 'bloqueado') return { ok:false, reason:'locked', message: v.lockReason + '.' };
    if (v.unique && v.owned) return { ok:false, reason:'owned', message:'Ya tienes este artículo.' };
    if (!v.affordable){
      return { ok:false, reason:'coins', missing: v.missing,
               message:'No tienes suficientes monedas. Te faltan ' + v.missing + ' 🪙.' };
    }

    state.character.coins = (state.character.coins || 0) - p.price;
    const now = Date.now();
    const item = inventoryItem(p.id);
    if (item) await store.updateRecord('inventory', item.id, { qty: (item.qty || 0) + 1, lastPurchasedAt: now });
    else await store.addRecord('inventory', { id: p.id, productId: p.id, qty: 1, firstPurchasedAt: now, lastPurchasedAt: now });
    const stats = state.profile.stats;
    stats.purchases = (stats.purchases || 0) + 1;
    stats.coinsSpent = (stats.coinsSpent || 0) + p.price;
    await store.saveCharacter();
    await store.saveProfile();
    return { ok:true, product: p, view: view(p) };
  }

  /** Equipa (o desequipa si ya estaba) un objeto del inventario. */
  async function toggleEquip(id){
    const p = getProduct(id) || productFromInventory(id);
    if (!p || !inventoryItem(id)) return { ok:false, message:'No tienes este artículo.' };
    const info = effectInfo(p);
    if (!info.slot) return { ok:false, message:'Este artículo no se equipa.' };
    const eq = state.profile.equipped;
    let equipped;
    if (info.multi){
      const list = (eq.badges || []).slice();
      const i = list.indexOf(id);
      if (i !== -1){ list.splice(i, 1); equipped = false; }
      else {
        if (list.length >= info.multi) return { ok:false, message:'Puedes mostrar hasta ' + info.multi + ' insignias. Quita una primero.' };
        list.push(id); equipped = true;
      }
      eq.badges = list;
    } else {
      equipped = eq[info.slot] !== id;
      eq[info.slot] = equipped ? id : null;
    }
    await store.saveProfile();
    return { ok:true, equipped, product: p };
  }

  /** Usa un consumible (poción, escudo). */
  async function use(id){
    const p = getProduct(id) || productFromInventory(id);
    const item = inventoryItem(id);
    if (!p || !item || !(item.qty > 0)) return { ok:false, message:'No te quedan unidades.' };
    const kind = (p.effect || {}).kind;
    const value = Math.max(1, Math.round(Number((p.effect || {}).value) || 1));
    if (kind === 'xpBoost') state.profile.boosts.xpDouble = (state.profile.boosts.xpDouble || 0) + value;
    else if (kind === 'shield') state.profile.shields = (state.profile.shields || 0) + value;
    else return { ok:false, message:'Este artículo no se usa.' };
    await store.updateRecord('inventory', id, { qty: item.qty - 1 });
    await store.saveProfile();
    return { ok:true, product: p, kind, value };
  }

  // Si un producto se retiró de la tienda, el inventario conserva lo comprado.
  function productFromInventory(id){
    return allProducts({ includeDeleted: true }).find(p => p.id === id) || null;
  }

  /** Productos equipados, resueltos (para aplicar sus efectos). */
  function equippedProducts(){
    const eq = state.profile.equipped;
    const all = allProducts({ includeDeleted: true });
    const find = (id) => (id && inventoryItem(id)) ? all.find(p => p.id === id) || null : null;
    const out = {};
    ['theme', 'background', 'avatar', 'frame', 'pet', 'effect', 'aura', 'sound'].forEach(slot => { out[slot] = find(eq[slot]); });
    out.badges = (eq.badges || []).map(find).filter(Boolean);
    return out;
  }

  /** Productos que se desbloquean exactamente al llegar a `lvl`. */
  function unlockedAt(lvl){
    return allProducts().filter(p => p.status === 'bloqueado' && p.unlockLevel === lvl);
  }

  // -------------------------------------------------------------------------
  // Administración (Tienda → Administrar)
  // -------------------------------------------------------------------------
  function validateProduct(p){
    if (!String(p.name || '').trim()) return 'El producto necesita un nombre.';
    if (!(Number(p.price) >= 0) || Math.round(p.price) !== Number(p.price)) return 'El precio debe ser un número entero de monedas (0 o más).';
    if (!CATEGORIES.some(c => c.id === p.category)) return 'Elige una categoría.';
    if (STATUSES.indexOf(p.status) === -1) return 'Estado no válido.';
    if (PURCHASES.indexOf(p.purchase) === -1) return 'Tipo de compra no válido.';
    if (!EFFECT_KINDS[(p.effect || {}).kind]) return 'Elige qué hace el producto.';
    const info = EFFECT_KINDS[p.effect.kind];
    if (info.consumable && p.purchase !== 'reutilizable') return 'Las pociones y escudos deben ser reutilizables.';
    if (!info.consumable && p.purchase === 'reutilizable' && info.slot) return 'Los objetos equipables son de compra única.';
    if (p.status === 'bloqueado' && p.unlockLevel != null && !(p.unlockLevel >= 1)) return 'El nivel de desbloqueo debe ser 1 o más.';
    return null;
  }

  async function saveProduct(input){
    const product = {
      id: input.id || ('custom-' + uid()),
      name: String(input.name || '').trim(),
      description: String(input.description || '').trim(),
      icon: String(input.icon || '').trim() || '🎁',
      price: Number(input.price),
      category: input.category,
      status: input.status,
      purchase: input.purchase,
      effect: input.effect,
      deleted: false
    };
    if (product.status === 'bloqueado' && input.unlockLevel) product.unlockLevel = Math.round(Number(input.unlockLevel));
    else product.unlockLevel = null;
    const error = validateProduct(product);
    if (error) return { ok:false, error };
    if (state.shopProducts.some(p => p.id === product.id)) await store.updateRecord('shopProducts', product.id, product);
    else await store.addRecord('shopProducts', product);
    return { ok:true, product };
  }

  /** Retira un producto de la tienda (lo comprado se queda en el inventario). */
  async function deleteProduct(id){
    const isBase = PRODUCTS.some(p => p.id === id);
    if (isBase){
      if (state.shopProducts.some(p => p.id === id)) await store.updateRecord('shopProducts', id, { deleted: true });
      else await store.addRecord('shopProducts', { id, deleted: true });
    } else {
      await store.deleteRecord('shopProducts', id);
    }
  }

  /** Deshace los cambios hechos a un producto del catálogo base. */
  async function restoreProduct(id){
    if (PRODUCTS.some(p => p.id === id) && state.shopProducts.some(p => p.id === id)) await store.deleteRecord('shopProducts', id);
  }

  LQ.Shop = {
    CATEGORIES, EFFECT_KINDS, STATUSES, PURCHASES,
    allProducts, getProduct, view, inventoryItem, purchase, toggleEquip, use,
    equippedProducts, unlockedAt, productFromInventory, validateProduct, saveProduct, deleteProduct, restoreProduct
  };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
