/*
 * Configuración de Firebase para las cuentas y la sincronización en la nube.
 *
 * Mientras sea null, LifeQuest funciona 100 % local y no carga Firebase.
 * Para activarla sigue docs/firebase-setup.md y pega aquí el objeto
 * `firebaseConfig` de tu app web de Firebase. Estos valores no son secretos:
 * identifican el proyecto, y los datos los protegen las reglas de
 * firestore.rules.
 */
(function (LQ) {
  "use strict";

  LQ.firebaseConfig = null;

  // Ejemplo:
  // LQ.firebaseConfig = {
  //   apiKey: "AIza...",
  //   authDomain: "tu-proyecto.firebaseapp.com",
  //   projectId: "tu-proyecto",
  //   storageBucket: "tu-proyecto.firebasestorage.app",
  //   messagingSenderId: "1234567890",
  //   appId: "1:1234567890:web:abcdef"
  // };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
