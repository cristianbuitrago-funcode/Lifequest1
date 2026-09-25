/*
 * Capa de persistencia de dominio.
 *
 * Mantiene la misma API que la versión original (init, save*, add*, update*,
 * delete*), pero ahora persiste en un adaptador local (IndexedDB por defecto).
 *
 * Patrón: la UI/juego modifica `state` de forma optimista y el store escribe
 * en segundo plano; si una escritura falla se notifica por `onError`.
 *
 * Preparado para sincronización futura:
 *   - Cada registro lleva un id global único y `updatedAt` (ms).
 *   - Los borrados dejan una lápida (tombstone) con `deletedAt`.
 *   - `changesSince(ts)` y `applyRemote(changes)` implementan
 *     "last-write-wins", que es lo que necesita un proveedor en la nube.
 *   - Los datos se aíslan por perfil (`profile`), pensado para cuentas.
 */
(function (LQ) {
  "use strict";

  const { DEFAULT_CHARACTER, SAMPLE_QUESTS, mergeSettings } = LQ.config;
  const { todayStr, uid, clone } = LQ.utils;

  const SCHEMA_VERSION = 1;
  const DOC_KEYS = ['character', 'settings'];

  function dbName(profile){ return 'lifequest:' + (profile || 'local'); }

  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const byTsDesc = (a, b) => (b.ts || 0) - (a.ts || 0);
  const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : byId(b, a));
  const SORTS = { quests: byId, habits: byId, completions: byTsDesc, finance: byDateDesc };

  const store = {
    adapter: null,
    state: null,
    profile: 'local',
    meta: null,
    onError: (e) => console.error('LifeQuest store', e),
    _listeners: new Set(),

    // -----------------------------------------------------------------------
    // Ciclo de vida
    // -----------------------------------------------------------------------
    async init(opts){
      opts = opts || {};
      this.state = opts.state || LQ.state;
      this.profile = opts.profile || 'local';
      if (opts.onError) this.onError = opts.onError;
      this.adapter = opts.adapter || await LQ.storage.openLocalAdapter(dbName(this.profile));

      let meta = await this.adapter.getDoc('meta');
      if (!meta){
        meta = { schemaVersion: SCHEMA_VERSION, deviceId: uid(), createdAt: Date.now(), seeded: false, lastSyncAt: null };
        await this.adapter.putDoc('meta', meta);
      }
      this.meta = meta;

      await this.load();

      // Primer arranque: guarda valores por defecto y misiones de ejemplo una
      // sola vez (antes se re-sembraban cada vez que la lista quedaba vacía).
      if (!meta.seeded){
        await this.saveCharacter();
        await this.saveSettings();
        if (!this.state.quests.length) await this.seedSampleQuests();
        await this.setMeta({ seeded: true });
      }

      // Pide al navegador que no borre estos datos bajo presión de espacio.
      try{
        if (globalThis.navigator && navigator.storage && navigator.storage.persist) await navigator.storage.persist();
      }catch(e){ /* opcional */ }

      return this;
    },

    /** (Re)carga todo el estado desde el adaptador. */
    async load(){
      const a = this.adapter, s = this.state;
      const [character, settings, quests, completions, habits, finance] = await Promise.all([
        a.getDoc('character'), a.getDoc('settings'),
        a.getAll('quests'), a.getAll('completions'), a.getAll('habits'), a.getAll('finance')
      ]);
      s.character = Object.assign({}, DEFAULT_CHARACTER, character || {});
      s.settings = mergeSettings(settings);
      s.quests = quests.sort(SORTS.quests);
      s.completions = completions.sort(SORTS.completions);
      s.habits = habits.sort(SORTS.habits);
      s.finance = finance.sort(SORTS.finance);
    },

    get storageKind(){ return this.adapter ? this.adapter.kind : 'none'; },
    get isPersistent(){ return !!(this.adapter && this.adapter.persistent); },

    async setMeta(patch){
      this.meta = Object.assign({}, this.meta, patch);
      await this.adapter.putDoc('meta', this.meta);
    },

    // -----------------------------------------------------------------------
    // Suscripción a cambios (sincronización entre pestañas / nube)
    // -----------------------------------------------------------------------
    subscribe(fn){ this._listeners.add(fn); return () => this._listeners.delete(fn); },
    _emit(change){ this._listeners.forEach(fn => { try{ fn(change); }catch(e){ console.error(e); } }); },

    async _commit(write, change){
      try{
        await write();
        this._emit(change);
        return true;
      }catch(e){
        this.onError(e);
        return false;
      }
    },
    _stamp(record){ record.updatedAt = Date.now(); return record; },

    _putRecord(collection, record){
      return this._commit(() => this.adapter.put(collection, this._stamp(record)), {type:'put', collection, id:record.id});
    },
    _removeRecord(collection, id){
      const tombstone = { key: collection + '/' + id, collection, id, deletedAt: Date.now() };
      return this._commit(() => this.adapter.remove(collection, id, tombstone), {type:'delete', collection, id});
    },
    _saveDoc(key, value){
      const doc = Object.assign(clone(value), { updatedAt: Date.now() });
      return this._commit(() => this.adapter.putDoc(key, doc), {type:'doc', key});
    },

    // -----------------------------------------------------------------------
    // API de dominio (misma forma que la versión original)
    // -----------------------------------------------------------------------
    async seedSampleQuests(){
      for (const s of SAMPLE_QUESTS){ await this.addQuest(s, true); }
    },
    saveCharacter(){ return this._saveDoc('character', this.state.character); },
    saveSettings(){ return this._saveDoc('settings', this.state.settings); },

    async addQuest(q){
      const doc = Object.assign({
        title:'', categoryId: this.state.settings.categories[0].id, difficulty:'facil', recurrence:'diaria',
        active:true, createdAt: todayStr(), lastCompletedDate:null, lastPunishedDate:null
      }, q, { id: uid() });
      this.state.quests.push(doc);
      await this._putRecord('quests', doc);
      return doc;
    },
    async updateQuest(id, patch){
      const q = this.state.quests.find(x=>x.id===id); if (!q) return;
      Object.assign(q, patch);
      await this._putRecord('quests', q);
    },
    async deleteQuest(id){
      this.state.quests = this.state.quests.filter(x=>x.id!==id);
      await this._removeRecord('quests', id);
    },

    async addCompletion(entry){
      const doc = Object.assign({ts: Date.now()}, entry, { id: uid() });
      this.state.completions.unshift(doc);
      await this._putRecord('completions', doc);
      return doc;
    },

    async addHabit(h){
      const doc = Object.assign({title:'', categoryId: this.state.settings.categories[0].id, log:{}, claimedTiers:[], createdAt: todayStr()}, h, { id: uid() });
      this.state.habits.push(doc);
      await this._putRecord('habits', doc);
      return doc;
    },
    async updateHabit(id, patch){
      const h = this.state.habits.find(x=>x.id===id); if (!h) return;
      Object.assign(h, patch);
      await this._putRecord('habits', h);
    },
    async deleteHabit(id){
      this.state.habits = this.state.habits.filter(x=>x.id!==id);
      await this._removeRecord('habits', id);
    },

    async addFinance(entry){
      const doc = Object.assign({date: todayStr()}, entry, { id: uid() });
      this.state.finance.push(doc);
      this.state.finance.sort(SORTS.finance);
      await this._putRecord('finance', doc);
      return doc;
    },
    async deleteFinance(id){
      this.state.finance = this.state.finance.filter(x=>x.id!==id);
      await this._removeRecord('finance', id);
    },

    // -----------------------------------------------------------------------
    // Copia de seguridad
    // -----------------------------------------------------------------------
    async exportData(){
      const d = await this.adapter.dump();
      return {
        app: 'LifeQuest',
        schemaVersion: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        character: d.docs.character || null,
        settings: d.docs.settings || null,
        quests: d.collections.quests || [],
        completions: d.collections.completions || [],
        habits: d.collections.habits || [],
        finance: d.collections.finance || [],
        tombstones: d.tombstones || []
      };
    },

    async importData(data){
      if (!data || data.app !== 'LifeQuest' || typeof data.schemaVersion !== 'number'){
        throw new Error('El archivo no es una copia de seguridad de LifeQuest.');
      }
      if (data.schemaVersion > SCHEMA_VERSION){
        throw new Error('La copia es de una versión más nueva de LifeQuest.');
      }
      const now = Date.now();
      const records = (list) => (Array.isArray(list) ? list : [])
        .filter(r => r && typeof r === 'object')
        .map(r => Object.assign({}, r, { id: r.id ? String(r.id) : uid(), updatedAt: r.updatedAt || now }));
      await this.adapter.replaceAll({
        docs: {
          meta: Object.assign({}, this.meta, { seeded: true }),
          character: Object.assign({}, DEFAULT_CHARACTER, data.character || {}, { updatedAt: now }),
          settings: Object.assign(mergeSettings(data.settings), { updatedAt: now })
        },
        collections: {
          quests: records(data.quests), completions: records(data.completions),
          habits: records(data.habits), finance: records(data.finance)
        },
        tombstones: Array.isArray(data.tombstones) ? data.tombstones : []
      });
      this.meta = await this.adapter.getDoc('meta');
      await this.load();
      this._emit({type:'reset'});
    },

    // -----------------------------------------------------------------------
    // Soporte para sincronización (last-write-wins)
    // -----------------------------------------------------------------------

    /** Cambios locales con updatedAt/deletedAt > since (o todo si since es null). */
    async changesSince(since){
      const d = await this.adapter.dump();
      const newer = (t) => since == null || (t || 0) > since;
      const docs = {};
      DOC_KEYS.forEach(k => { if (d.docs[k] && newer(d.docs[k].updatedAt)) docs[k] = d.docs[k]; });
      const records = {};
      LQ.storage.COLLECTIONS.forEach(c => { records[c] = (d.collections[c] || []).filter(r => newer(r.updatedAt)); });
      return { docs, records, tombstones: (d.tombstones || []).filter(t => newer(t.deletedAt)) };
    },

    /** Aplica cambios remotos resolviendo conflictos por "gana el más reciente". */
    async applyRemote(changes){
      const a = this.adapter;
      const d = await a.dump();
      const local = {};
      LQ.storage.COLLECTIONS.forEach(c => {
        local[c] = new Map((d.collections[c] || []).map(r => [r.id, r]));
      });
      const localTombs = new Map((d.tombstones || []).map(t => [t.key, t]));

      for (const k of DOC_KEYS){
        const remote = changes.docs && changes.docs[k];
        if (!remote) continue;
        const mine = d.docs[k];
        if (!mine || (remote.updatedAt || 0) > (mine.updatedAt || 0)) await a.putDoc(k, remote);
      }
      for (const c of LQ.storage.COLLECTIONS){
        for (const remote of ((changes.records || {})[c] || [])){
          const mine = local[c].get(remote.id);
          const tomb = localTombs.get(c + '/' + remote.id);
          if (tomb && tomb.deletedAt >= (remote.updatedAt || 0)) continue;
          if (!mine || (remote.updatedAt || 0) > (mine.updatedAt || 0)) await a.put(c, remote);
        }
      }
      for (const t of (changes.tombstones || [])){
        const mine = local[t.collection] && local[t.collection].get(t.id);
        if (mine && (mine.updatedAt || 0) > t.deletedAt) continue;
        await a.remove(t.collection, t.id, t);
      }
      await this.load();
      this._emit({type:'reset'});
    }
  };

  LQ.store = store;
  LQ.storeInternals = { SCHEMA_VERSION, dbName };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
