# LifeQuest

Convierte tus tareas diarias en un RPG: misiones con XP y monedas, niveles, rachas,
hábitos con escalera de recompensas y un módulo de finanzas personales.

Es una app web **estática y sin dependencias**: HTML + CSS + JavaScript puro, sin
build. Los datos se guardan en el navegador (IndexedDB) y se conservan entre sesiones.

## Uso

- **Local:** abre `index.html` con doble clic. Funciona con `file://`, sin servidor.
- **Servidor local (opcional):** `npm start` (usa `python3 -m http.server 8080`) y
  entra a http://localhost:8080.
- **Desplegar:** sube la carpeta tal cual a cualquier hosting estático
  (GitHub Pages, Netlify, Vercel, Cloudflare Pages…).

> Los datos viven en el navegador y en el origen donde abras la app: `file://` y
> `https://tu-dominio` son almacenes distintos. Usa **Ajustes → Copia de
> seguridad** para exportar/importar tus datos en JSON.

## Pruebas

```bash
npm test   # node --test, sin dependencias (requiere Node 18+)
```

## Estructura

```
index.html              Estructura de la página y orden de carga de scripts
css/styles.css          Estilos (tema claro/oscuro automático + manual)
js/
  config.js             Valores por defecto (categorías, recompensas, escalera de hábitos)
  utils.js              Fechas (locales), ids, escape de HTML
  rules.js              Motor de reglas: funciones puras (nivel, recompensas, rachas)
  state.js              Estado en memoria
  storage/adapters.js   Backends: IndexedDB → localStorage → memoria
  store.js              Persistencia de dominio (misma API que la versión original)
  sync/sync.js          Punto de extensión para nube y cuentas (sin proveedor aún)
  game.js               Acciones de juego (aplica reglas + persiste; sin DOM)
  ui/common.js          Helpers de interfaz (toast, iconos, categorías)
  ui/character.js       Tarjeta de personaje
  ui/views/*.js         Una vista por pestaña
  app.js                Arranque, pestañas, tema, eventos, sincronía entre pestañas
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

## Preparado para nube y cuentas

- Cada registro tiene un id único global (prefijo de tiempo + aleatorio) y `updatedAt`.
- Los borrados dejan una lápida (`tombstones`) con `deletedAt`.
- `store.changesSince(ts)` y `store.applyRemote(cambios)` implementan la fusión
  *last-write-wins*.
- `LifeQuest.sync.register(proveedor)` + `LifeQuest.sync.syncNow()` hacen pull →
  merge → push. Un proveedor solo necesita `getUser()`, `pull(since)` y
  `push(changes)` (ver `js/sync/sync.js`), por ejemplo sobre Supabase o Firebase.
- `store.init({ profile: userId })` aísla los datos de cada cuenta en su propia base
  local (`lifequest:<userId>`).
- Cualquier backend puede implementar la interfaz de `js/storage/adapters.js`.
