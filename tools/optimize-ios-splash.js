// Tras `capacitor-assets generate --ios` (npm run icons:ios): el splash es igual en claro y oscuro y en
// todas las escalas, así que se deja UNA imagen comprimida con paleta (de ~9 MB a
// unos cientos de KB) y se quitan las variantes repetidas y las de la plantilla.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const assets = path.join(__dirname, '..', 'ios', 'App', 'App', 'Assets.xcassets');
const dir = path.join(assets, 'Splash.imageset');
(async () => {
  // Icono de la App Store: 1024×1024 sin transparencia (Apple lo exige), comprimido.
  const icon = path.join(assets, 'AppIcon.appiconset', 'AppIcon-512@2x.png');
  if (fs.existsSync(icon)){
    const buf = await sharp(icon).flatten({ background: '#030915' }).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(icon, buf);
  }

  const src = path.join(dir, 'Default@1x~universal~anyany.png');
  if (!fs.existsSync(src)) return;
  const out = path.join(dir, 'splash.png');
  await sharp(src).png({ palette: true, quality: 90, compressionLevel: 9 }).toFile(out);
  fs.readdirSync(dir).filter(f => f.endsWith('.png') && f !== 'splash.png').forEach(f => fs.unlinkSync(path.join(dir, f)));
  fs.writeFileSync(path.join(dir, 'Contents.json'), JSON.stringify({
    images: ['1x', '2x', '3x'].map(scale => ({ idiom: 'universal', filename: 'splash.png', scale })),
    info: { version: 1, author: 'xcode' }
  }, null, 2) + '\n');
})();
