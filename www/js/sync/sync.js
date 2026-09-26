/*
 * Motor de sincronización con la nube (independiente del proveedor).
 *
 * Un proveedor implementa:
 *
 *   {
 *     name: 'firestore',
 *     uid:  'id de la cuenta',
 *     async pull(cursor) -> {docs, records, tombstones, cursor}
 *                            // cambios remotos posteriores a `cursor` (reloj del servidor)
 *     async push(changes)   // mismo formato que store.changesSince()
 *   }
 *
 * Cada sincronización: baja lo nuevo → fusiona ("gana el más reciente") →
 * sube lo local que cambió desde la última vez. El cursor de bajada usa la
 * hora del servidor, así que relojes desajustados entre dispositivos no hacen
 * perder cambios.
 */
(function (LQ) {
  "use strict";

  function isEmpty(changes){
    if (!changes) return true;
    const docs = Object.keys(changes.docs || {}).length;
    const recs = Object.values(changes.records || {}).reduce((n, l) => n + l.length, 0);
    return !docs && !recs && !(changes.tombstones || []).length;
  }

  // Quita de `local` lo que acabamos de recibir tal cual, para no devolverlo.
  function withoutEcho(local, remote){
    const seen = new Set();
    Object.entries(remote.docs || {}).forEach(([k, d]) => seen.add('doc:' + k + '@' + d.updatedAt));
    Object.entries(remote.records || {}).forEach(([c, list]) => list.forEach(r => seen.add(c + '/' + r.id + '@' + r.updatedAt)));
    (remote.tombstones || []).forEach(t => seen.add('t:' + t.key + '@' + t.deletedAt));
    const docs = {};
    Object.entries(local.docs || {}).forEach(([k, d]) => { if (!seen.has('doc:' + k + '@' + d.updatedAt)) docs[k] = d; });
    const records = {};
    Object.entries(local.records || {}).forEach(([c, list]) => {
      records[c] = list.filter(r => !seen.has(c + '/' + r.id + '@' + r.updatedAt));
    });
    const tombstones = (local.tombstones || []).filter(t => !seen.has('t:' + t.key + '@' + t.deletedAt));
    return { docs, records, tombstones };
  }

  const sync = {
    provider: null,
    // true mientras se aplican cambios remotos: los cambios que eso genera en
    // el store no deben disparar otra sincronización.
    applying: false,
    status: { state: 'idle', lastSyncAt: null, error: null },
    _running: null,
    _again: false,
    _listeners: new Set(),

    register(provider){ this.provider = provider; this._set({ state: 'idle', error: null }); },
    unregister(){ this.provider = null; this._set({ state: 'idle', error: null }); },
    get enabled(){ return !!this.provider; },

    onStatus(fn){ this._listeners.add(fn); return () => this._listeners.delete(fn); },
    _set(patch, extra){
      this.status = Object.assign({}, this.status, patch);
      this._listeners.forEach(fn => { try{ fn(this.status, extra || {}); }catch(e){ console.error(e); } });
    },

    /**
     * Sincroniza ahora. Si ya hay una en curso, encadena otra al terminar.
     * @returns {Promise<{pulled:boolean, pushed:boolean}|null>}
     */
    syncNow(){
      if (!this.provider) return Promise.resolve(null);
      if (this._running){ this._again = true; return this._running; }
      this._running = (async () => {
        let result = null;
        do {
          this._again = false;
          result = await this._once();
        } while (this._again && this.provider);
        return result;
      })().finally(() => { this._running = null; });
      return this._running;
    },

    async _once(){
      const provider = this.provider;
      const store = LQ.store;
      this._set({ state: 'syncing', error: null });
      try{
        const meta = store.meta || {};
        const firstSync = meta.syncAccount !== provider.uid;
        const startedAt = Date.now();

        const remote = await provider.pull(firstSync ? null : meta.syncPullCursor);
        if (this.provider !== provider) return null; // cerró sesión a mitad

        // Primer enlace de un dispositivo sin datos propios a una cuenta que ya
        // tiene datos: se descartan las misiones de ejemplo para no duplicarlas.
        if (firstSync && !isEmpty(remote) && store.isPristine()) await store.clearLocal();

        const pulled = !isEmpty(remote);
        if (pulled){
          this.applying = true;
          try{ await store.applyRemote(remote); } finally { this.applying = false; }
        }

        const local = withoutEcho(await store.changesSince(firstSync ? null : meta.syncPushedAt), remote);
        const pushed = !isEmpty(local);
        if (pushed) await provider.push(local);

        const cursor = remote.cursor != null ? remote.cursor : (firstSync ? null : meta.syncPullCursor);
        await store.setMeta({
          syncAccount: provider.uid,
          syncPullCursor: cursor,
          syncPushedAt: startedAt,
          lastSyncAt: Date.now()
        });
        this._set({ state: 'idle', lastSyncAt: Date.now(), error: null }, { pulled });
        return { pulled, pushed };
      }catch(e){
        this.applying = false;
        const offline = globalThis.navigator && navigator.onLine === false;
        this._set({ state: offline ? 'offline' : 'error', error: e });
        throw e;
      }
    }
  };

  LQ.sync = sync;
  LQ.syncInternals = { isEmpty, withoutEcho };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
