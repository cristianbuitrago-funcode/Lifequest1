/*
 * Familia (supervisión parental) sobre Cloud Firestore (SDK "compat").
 * Todo lo protege firestore.rules; aquí solo se leen y escriben datos.
 *
 *   familyInvites/{código}                      invitación de un padre (un solo uso)
 *   families/{menor}                            nombre del menor
 *   families/{menor}/parents/{padre}            padres vinculados (los crea el menor con el código)
 *   parentLinks/{padre}/children/{menor}        lista de hijos que ve el padre
 *   familyProgress/{menor}                      resumen de progreso (solo lo leen sus padres)
 */
(function (LQ) {
  "use strict";

  function createFamilyProvider(firebase, db, uid){
    const invites = db.collection('familyInvites');
    const families = db.collection('families');
    const progressCol = db.collection('familyProgress');
    const links = (parentUid) => db.collection('parentLinks').doc(parentUid).collection('children');
    const now = () => firebase.firestore.FieldValue.serverTimestamp();
    const plain = (o) => JSON.parse(JSON.stringify(o));
    const docs = (snap) => snap.docs.map(d => Object.assign({ id: d.id }, d.data()));

    return {
      uid,

      // ------------------------------------------------------------ padre
      /** Crea un código de un solo uso con el PIN (hash) que desbloquea el modo menor. */
      async createInvite(parentName, pin){
        for (let i = 0; i < 5; i++){
          const code = LQ.Social.inviteCode();
          const ref = invites.doc(code);
          if ((await ref.get()).exists) continue;
          await ref.set({ parentUid: uid, parentName: String(parentName || '').slice(0, 30), salt: pin.salt, pinHash: pin.hash, createdAt: now() });
          return code;
        }
        throw new Error('No se pudo crear el código. Inténtalo de nuevo.');
      },
      cancelInvite(code){ return invites.doc(code).delete(); },

      /** Hijos vinculados a esta cuenta. */
      async children(){ return docs(await links(uid).get()); },

      /** Último resumen publicado por un hijo (null si aún no hay). */
      async progress(childUid){
        const snap = await progressCol.doc(childUid).get();
        return snap.exists ? snap.data() : null;
      },

      /** El padre deja de supervisar a un hijo (el menor sale del modo menor en su próxima sincronización). */
      async unlinkChild(childUid){
        const batch = db.batch();
        batch.delete(links(uid).doc(childUid));
        batch.delete(families.doc(childUid).collection('parents').doc(uid));
        await batch.commit();
      },

      // ------------------------------------------------------------ menor
      async readInvite(code){
        const snap = await invites.doc(String(code || '').toUpperCase()).get();
        return snap.exists ? Object.assign({ code: snap.id }, snap.data()) : null;
      },

      /** Acepta la invitación: crea los enlaces en ambos sentidos y consume el código. */
      async accept(invite, childName){
        if (invite.parentUid === uid) throw Object.assign(new Error('Ese código lo creaste tú: ábrelo en el teléfono del menor.'), { code: 'own-invite' });
        const name = String(childName || '').slice(0, 30) || 'Menor';
        const batch = db.batch();
        batch.set(families.doc(uid), { childName: name, updatedAt: now() });
        batch.set(families.doc(uid).collection('parents').doc(invite.parentUid), { parentName: invite.parentName || '', invite: invite.code, since: now() });
        batch.set(links(invite.parentUid).doc(uid), { childName: name, invite: invite.code, since: now() });
        batch.delete(invites.doc(invite.code));
        await batch.commit();
      },

      /** Padres vinculados a esta cuenta de menor. */
      async parents(){ return docs(await families.doc(uid).collection('parents').get()); },

      /** Avisa cuando cambian los padres vinculados (p. ej. un padre desvincula). */
      watchParents(fn){
        return families.doc(uid).collection('parents').onSnapshot(
          snap => fn(docs(snap)),
          e => console.warn('LifeCoinQuest: familia', e));
      },

      /** Sube el resumen de progreso para los padres. */
      publish(progress){
        return progressCol.doc(uid).set(Object.assign(plain(progress), { updatedAt: now() }));
      },

      /** El menor (con el PIN) se desvincula de un padre. */
      async leave(parentUid){
        const batch = db.batch();
        batch.delete(families.doc(uid).collection('parents').doc(parentUid));
        batch.delete(links(parentUid).doc(uid));
        await batch.commit();
      },

      /** Borra todo lo de Familia de esta cuenta (al eliminar la cuenta). */
      async deleteAll(){
        const batch = db.batch();
        const [asParent, asChild] = await Promise.all([links(uid).get(), families.doc(uid).collection('parents').get()]);
        asParent.docs.forEach(d => {
          batch.delete(d.ref);
          batch.delete(families.doc(d.id).collection('parents').doc(uid));
        });
        asChild.docs.forEach(d => {
          batch.delete(d.ref);
          batch.delete(links(d.id).doc(uid));
        });
        batch.delete(families.doc(uid));
        batch.delete(progressCol.doc(uid));
        await batch.commit();
      }
    };
  }

  LQ.cloudProviders = Object.assign(LQ.cloudProviders || {}, { createFamilyProvider });
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
