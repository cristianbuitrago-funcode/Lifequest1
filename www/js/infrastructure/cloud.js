/*
 * Cuentas de Google + sincronización con Firebase.
 *
 * - Si `LifeQuest.firebaseConfig` es null (js/cloud/firebase-config.js), todo
 *   esto queda desactivado y la app funciona 100 % local.
 * - El SDK de Firebase se carga solo cuando hace falta (www/vendor/firebase/).
 * - Android: inicio de sesión nativo con @capacitor-firebase/authentication
 *   (skipNativeAuth) y la sesión se abre en el SDK web con ese token.
 *   Web: ventana emergente de Google (requiere http/https, no file://).
 */
(function (LQ) {
  "use strict";

  const SCRIPTS = [
    'vendor/firebase/firebase-app-compat.js',
    'vendor/firebase/firebase-auth-compat.js',
    'vendor/firebase/firebase-firestore-compat.js'
  ];

  function loadScript(src){
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  function withTimeout(promise, ms){
    return Promise.race([promise, new Promise(resolve => setTimeout(resolve, ms))]);
  }

  const cloud = {
    get configured(){ return !!LQ.firebaseConfig; },
    user: null,
    social: null,   // proveedor del modo social (ranking y clanes) con sesión iniciada
    auth: null,
    db: null,
    // Pregunta antes de reemplazar datos locales de otra cuenta (la UI la redefine).
    confirmAccountSwitch: (oldEmail, newEmail) => Promise.resolve(globalThis.confirm(
      'Este dispositivo tiene datos de ' + (oldEmail || 'otra cuenta') + '. ¿Reemplazarlos por los de ' + newEmail + '?'
    )),
    _listeners: new Set(),
    _ready: null,

    onChange(fn){ this._listeners.add(fn); return () => this._listeners.delete(fn); },
    _notify(){ this._listeners.forEach(fn => { try{ fn(this.user); }catch(e){ console.error(e); } }); },

    /**
     * Inicia Firebase y espera a conocer la sesión y a la primera sincronización
     * (como mucho `timeoutMs`). Se puede llamar varias veces.
     */
    init(timeoutMs){
      if (!this.configured) return Promise.resolve();
      if (!this._ready) this._ready = this._start().catch(e => { this._ready = null; throw e; });
      return withTimeout(this._ready, timeoutMs || 8000);
    },

    async _start(){
      if (!globalThis.firebase || !globalThis.firebase.firestore){
        for (const src of SCRIPTS) await loadScript(src);
      }
      const firebase = globalThis.firebase;
      const cfg = LQ.firebaseConfig;
      firebase.initializeApp(cfg);
      this.auth = firebase.auth();
      this.db = firebase.firestore();
      this.db.settings({ ignoreUndefinedProperties: true, merge: true });
      if (cfg.useEmulators){
        this.auth.useEmulator('http://' + (cfg.emulatorHost || '127.0.0.1') + ':9099', { disableWarnings: true });
        this.db.useEmulator(cfg.emulatorHost || '127.0.0.1', 8085);
      }

      let first = true;
      await new Promise(resolve => {
        this.auth.onAuthStateChanged(async (user) => {
          try{ await this._onUser(user); }
          catch(e){ console.error('LifeQuest cloud', e); }
          if (first){ first = false; resolve(); }
        });
      });
    },

    async _onUser(user){
      if (!user){
        this.user = null;
        this.social = null;
        LQ.sync.unregister();
        this._notify();
        return;
      }
      const meta = LQ.store.meta || {};
      if (meta.syncAccount && meta.syncAccount !== user.uid && !LQ.store.isPristine()){
        const ok = await this.confirmAccountSwitch(meta.syncEmail, user.email);
        if (!ok){ await this.signOut(); return; }
        await LQ.store.clearLocal();
      }
      await LQ.store.setMeta({ syncEmail: user.email || null });
      this.user = { uid: user.uid, email: user.email, name: user.displayName, photo: user.photoURL };
      this.social = LQ.cloudProviders.createSocialProvider(globalThis.firebase, this.db, user.uid);
      LQ.sync.register(LQ.cloudProviders.createFirestoreProvider(globalThis.firebase, this.db, user.uid));
      this._notify();
      try{ await LQ.sync.syncNow(); }catch(e){ console.warn('LifeQuest: primera sincronización fallida', e); }
    },

    async signIn(){
      this.init();
      await this._ready;
      const firebase = globalThis.firebase;
      if (LQ.native.isNative){
        const idToken = await LQ.native.googleSignIn();
        await this.auth.signInWithCredential(firebase.auth.GoogleAuthProvider.credential(idToken));
        return;
      }
      if (location.protocol === 'file:'){
        throw new Error('Para iniciar sesión en la web abre LifeCoinQuest desde un servidor (npm start) o usa la app Android.');
      }
      await this.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    },

    async signOut(){
      if (!this.auth) return;
      await this.auth.signOut();
      if (LQ.native.isNative) await LQ.native.googleSignOut().catch(() => {});
    },

    /**
     * Elimina la cuenta: borra todos los datos en la nube y la cuenta de
     * Firebase. Los datos de este dispositivo se conservan (se pueden borrar
     * desinstalando la app o borrando sus datos).
     */
    async deleteAccount(){
      const firebase = globalThis.firebase;
      const user = this.auth && this.auth.currentUser;
      if (!user) throw new Error('No hay ninguna sesión iniciada.');
      const provider = LQ.cloudProviders.createFirestoreProvider(firebase, this.db, user.uid);
      LQ.sync.unregister(); // que nada vuelva a subir datos mientras se borra
      // Parte pública: sale del clan y borra el perfil del ranking.
      const social = LQ.cloudProviders.createSocialProvider(firebase, this.db, user.uid);
      const clanId = LQ.state.profile.social && LQ.state.profile.social.clanId;
      if (clanId) await social.leaveClan(clanId).catch(e => console.warn('leaveClan', e));
      await social.unpublish().catch(() => {});
      await provider.deleteAll();
      try{
        await user.delete();
      }catch(e){
        if (e && e.code !== 'auth/requires-recent-login') throw e;
        // Firebase pide haber iniciado sesión hace poco: se confirma con Google y se reintenta.
        if (LQ.native.isNative){
          const idToken = await LQ.native.googleSignIn();
          await user.reauthenticateWithCredential(firebase.auth.GoogleAuthProvider.credential(idToken));
        } else {
          await user.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider());
        }
        await user.delete();
      }
      if (LQ.native.isNative) await LQ.native.googleSignOut().catch(() => {});
      await LQ.store.setMeta({ syncAccount: null, syncPullCursor: null, syncPushedAt: null, syncEmail: null, lastSyncAt: null });
      Object.assign(LQ.state.profile.social, { public: false, clanId: null, clanName: null });
      await LQ.store.saveProfile();
      this.user = null;
      this.social = null;
      this._notify();
    }
  };

  LQ.cloud = cloud;
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
