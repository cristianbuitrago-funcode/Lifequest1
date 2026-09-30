# LifeCoinQuest en iPhone

Hay **dos formas** de usar LifeCoinQuest en un iPhone.

## 1. Versión web instalable (gratis, ya disponible)

Es la misma app, abierta desde Safari y agregada a la pantalla de inicio: se ve
a pantalla completa, con su icono, y **funciona sin internet** (los datos se
guardan en el iPhone). Si inicias sesión con Google se sincroniza con Android.

**Publicarla (una sola vez):**
1. GitHub → repositorio → **Settings → Pages → Build and deployment → Source:
   "GitHub Actions"**.
2. Cada vez que se actualiza `main`, el flujo *Web para iPhone (GitHub Pages)*
   la publica en `https://cristianbuitrago-funcode.github.io/Lifequest1/`.
3. Firebase → **Authentication → Configuración → Dominios autorizados → Agregar
   dominio**: `cristianbuitrago-funcode.github.io` (para el login con Google).

**Instalarla en el iPhone:** abre el enlace en **Safari** → botón **Compartir**
(cuadrado con flecha ⬆︎) → **"Agregar a inicio"**. La app también lo explica
con un aviso la primera vez.

**Límites de la versión web en iPhone** (los pone Apple, no la app):
- **No hay recordatorios** con la app cerrada (Safari no deja programar avisos).
- Si no la abres en varias semanas, iOS puede borrar los datos de las apps web:
  inicia sesión con Google (se guardan en la nube) o exporta una copia.

## 2. App nativa de iPhone (App Store / TestFlight)

El proyecto está en `ios/` (Capacitor 8, Swift Package Manager) y comparte todo
el código de `www/` con Android. Diferencias con Android:
- **Recordatorios:** los programa el sistema de Apple y **suenan con la app
  cerrada**. iOS permite como máximo 64 avisos pendientes por app: se
  programan los 60 más próximos y, al abrir la app, los siguientes.
- No hay ajustes de batería ni "alarmas exactas": en iPhone no hacen falta.

Cada cambio en `ios/` o `www/` se compila solo en una Mac de GitHub (flujo
*App iPhone*), se abre en un simulador de iPhone y se guarda una captura
(Actions → la ejecución → *Artifacts*).

**Para publicarla hace falta:**
1. **Cuenta de Apple Developer** (99 USD al año) en developer.apple.com.
2. **Firebase para iPhone:** Firebase → Configuración del proyecto → Tus apps →
   **Agregar app → iOS**, ID del paquete `com.cristianbuitrago.lifequest` →
   descargar `GoogleService-Info.plist` y pásaselo a Claude: hay que añadirlo a
   `ios/App/App/` y registrar su `REVERSED_CLIENT_ID` como esquema de URL para
   el login con Google.
3. **Firmar y subir:** con una Mac y Xcode (abrir `ios/App/App.xcodeproj`,
   elegir el equipo de desarrollador, *Product → Archive → Distribute*), o sin
   Mac, desde GitHub Actions con los certificados de Apple guardados como
   secretos (pídele a Claude que lo configure cuando tengas la cuenta).
4. En App Store Connect: ficha de la app, capturas, política de privacidad
   (`www/legal/privacidad.html`) y prueba con **TestFlight** antes de publicar.

Comandos útiles (en una Mac):
```bash
npm run ios:sync          # copia www/ y los plugins al proyecto de iPhone
npx cap open ios          # abre Xcode
npm run icons:ios         # regenera icono y pantalla de inicio desde assets/
```
