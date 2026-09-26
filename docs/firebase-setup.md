# Configurar la nube (Firebase) para LifeQuest

Unos 10 minutos. Al final tendrás dos cosas que darle al proyecto:
el **`firebaseConfig`** (app web) y el archivo **`google-services.json`** (app Android).
El plan gratuito de Firebase (Spark) sobra para uso personal.

## 1. Crear el proyecto

1. Entra en <https://console.firebase.google.com> con tu cuenta de Google.
2. **Crear un proyecto** → nombre, por ejemplo `lifequest`.
3. Google Analytics: **desactívalo** (no se usa) → **Crear proyecto**.

## 2. Activar el inicio de sesión con Google

1. Menú izquierdo → **Compilación → Authentication → Comenzar**.
2. Pestaña **Método de acceso** → **Google** → **Habilitar**.
3. Elige tu correo como *correo de asistencia* → **Guardar**.

## 3. Crear la base de datos (Firestore)

1. Menú → **Compilación → Firestore Database → Crear base de datos**.
2. Ubicación: la más cercana (por ejemplo `southamerica-east1` o `nam5`).
   No se puede cambiar después.
3. Elige **modo de producción** → **Crear**.
4. Pestaña **Reglas**: borra lo que haya, pega el contenido de
   [`firestore.rules`](../firestore.rules) de este repositorio y pulsa **Publicar**.
   Estas reglas hacen que cada cuenta solo pueda leer y escribir sus propios datos.

## 4. Registrar la app web → `firebaseConfig`

1. **Configuración del proyecto** (engranaje junto a *Descripción general*) →
   sección **Tus apps** → icono **`</>`** (Web).
2. Apodo: `LifeQuest web`. No marques Firebase Hosting → **Registrar app**.
3. Copia el objeto `firebaseConfig` que aparece
   (`apiKey`, `authDomain`, `projectId`, …).

## 5. Registrar la app Android → `google-services.json`

1. En **Tus apps** → **Agregar app** → icono de **Android**.
2. **Nombre del paquete**: `com.cristianbuitrago.lifequest`
3. **Certificado de firma SHA-1** (necesario para el login con Google):

   ```
   24:E4:B7:A3:B8:02:C3:E7:BE:2E:F8:3F:79:25:4E:69:5C:7C:77:39
   ```

   Es la huella de la clave con la que se firman los APK de LifeQuest (no es
   secreta). Si algún día firmas con otra clave, añade también su SHA-1 en
   **Configuración del proyecto → Tus apps → Android → Agregar huella digital**
   y vuelve a descargar el `google-services.json`.
4. **Registrar app** → **Descargar google-services.json**. Los pasos
   siguientes del asistente (SDK, Gradle) ya están hechos en el proyecto: sáltalos.

## 6. Dárselo al proyecto

- Pega el `firebaseConfig` en [`www/js/cloud/firebase-config.js`](../www/js/cloud/firebase-config.js)
  (reemplazando `LQ.firebaseConfig = null;`).
- Copia `google-services.json` en `android/app/google-services.json`.

Ambos se pueden subir al repositorio aunque sea público: identifican el proyecto
pero no dan acceso a los datos (eso lo controlan las reglas de Firestore y el
inicio de sesión).

## 7. Clave de firma compartida en GitHub (para los APK de Actions)

Para que los APK que compila GitHub se instalen encima de los anteriores y el
login de Google funcione con ellos, GitHub necesita la misma clave de firma:

1. Repositorio en GitHub → **Settings → Secrets and variables → Actions →
   New repository secret**.
2. Nombre: `LIFEQUEST_DEBUG_KEYSTORE_BASE64`
3. Valor: el contenido del archivo `lifequest-debug.keystore.base64.txt` que te
   entregó Claude. **Es privado**: no lo subas al repositorio.

## 8. (Opcional) Web fuera de tu PC

El login con Google en la web funciona en `localhost` (`npm start`). Si publicas
`www/` en un dominio, añádelo en **Authentication → Configuración → Dominios
autorizados**.

## Probar en local con emuladores (desarrolladores)

```bash
npx firebase-tools emulators:start --only auth,firestore
```

y en `firebase-config.js` añade `useEmulators: true` al objeto de configuración.
