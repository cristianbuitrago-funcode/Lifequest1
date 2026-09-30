// Iconos de la versión web instalable (iPhone y navegadores):
//   img/apple-touch-icon.png  180×180 (pantalla de inicio del iPhone)
//   img/maskable-512.png      512×512 con margen de seguridad (Android/Chrome recortan en círculo)
// Uso: node tools/pwa-icons.js
const path = require('path');
const sharp = require('sharp');
const img = path.join(__dirname, '..', 'www', 'img');
(async () => {
  const src = path.join(img, 'logo-512.png');
  await sharp(src).resize(180, 180).png({ compressionLevel: 9 }).toFile(path.join(img, 'apple-touch-icon.png'));
  const inner = await sharp(src).resize(400, 400).toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 3, background: '#030915' } })
    .composite([{ input: inner, top: 56, left: 56 }]).png({ compressionLevel: 9 })
    .toFile(path.join(img, 'maskable-512.png'));
})();
