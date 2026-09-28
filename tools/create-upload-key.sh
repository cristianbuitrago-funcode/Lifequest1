#!/usr/bin/env bash
# Crea la clave de SUBIDA de Google Play para LifeCoinQuest (una sola vez).
# Guárdala con su contraseña en un lugar seguro y con copia: si se pierde hay
# que pedir a Google que la restablezca. NUNCA la subas al repositorio.
#
#   bash tools/create-upload-key.sh  ~/lifecoinquest-upload.jks
#
# Luego, para compilar el AAB:
#   export LIFEQUEST_UPLOAD_KEYSTORE=~/lifecoinquest-upload.jks
#   export LIFEQUEST_UPLOAD_STORE_PASSWORD='tu-contraseña'
#   npm run android:bundle      # → android/app/build/outputs/bundle/release/app-release.aab
set -euo pipefail
OUT="${1:-$HOME/lifecoinquest-upload.jks}"
if [ -e "$OUT" ]; then echo "Ya existe $OUT: no se sobrescribe." >&2; exit 1; fi
keytool -genkeypair -v -keystore "$OUT" -alias upload -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Cristian Camilo Buitrago Espinosa, O=LifeCoinQuest, C=CO"
echo
echo "Clave creada en $OUT. Huellas (la SHA-1 va en Firebase si usas la app firmada con ella):"
keytool -list -v -keystore "$OUT" -alias upload | grep -E "SHA1|SHA256"
