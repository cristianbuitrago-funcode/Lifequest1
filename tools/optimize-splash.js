// Tras `capacitor-assets generate`: el splash es igual en claro y oscuro, así que se
// borran las variantes nocturnas y el resto se convierte a WebP (de ~8 MB a ~0,3 MB).
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
(async () => {
  for (const dir of fs.readdirSync(root)){
    const full = path.join(root, dir);
    if (dir.startsWith('drawable') && dir.includes('night')){ fs.rmSync(full, { recursive: true, force: true }); continue; }
    const png = path.join(full, 'splash.png');
    if (!fs.existsSync(png)) continue;
    await sharp(png).webp({ quality: 82 }).toFile(png.replace(/\.png$/, '.webp'));
    fs.unlinkSync(png);
  }
})();
