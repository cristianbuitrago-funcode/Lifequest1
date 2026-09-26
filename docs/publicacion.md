# Proteger y publicar LifeQuest

Lista de pasos para (1) proteger el nombre y el logo, (2) publicar en Google
Play y (3) proteger el código. Es una guía práctica, **no asesoría legal**:
confirma los requisitos vigentes en las páginas oficiales y, si vas a invertir
o vender, consulta con un abogado de propiedad intelectual.

## 1. Marca "LifeQuest" en la Superintendencia de Industria y Comercio (SIC)

La marca protege el **nombre y el logo** (el derecho de autor no protege nombres).

1. **Búsqueda de antecedentes** en el sistema de la SIC (SIPI) para comprobar
   que no existe una marca igual o parecida en las mismas clases.
2. **Clases de Niza** habituales para una app:
   - **Clase 9**: software / aplicaciones descargables.
   - **Clase 42**: software como servicio, diseño y desarrollo de software (si
     ofreces servicios en línea).
3. **Tipo de marca**: mixta (nombre + logo) o una nominativa ("LifeQuest") y
   otra figurativa (logo). Usa `assets/logo-original.jpg`.
4. Presenta la solicitud en línea en sic.gov.co y paga la tasa vigente (hay
   tarifas reducidas para personas naturales y pymes).
5. Sigue el trámite: publicación en la Gaceta, posibles oposiciones y decisión.

## 2. Publicar en Google Play

1. **Cuenta de desarrollador** en play.google.com/console, con pago único y
   verificación de identidad, a nombre de Cristian Camilo Buitrago Espinosa.
2. **Build de producción**: Google Play pide un **AAB firmado con una clave de
   subida** (no la clave de depuración actual). Hay que crear esa clave,
   guardarla en un lugar seguro con copia de respaldo y compilar con
   `./gradlew bundleRelease`. Pídele a Claude que lo configure.
3. **Firebase + Play App Signing**: Google vuelve a firmar la app con su propia
   clave. Añade el SHA-1 de la **clave de firma de la app** (Play Console →
   Integridad de la app) en Firebase → Configuración → Android, y vuelve a
   descargar `google-services.json`. Si no, el login con Google fallará en la
   versión de la tienda.
4. **Política de privacidad pública**: Google exige una URL. El texto está en
   `www/legal/privacidad.html`; publícalo, por ejemplo, con GitHub Pages (en un
   repositorio público aparte si el principal pasa a privado) o Google Sites.
   **Antes, reemplaza `[correo de contacto]`** en los archivos de `www/legal/` y
   en `LICENSE`.
5. **Eliminación de cuenta**: la app ya permite eliminar la cuenta desde Ajustes
   → Cuenta y sincronización → "Eliminar mi cuenta". Google también pide un
   enlace web donde solicitarla: puede ser la sección 5 de la política de
   privacidad.
6. **Sección "Seguridad de los datos"** (respuestas según lo que hace la app):
   - Datos recopilados, solo si se inicia sesión: nombre, correo, ID de usuario,
     información financiera introducida por el usuario y actividad en la app
     (misiones, hábitos). Finalidad: funcionalidad de la app (sincronización).
   - No se comparten con terceros para publicidad ni se venden.
   - Cifrados en tránsito (HTTPS). El usuario puede solicitar su eliminación.
7. **Ficha de la tienda**: icono de 512×512 (`www/img/logo-512.png`), gráfico
   destacado de 1024×500, al menos 2 capturas del teléfono, descripción corta y
   larga, categoría (Productividad) y clasificación de contenido.
8. Empieza con una **prueba interna o cerrada** antes de la producción (las
   cuentas personales nuevas deben hacer una prueba cerrada con testers antes de
   publicar).

## 3. Proteger el código

- **Repositorio privado**: GitHub → Settings → Danger Zone → Change visibility.
  Si nadie ve el código, nadie lo copia.
- `LICENSE` deja claro que todos los derechos están reservados.
- **Registro en la DNDA**: consulta primero con la DNDA o con un abogado cómo
  tratan el software desarrollado con asistencia de IA, y declara con
  transparencia tu aporte (idea, reglas del juego, diseño funcional, decisiones
  de producto) y el uso de IA.
