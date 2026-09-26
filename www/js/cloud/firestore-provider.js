/*
 * Proveedor de sincronización sobre Cloud Firestore (SDK "compat").
 *
 * Estructura en la nube (una rama por cuenta, protegida por las reglas de
 * firestore.rules):
 *
 *   users/{uid}/docs/{character|settings}
 *   users/{uid}/{quests|completions|habits|finance}/{id}
 *   users/{uid}/tombstones/{coleccion}__{id}
 *
 * Cada documento lleva `syncedAt` (hora del servidor), que sirve de cursor
 * para bajar solo lo nuevo.
 */
(function (LQ) {
  "use strict";

  const BATCH_LIMIT = 400;      // Firestore admite 500 escrituras por lote
  const CURSOR_MARGIN = 30000;  // re-lee 30 s hacia atrás por seguridad (es idempotente)

  function tombstoneId(t){ return t.collection + '__' + t.id; }

  /**
   * @param {object} firebase  espacio de nombres compat (firebase.firestore…)
   * @param {object} db        instancia de firebase.firestore()
   * @param {string} uid
   */
  function createFirestoreProvider(firebase, db, uid){
    const root = db.collection('users').doc(uid);
    const COLLECTIONS = LQ.storage.COLLECTIONS;
    const serverTime = () => firebase.firestore.FieldValue.serverTimestamp();

    return {
      name: 'firestore',
      uid,

      async pull(cursor){
        const since = cursor ? firebase.firestore.Timestamp.fromMillis(Math.max(0, cursor - CURSOR_MARGIN)) : null;
        const query = (name) => since ? root.collection(name).where('syncedAt', '>', since) : root.collection(name);
        const names = ['docs', ...COLLECTIONS, 'tombstones'];
        const snaps = await Promise.all(names.map(n => query(n).get()));

        let max = cursor || 0;
        const read = (snap) => snap.docs.map(d => {
          const data = d.data();
          const t = data.syncedAt && data.syncedAt.toMillis ? data.syncedAt.toMillis() : 0;
          if (t > max) max = t;
          delete data.syncedAt;
          return { key: d.id, data };
        });

        const out = { docs: {}, records: {}, tombstones: [], cursor: null };
        read(snaps[0]).forEach(({ key, data }) => { out.docs[key] = data; });
        COLLECTIONS.forEach((c, i) => { out.records[c] = read(snaps[i + 1]).map(x => x.data); });
        out.tombstones = read(snaps[snaps.length - 1]).map(x => x.data);
        out.cursor = max || null;
        return out;
      },

      async push(changes){
        const writes = [];
        Object.entries(changes.docs || {}).forEach(([key, data]) => {
          writes.push(b => b.set(root.collection('docs').doc(key), Object.assign({}, data, { syncedAt: serverTime() })));
        });
        Object.entries(changes.records || {}).forEach(([c, list]) => {
          list.forEach(r => writes.push(b => b.set(root.collection(c).doc(String(r.id)), Object.assign({}, r, { syncedAt: serverTime() }))));
        });
        (changes.tombstones || []).forEach(t => {
          writes.push(b => b.set(root.collection('tombstones').doc(tombstoneId(t)), Object.assign({}, t, { syncedAt: serverTime() })));
          // El registro borrado ya no hace falta en la nube; la lápida propaga el borrado.
          if (COLLECTIONS.includes(t.collection)) writes.push(b => b.delete(root.collection(t.collection).doc(String(t.id))));
        });
        await commitAll(writes);
      },

      /** Borra todos los datos de la cuenta en la nube (para "Eliminar mi cuenta"). */
      async deleteAll(){
        const names = ['docs', ...COLLECTIONS, 'tombstones'];
        const snaps = await Promise.all(names.map(n => root.collection(n).get()));
        const writes = [];
        snaps.forEach(snap => snap.docs.forEach(d => writes.push(b => b.delete(d.ref))));
        await commitAll(writes);
        return writes.length;
      }
    };

    async function commitAll(writes){
      for (let i = 0; i < writes.length; i += BATCH_LIMIT){
        const batch = db.batch();
        writes.slice(i, i + BATCH_LIMIT).forEach(w => w(batch));
        await batch.commit();
      }
    }
  }

  LQ.cloudProviders = Object.assign(LQ.cloudProviders || {}, { createFirestoreProvider });
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
