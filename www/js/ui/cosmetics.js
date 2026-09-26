/*
 * Aplica lo equipado en la Tienda: tema de color, fondo, avatar con marco,
 * mascota, insignias y aura de la tarjeta del personaje.
 */
(function (LQ) {
  "use strict";

  const ui = LQ.ui;
  const root = document.documentElement;

  function isDark(){
    const t = root.getAttribute('data-theme');
    if (t) return t === 'dark';
    return !!(globalThis.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function luminance(hex){
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0;
    const [r, g, b] = [0, 2, 4].map(i => {
      const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function applyCosmetics(){
    const eq = LQ.Shop.equippedProducts();

    // Tema: sustituye los colores de acento (según modo claro/oscuro)
    const theme = eq.theme && eq.theme.effect.value;
    if (theme && theme.light && theme.dark){
      const [a, b] = isDark() ? theme.dark : theme.light;
      root.style.setProperty('--accent', a);
      root.style.setProperty('--accent-2', b);
      // Texto legible sobre el acento (oscuro si el acento es muy claro, p. ej. dorado)
      root.style.setProperty('--on-accent', luminance(a) > 0.45 ? '#1c1a2e' : '#ffffff');
    } else {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-2');
      root.style.removeProperty('--on-accent');
    }

    // Fondo
    const bg = eq.background && eq.background.effect.value;
    document.body.style.backgroundImage = bg || '';
    document.body.classList.toggle('has-bg', !!bg);

    // Avatar + marco
    const av = document.getElementById('charAvatar');
    if (av){
      const avatar = eq.avatar && eq.avatar.effect.value;
      av.hidden = !avatar;
      av.innerHTML = avatar ? ui.iconHtml(avatar) : '';
      av.className = 'char-avatar' + (eq.frame ? ' frame-' + eq.frame.effect.value : '');
    }

    // Mascota
    const pet = document.getElementById('charPet');
    if (pet){
      pet.hidden = !eq.pet;
      pet.innerHTML = eq.pet ? ui.iconHtml(eq.pet.effect.value) : '';
      pet.title = eq.pet ? eq.pet.name : '';
    }

    // Insignias
    const badges = document.getElementById('charBadges');
    if (badges){
      badges.hidden = !eq.badges.length;
      badges.innerHTML = eq.badges.map(b => `<span title="${LQ.utils.escapeHtml(b.name)}">${ui.iconHtml(b.effect.value || b.icon)}</span>`).join('');
    }

    // Aura
    const card = document.getElementById('charCard');
    if (card){
      card.className = 'char-card' + (eq.aura ? ' aura-' + eq.aura.effect.value : '');
    }
  }

  ui.applyCosmetics = applyCosmetics;
  ui.isDarkMode = isDark;
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
