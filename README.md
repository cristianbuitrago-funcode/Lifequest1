# LifeQuest

Convierte tus tareas diarias en un RPG: misiones con XP y monedas, niveles, rachas,
hábitos con escalera de recompensas y un módulo de finanzas personales.

Es una **app Android** (empaquetada con Capacitor) construida sobre una web
estática en HTML + CSS + JavaScript puro, sin build. Los datos se guardan en el
dispositivo (IndexedDB) y se conservan entre sesiones.

## App Android (Capacitor)

La app se empaqueta como aplicación nativa de Android con
[Capacitor](https://capacitorjs.com): el mismo código de `www/` corre dentro de
un WebView nativo, con icono, pantalla de inicio, botón "atrás" del sistema,
barra de estado según el tema, recordatorios diarios con notificaciones y
exportación de copias vía el menú "Compartir".
Funciona sin conexión (las fuentes van incluidas).

### Recordatorios diarios

En **Ajustes → Recordatorios** (solo en la app Android) puedes activar dos avisos
con la hora que quieras:

- **Resumen de la mañana:** cuántas misiones diarias y hábitos tienes hoy, y tu racha.
- **Aviso de pendientes:** solo si te falta algo; nombra las misiones y hábitos
  pendientes y avisa si tu racha está en riesgo.

La primera vez Android pide permiso para mostrar notificaciones. Los avisos se
programan para los próximos 14 días y se recalculan cada vez que abres la app o
cambias algo, así que el texto refleja lo que de verdad falta. Sobreviven a
reinicios del teléfono. Usan alarmas inexactas (sin permiso especial), así que
pueden llegar unos minutos tarde. Si no abres la app en 14 días, dejan de sonar
hasta la próxima vez que la abras.

### Instalar el APK en tu teléfono

1. Descarga el APK:
   - desde **GitHub → Actions → "APK Android" → la última ejecución →
     Artifacts → `LifeQuest-debug-apk`** (se compila en cada push), o
   - compílalo tú mismo (ver abajo).
2. Pásalo al teléfono y ábrelo. Android pedirá permitir "instalar apps de
   origen desconocido" para la app con la que lo abras (Archivos, Chrome…).

Es un APK *debug*, firmado con una clave de desarrollo: sirve para uso
personal. Para que los APK de Actions se instalen encima de los anteriores (y
funcione el login con Google) hay que guardar la clave como secreto de GitHub:
ver el paso 7 de [docs/firebase-setup.md](docs/firebase-setup.md). Para publicarlo en Google Play hace falta un build *release* firmado
con tu propia clave (`./gradlew bundleRelease` + keystore).

### Compilar

Requisitos: Node 18+, JDK 21 y Android SDK (lo más fácil: instalar Android Studio).

```bash
npm install
npm run android:apk      # sincroniza www/ → android/ y genera el APK
# resultado: android/app/build/outputs/apk/debug/app-debug.apk

npm run android:open     # abre el proyecto en Android Studio
npm run android:run      # instala y ejecuta en un teléfono/emulador conectado
```

Tras cambiar algo en `www/`, ejecuta `npm run android:sync` (lo hacen ya los
scripts `android:apk` y `android:run`). Para regenerar el icono y la pantalla de
inicio a partir de `assets/`, usa `npm run icons`.

### Datos en el teléfono

Se guardan en IndexedDB dentro del almacenamiento interno de la app: se
conservan al cerrar la app, reiniciar el teléfono o actualizarla, y solo se
pierden si la desinstalas o borras sus datos. Usa **Ajustes → Copia de
seguridad → Exportar** para guardar una copia en Drive, correo, etc.

## Versión web

La carpeta `www/` sigue siendo una web estática independiente:

- **Local:** abre `www/index.html` con doble clic (funciona con `file://`).
- **Servidor local:** `npm start` → http://localhost:8080.
- **Desplegar:** sube `www/` a cualquier hosting estático.

## Pruebas

```bash
npm test   # node --test, sin dependencias
```

## Estructura

```
www/                    App web (lo que Capacitor empaqueta)
 index.html             Estructura de la página y orden de carga de scripts
 css/                   Estilos (tema claro/oscuro) y fuentes locales
 fonts/                 Cinzel, Manrope, JetBrains Mono (OFL)
 vendor/                Runtime de Capacitor y SDK de Firebase (copiados de node_modules)
 js/
  config.js             Valores por defecto (categorías, recompensas, escalera de hábitos)
  utils.js              Fechas (locales), ids, escape de HTML
  rules.js              Motor de reglas: funciones puras (nivel, recompensas, rachas)
  state.js              Estado en memoria
  storage/adapters.js   Backends: IndexedDB → localStorage → memoria
  store.js              Persistencia de dominio (misma API que la versión original)
  sync/sync.js          Motor de sincronización con la nube
  cloud/                Firebase: configuración, login con Google y proveedor Firestore
  game.js               Acciones de juego (aplica reglas + persiste; sin DOM)
  reminders.js          Planificador de recordatorios (puro: qué avisar y cuándo)
  ui/common.js          Helpers de interfaz (toast, iconos, categorías)
  ui/character.js       Tarjeta de personaje
  ui/views/*.js         Una vista por pestaña
  platform/native.js    Integración Android (atrás, barra de estado, compartir, notificaciones)
  app.js                Arranque, pestañas, tema, eventos, sincronía entre pestañas
android/                Proyecto nativo de Android generado por Capacitor
assets/                 Imágenes fuente del icono y la pantalla de inicio
capacitor.config.json   Configuración de Capacitor (id de la app, splash)
.github/workflows/      Compilación automática del APK
docs/firebase-setup.md  Guía para crear el proyecto de Firebase
firestore.rules         Reglas de seguridad de la base de datos en la nube
tests/                  Pruebas de reglas y persistencia (Node)
```

Capas, de más interna a más externa:

```
Rules (puro)  ←  Game (reglas + estado)  ←  UI (render)
                        ↓
                      store  →  adaptador (IndexedDB | localStorage | memoria | nube…)
```

Se usan scripts clásicos que registran su parte en `window.LifeQuest` (en lugar de
módulos ES) para que la app abra directamente desde el disco: los navegadores
bloquean `import` en `file://`.

## Persistencia

- **IndexedDB** es el backend principal: asíncrono, escribe registro a registro
  (no reescribe todo en cada cambio) y admite mucho más volumen que localStorage,
  lo que importa porque el historial de misiones y las transacciones crecen sin
  límite.
- Si IndexedDB no está disponible se usa **localStorage**, y como último recurso
  memoria (con aviso).
- Se solicita `navigator.storage.persist()` para que el navegador no borre los datos
  bajo presión de espacio.
- Con varias pestañas abiertas, un `BroadcastChannel` hace que las demás recarguen
  el estado cuando una guarda, para no pisar datos.

## Cuenta de Google y sincronización en la nube

Con **Ajustes → Cuenta y sincronización → Iniciar sesión con Google** los datos
se guardan en Firebase (Cloud Firestore) y se sincronizan entre dispositivos.
Sin iniciar sesión, o si Firebase no está configurado, la app sigue siendo
100 % local. La primera vez hay que crear el proyecto de Firebase:
**[docs/firebase-setup.md](docs/firebase-setup.md)**.

Cómo funciona:

- La fuente de verdad sigue siendo el almacenamiento local: la app funciona
  igual sin conexión y sincroniza al abrirse, al volver a ella, al recuperar la
  conexión y unos segundos después de cada cambio.
- Cada sincronización baja lo nuevo de la nube, lo fusiona y sube lo local.
  Los conflictos se resuelven registro a registro: **gana el cambio más
  reciente**. Los borrados viajan como "lápidas".
- Al iniciar sesión en un dispositivo nuevo que solo tiene las misiones de
  ejemplo, se descartan para no duplicarlas. Si el dispositivo ya tenía datos
  propios, se fusionan con los de la cuenta.
- Antes de aplicar los castigos del día se sincroniza (máximo 6–8 s), para no
  castigar una misión que ya completaste en otro dispositivo.
- En Android el login es nativo (selector de cuentas de Google). En la web usa
  una ventana emergente y requiere http/https (`npm start`), no `file://`.
- Cada cuenta solo puede leer y escribir sus datos (`firestore.rules`).

Limitación conocida: el personaje (XP, monedas, racha) es un único registro. Si
usas dos dispositivos **sin conexión a la vez** y ganas XP en ambos, al
sincronizar se queda el más reciente.

Piezas:

| Archivo | Qué hace |
| --- | --- |
| `www/js/sync/sync.js` | Motor de sincronización, independiente del proveedor |
| `www/js/cloud/firestore-provider.js` | Proveedor sobre Firestore: `users/{uid}/…` y cursor por hora del servidor |
| `www/js/cloud/cloud.js` | Carga Firebase bajo demanda, login con Google y enlace de la cuenta |
| `www/js/cloud/firebase-config.js` | Tu `firebaseConfig` (null = nube desactivada) |
| `firestore.rules`, `firebase.json` | Reglas de seguridad y emuladores locales |

Otro backend (Supabase, API propia…) solo necesita implementar `pull(cursor)` y
`push(changes)` (ver `www/js/sync/sync.js`).
