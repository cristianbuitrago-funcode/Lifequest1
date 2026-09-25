/*
 * Punto de extensión para sincronización en la nube y cuentas de usuario.
 *
 * Hoy no hay ningún proveedor registrado: la app funciona 100 % local.
 * Para añadir la nube, implementa un proveedor con esta forma y regístralo
 * con LifeQuest.sync.register(provider) antes (o después) del arranque:
 *
 *   {
 *     name: 'supabase',
 *     async getUser()           -> {id, email} | null   // cuenta con sesión iniciada
 *     async pull(since)         -> {docs, records, tombstones}  // cambios remotos > since
 *     async push(changes)       -> void                  // mismo formato que pull
 *   }
 *
 * El formato de `changes` es el que producen store.changesSince() y consume
 * store.applyRemote(): documentos (character, settings), registros por
 * colección con `updatedAt`, y lápidas de borrado con `deletedAt`.
 *
 * Cuentas: store.init({profile: user.id}) aísla los datos de cada usuario en
 * su propia base local ('lifequest:<id>'), así varias cuentas pueden convivir
 * en el mismo navegador.
 */
(function (LQ) {
  "use strict";

  const sync = {
    provider: null,
    running: false,

    register(provider){ this.provider = provider; },
    get enabled(){ return !!this.provider; },

    /** Pull + merge (last-write-wins) + push. No hace nada sin proveedor. */
    async syncNow(){
      if (!this.provider || this.running) return false;
      this.running = true;
      try{
        const store = LQ.store;
        const since = store.meta && store.meta.lastSyncAt;
        const startedAt = Date.now();
        const remote = await this.provider.pull(since);
        if (remote) await store.applyRemote(remote);
        const local = await store.changesSince(since);
        await this.provider.push(local);
        await store.setMeta({ lastSyncAt: startedAt });
        return true;
      } finally {
        this.running = false;
      }
    }
  };

  LQ.sync = sync;
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
