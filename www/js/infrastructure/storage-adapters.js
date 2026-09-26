/*
 * Adaptadores de almacenamiento.
 *
 * Todos implementan la misma interfaz asíncrona, de modo que `store` no sabe
 * (ni le importa) dónde viven los datos:
 *
 *   kind, persistent
 *   getDoc(key)               -> objeto | null      (documentos únicos: character, settings, profile, meta)
 *   putDoc(key, value)
 *   getAll(collection)        -> [registros]        (ver COLLECTIONS)
 *   put(collection, record)                         (upsert por record.id)
 *   remove(collection, id, tombstone?)              (borra y opcionalmente deja una "lápida")
 *   getTombstones()           -> [{key, collection, id, deletedAt}]
 *   dump()                    -> {docs, collections, tombstones}
 *   replaceAll(dump)                                (reemplazo atómico; usado al importar)
 *
 * Un futuro adaptador remoto (Supabase, Firebase, API propia…) puede
 * implementar esta misma interfaz.
 */
(function (LQ) {
  "use strict";

  const COLLECTIONS = [
    'quests', 'completions', 'habits', 'finance',
    // v2: pagos, distribución del dinero, inventario y productos personalizados de la tienda
    'bills', 'allocations', 'inventory', 'shopProducts'
  ];
  const DB_VERSION = 2; // al subir de versión, onupgradeneeded crea solo los almacenes que faltan

  // -------------------------------------------------------------------------
  // IndexedDB — backend principal
  // -------------------------------------------------------------------------
  class IndexedDBAdapter {
    constructor(name){
      this.name = name;
      this.kind = 'indexeddb';
      this.persistent = true;
      this.db = null;
    }

    static isAvailable(){
      try{ return typeof indexedDB !== 'undefined' && indexedDB !== null; }catch(e){ return false; }
    }

    open(){
      return new Promise((resolve, reject) => {
        let req;
        try{ req = indexedDB.open(this.name, DB_VERSION); }catch(e){ reject(e); return; }
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs');
          COLLECTIONS.forEach(c => {
            if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, {keyPath:'id'});
          });
          if (!db.objectStoreNames.contains('tombstones')) db.createObjectStore('tombstones', {keyPath:'key'});
        };
        req.onsuccess = () => {
          this.db = req.result;
          // Si otra pestaña abre una versión nueva del esquema, cedemos la conexión.
          this.db.onversionchange = () => this.db.close();
          resolve(this);
        };
        req.onerror = () => reject(req.error);
      });
    }

    _run(storeNames, mode, work){
      return new Promise((resolve, reject) => {
        let tx;
        try{ tx = this.db.transaction(storeNames, mode); }catch(e){ reject(e); return; }
        const req = work(tx);
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transacción cancelada'));
      });
    }

    async getDoc(key){
      const v = await this._run('docs', 'readonly', tx => tx.objectStore('docs').get(key));
      return v === undefined ? null : v;
    }
    putDoc(key, value){
      return this._run('docs', 'readwrite', tx => { tx.objectStore('docs').put(value, key); });
    }
    getAll(collection){
      return this._run(collection, 'readonly', tx => tx.objectStore(collection).getAll());
    }
    put(collection, record){
      return this._run(collection, 'readwrite', tx => { tx.objectStore(collection).put(record); });
    }
    remove(collection, id, tombstone){
      return this._run([collection, 'tombstones'], 'readwrite', tx => {
        tx.objectStore(collection).delete(id);
        if (tombstone) tx.objectStore('tombstones').put(tombstone);
      });
    }
    getTombstones(){
      return this._run('tombstones', 'readonly', tx => tx.objectStore('tombstones').getAll());
    }

    async dump(){
      const out = {docs:{}, collections:{}, tombstones:[]};
      await this._run(['docs', 'tombstones', ...COLLECTIONS], 'readonly', tx => {
        const docs = tx.objectStore('docs');
        const keysReq = docs.getAllKeys();
        const valsReq = docs.getAll();
        valsReq.onsuccess = () => keysReq.result.forEach((k, i) => { out.docs[k] = valsReq.result[i]; });
        COLLECTIONS.forEach(c => {
          const r = tx.objectStore(c).getAll();
          r.onsuccess = () => { out.collections[c] = r.result; };
        });
        const t = tx.objectStore('tombstones').getAll();
        t.onsuccess = () => { out.tombstones = t.result; };
      });
      return out;
    }

    replaceAll(data){
      return this._run(['docs', 'tombstones', ...COLLECTIONS], 'readwrite', tx => {
        const docs = tx.objectStore('docs');
        docs.clear();
        Object.keys(data.docs || {}).forEach(k => docs.put(data.docs[k], k));
        COLLECTIONS.forEach(c => {
          const s = tx.objectStore(c);
          s.clear();
          ((data.collections || {})[c] || []).forEach(r => s.put(r));
        });
        const t = tx.objectStore('tombstones');
        t.clear();
        (data.tombstones || []).forEach(r => t.put(r));
      });
    }
  }

  // -------------------------------------------------------------------------
  // Clave-valor (localStorage o memoria) — respaldo si IndexedDB no está
  // disponible. Guarda cada colección como un JSON {id: registro}.
  // -------------------------------------------------------------------------
  class KeyValueAdapter {
    constructor(prefix, kv, kind, persistent){
      this.prefix = prefix;
      this.kv = kv;
      this.kind = kind;
      this.persistent = persistent;
    }

    _read(name, fallback){
      const raw = this.kv.getItem(this.prefix + ':' + name);
      if (raw == null) return fallback;
      try{ return JSON.parse(raw); }catch(e){ return fallback; }
    }
    _write(name, value){ this.kv.setItem(this.prefix + ':' + name, JSON.stringify(value)); }

    async open(){ return this; }
    async getDoc(key){ const docs = this._read('docs', {}); return key in docs ? docs[key] : null; }
    async putDoc(key, value){ const docs = this._read('docs', {}); docs[key] = value; this._write('docs', docs); }
    async getAll(collection){ return Object.values(this._read(collection, {})); }
    async put(collection, record){
      const all = this._read(collection, {});
      all[record.id] = record;
      this._write(collection, all);
    }
    async remove(collection, id, tombstone){
      const all = this._read(collection, {});
      delete all[id];
      this._write(collection, all);
      if (tombstone){
        const t = this._read('tombstones', {});
        t[tombstone.key] = tombstone;
        this._write('tombstones', t);
      }
    }
    async getTombstones(){ return Object.values(this._read('tombstones', {})); }
    async dump(){
      const collections = {};
      COLLECTIONS.forEach(c => { collections[c] = Object.values(this._read(c, {})); });
      return {docs: this._read('docs', {}), collections, tombstones: Object.values(this._read('tombstones', {}))};
    }
    async replaceAll(data){
      this._write('docs', data.docs || {});
      COLLECTIONS.forEach(c => {
        const map = {};
        ((data.collections || {})[c] || []).forEach(r => { map[r.id] = r; });
        this._write(c, map);
      });
      const t = {};
      (data.tombstones || []).forEach(r => { t[r.key] = r; });
      this._write('tombstones', t);
    }
  }

  function createMemoryKV(){
    const m = new Map();
    return {
      getItem: k => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { m.set(k, String(v)); },
      removeItem: k => { m.delete(k); }
    };
  }

  function localStorageAvailable(){
    try{
      const k = '__lifequest_probe__';
      globalThis.localStorage.setItem(k, '1');
      globalThis.localStorage.removeItem(k);
      return true;
    }catch(e){ return false; }
  }

  /**
   * Abre el mejor backend local disponible:
   * IndexedDB → localStorage → memoria (último recurso, no persiste).
   */
  async function openLocalAdapter(namespace){
    if (IndexedDBAdapter.isAvailable()){
      try{ return await new IndexedDBAdapter(namespace).open(); }
      catch(e){ console.warn('LifeQuest: IndexedDB no disponible, usando localStorage', e); }
    }
    if (localStorageAvailable()){
      return new KeyValueAdapter(namespace, globalThis.localStorage, 'localstorage', true);
    }
    console.warn('LifeQuest: sin almacenamiento persistente; los datos se perderán al recargar.');
    return createMemoryAdapter(namespace);
  }

  function createMemoryAdapter(namespace){
    return new KeyValueAdapter(namespace || 'mem', createMemoryKV(), 'memory', false);
  }

  LQ.storage = { COLLECTIONS, IndexedDBAdapter, KeyValueAdapter, openLocalAdapter, createMemoryAdapter };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
