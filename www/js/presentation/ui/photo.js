/*
 * Foto de perfil: el usuario la elige de la galería (o la cámara) y aquí se
 * recorta en cuadrado y se reduce a 160×160 JPEG (~10 KB) para guardarla en el
 * perfil y, si lo activa, mostrarla en el ranking y el clan.
 */
(function (LQ) {
  "use strict";

  const ui = LQ.ui;
  const SIZE = 160;

  function loadImage(file){
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
      img.src = url;
    });
  }

  /** Recorta al centro y reduce; devuelve un data URL JPEG. */
  async function toAvatar(file){
    const img = await loadImage(file);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  /** Abre la galería; resuelve con el data URL o null si el usuario cancela. */
  ui.pickPhoto = function(){
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return resolve(null);
        try { resolve(await toAvatar(file)); } catch (e) { reject(e); }
      };
      input.click();
    });
  };

  /** HTML del avatar: foto, avatar de la tienda o una silueta. */
  ui.avatarHtml = function(photo, fallback){
    if (photo) return `<img src="${LQ.utils.escapeHtml(photo)}" alt="">`;
    return fallback ? ui.iconHtml(fallback) : '<span class="avatar-empty">👤</span>';
  };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
