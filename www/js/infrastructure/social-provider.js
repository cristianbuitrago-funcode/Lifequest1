/*
 * Modo social sobre Cloud Firestore (SDK "compat"): perfil público, ranking y
 * clanes. Todo se protege con firestore.rules; aquí solo se leen/escriben datos.
 *
 *   publicProfiles/{uid}   lo que ven los demás (nombre, foto, nivel, XP, clan)
 *   clans/{clanId}         nombre, emoji, descripción, abierto/privado, integrantes
 *   clanCodes/{código}     código de invitación → clanId (solo se lee si lo conoces)
 */
(function (LQ) {
  "use strict";

  function createSocialProvider(firebase, db, uid){
    const profiles = db.collection('publicProfiles');
    const clans = db.collection('clans');
    const codes = db.collection('clanCodes');
    const now = () => firebase.firestore.FieldValue.serverTimestamp();
    const docs = (snap) => snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    const plain = (o) => JSON.parse(JSON.stringify(o));

    return {
      uid,

      // ---------------------------------------------------------------- perfil
      publish(data){
        return profiles.doc(uid).set(Object.assign(plain(data), { updatedAt: now() }));
      },
      unpublish(){ return profiles.doc(uid).delete(); },

      // --------------------------------------------------------------- ranking
      async topGlobal(limit){
        return docs(await profiles.orderBy('totalXp', 'desc').limit(limit || 50).get());
      },
      async topWeekly(weekKey, limit){
        return docs(await profiles.where('weekKey', '==', weekKey).orderBy('weeklyXp', 'desc').limit(limit || 50).get());
      },

      // ----------------------------------------------------------------- clanes
      async getClan(id){
        const snap = await clans.doc(id).get();
        return snap.exists ? Object.assign({ id: snap.id }, snap.data()) : null;
      },
      async listOpenClans(limit){
        return docs(await clans.where('open', '==', true).orderBy('memberCount', 'desc').limit(limit || 20).get());
      },
      async findByCode(code){
        const snap = await codes.doc(String(code || '').toUpperCase().trim()).get();
        return snap.exists ? this.getClan(snap.data().clanId) : null;
      },

      /** Crea un clan con el usuario como dueño y único integrante. */
      async createClan({ name, emoji, description, open }){
        const ref = clans.doc();
        for (let attempt = 0; attempt < 5; attempt++){
          const code = LQ.Social.inviteCode();
          try{
            await db.runTransaction(async (t) => {
              const codeRef = codes.doc(code);
              if ((await t.get(codeRef)).exists) throw new Error('code-taken');
              t.set(ref, {
                name, emoji: emoji || '🛡️', description: description || '', open: !!open,
                code, ownerUid: uid, members: [uid], memberCount: 1, createdAt: now()
              });
              t.set(codeRef, { clanId: ref.id });
            });
            return this.getClan(ref.id);
          }catch(e){ if (e.message !== 'code-taken') throw e; }
        }
        throw new Error('No se pudo generar un código de invitación. Inténtalo de nuevo.');
      },

      async joinClan(id){
        const ref = clans.doc(id);
        await db.runTransaction(async (t) => {
          const snap = await t.get(ref);
          if (!snap.exists) throw new Error('El clan ya no existe.');
          const c = snap.data();
          if (c.members.includes(uid)) return;
          if (c.members.length >= LQ.Social.CLAN_MAX) throw new Error('El clan está lleno (' + LQ.Social.CLAN_MAX + ' integrantes).');
          const members = c.members.concat(uid);
          t.update(ref, { members, memberCount: members.length });
        });
        return this.getClan(id);
      },

      /** Sale del clan; si el dueño es el último integrante, el clan se borra. */
      async leaveClan(id){
        const ref = clans.doc(id);
        await db.runTransaction(async (t) => {
          const snap = await t.get(ref);
          if (!snap.exists) return;
          const c = snap.data();
          if (!c.members.includes(uid)) return;
          const members = c.members.filter(m => m !== uid);
          if (!members.length){
            t.delete(ref);
            t.delete(codes.doc(c.code));
          } else {
            const patch = { members, memberCount: members.length };
            if (c.ownerUid === uid) patch.ownerUid = members[0];   // pasa la corona
            t.update(ref, patch);
          }
        });
      },

      async updateClan(id, patch){
        const allowed = {};
        ['name', 'emoji', 'description', 'open'].forEach(k => { if (k in patch) allowed[k] = patch[k]; });
        await clans.doc(id).update(allowed);
        return this.getClan(id);
      },

      /** Perfiles públicos de los integrantes (de a 10 por consulta "in"). */
      async members(clan){
        const ids = (clan && clan.members) || [];
        const out = [];
        for (let i = 0; i < ids.length; i += 10){
          const snap = await profiles.where(firebase.firestore.FieldPath.documentId(), 'in', ids.slice(i, i + 10)).get();
          out.push(...docs(snap));
        }
        return out;
      }
    };
  }

  LQ.cloudProviders = Object.assign(LQ.cloudProviders || {}, { createSocialProvider });
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
