/*
 * Catálogo base de la Tienda.
 *
 * Para añadir, cambiar o quitar productos del catálogo base basta con editar
 * esta lista. Desde la app (Tienda → Administrar) también se pueden crear
 * productos nuevos, editar estos o retirarlos; esos cambios se guardan como
 * datos del usuario (colección `shopProducts`) y se superponen a esta lista.
 *
 * Producto:
 *   id           identificador único (no cambiarlo una vez publicado)
 *   name         nombre
 *   description  descripción corta
 *   icon         emoji o ruta de imagen (p. ej. 'img/shop/espada.png')
 *   price        precio en monedas (las mismas del juego)
 *   category     id de CATEGORIES
 *   status       'disponible' | 'no_disponible' | 'bloqueado'
 *   unlockLevel  (opcional) con status 'bloqueado', se desbloquea al llegar a ese nivel
 *   purchase     'unica' (se compra una vez y se equipa) | 'reutilizable' (se acumula y se usa)
 *   effect       { kind, value } — qué hace al equiparlo o usarlo (ver EFFECT_KINDS)
 */
(function (LQ) {
  "use strict";

  const CATEGORIES = [
    { id: 'temas',     emoji: '🎨', label: 'Temas' },
    { id: 'fondos',    emoji: '🖼️', label: 'Fondos' },
    { id: 'avatares',  emoji: '👤', label: 'Avatares' },
    { id: 'rpg',       emoji: '⚔️', label: 'Objetos RPG' },
    { id: 'efectos',   emoji: '✨', label: 'Efectos' },
    { id: 'insignias', emoji: '🏆', label: 'Insignias' },
    { id: 'sonidos',   emoji: '🎵', label: 'Sonidos' },
    { id: 'marcos',    emoji: '🛡️', label: 'Marcos' },
    { id: 'mascotas',  emoji: '🐉', label: 'Mascotas' },
    { id: 'auras',     emoji: '🔥', label: 'Auras de perfil' }
  ];

  // Tipos de efecto que entiende la app. `slot` = hueco del perfil que ocupa al equiparlo.
  const EFFECT_KINDS = {
    theme:       { slot: 'theme',      label: 'Tema de color' },
    background:  { slot: 'background', label: 'Fondo' },
    avatar:      { slot: 'avatar',     label: 'Avatar' },
    frame:       { slot: 'frame',      label: 'Marco de avatar' },
    pet:         { slot: 'pet',        label: 'Mascota' },
    celebration: { slot: 'effect',     label: 'Efecto de celebración' },
    aura:        { slot: 'aura',       label: 'Aura de perfil' },
    sound:       { slot: 'sound',      label: 'Sonidos' },
    badge:       { slot: 'badges',     label: 'Insignia', multi: 3 },
    xpBoost:     { consumable: true,   label: 'Poción de XP doble' },
    shield:      { consumable: true,   label: 'Escudo de racha' },
    collectible: {                     label: 'Coleccionable' }
  };

  const PRODUCTS = [
    // 🎨 Temas (colores de acento; se adaptan a modo claro y oscuro)
    { id: 'tema-oro', name: 'Oro real', description: 'Acentos dorados dignos de una leyenda.', icon: '👑', price: 80, category: 'temas', status: 'disponible', purchase: 'unica',
      effect: { kind: 'theme', value: { light: ['#a8740a', '#c2410c'], dark: ['#f0c451', '#ff9f43'] } } },
    { id: 'tema-esmeralda', name: 'Bosque esmeralda', description: 'Verdes profundos para mentes serenas.', icon: '🌿', price: 80, category: 'temas', status: 'disponible', purchase: 'unica',
      effect: { kind: 'theme', value: { light: ['#0f7a52', '#0e7490'], dark: ['#3fe0a5', '#5eead4'] } } },
    { id: 'tema-carmesi', name: 'Carmesí', description: 'El color de los guerreros.', icon: '🩸', price: 100, category: 'temas', status: 'disponible', purchase: 'unica',
      effect: { kind: 'theme', value: { light: ['#be123c', '#c2410c'], dark: ['#ff6b85', '#ffa94d'] } } },
    { id: 'tema-oceano', name: 'Abismo oceánico', description: 'Azules del fondo del mar.', icon: '🌊', price: 120, category: 'temas', status: 'bloqueado', unlockLevel: 3, purchase: 'unica',
      effect: { kind: 'theme', value: { light: ['#1d4ed8', '#0891b2'], dark: ['#60a5fa', '#22d3ee'] } } },

    // 🖼️ Fondos
    { id: 'fondo-aurora', name: 'Aurora', description: 'Luces del norte detrás de tus misiones.', icon: '🌌', price: 60, category: 'fondos', status: 'disponible', purchase: 'unica',
      effect: { kind: 'background', value: 'radial-gradient(1200px 600px at 10% -10%, rgba(63,214,232,.20), transparent 60%), radial-gradient(900px 500px at 100% 0%, rgba(155,131,255,.22), transparent 60%)' } },
    { id: 'fondo-atardecer', name: 'Atardecer', description: 'Cálido como el final de un buen día.', icon: '🌅', price: 60, category: 'fondos', status: 'disponible', purchase: 'unica',
      effect: { kind: 'background', value: 'radial-gradient(1000px 600px at 50% -20%, rgba(255,159,67,.25), transparent 60%), radial-gradient(800px 400px at 0% 100%, rgba(255,107,133,.15), transparent 60%)' } },
    { id: 'fondo-tesoro', name: 'Sala del tesoro', description: 'Destellos dorados por todas partes.', icon: '💎', price: 140, category: 'fondos', status: 'bloqueado', unlockLevel: 5, purchase: 'unica',
      effect: { kind: 'background', value: 'radial-gradient(700px 400px at 90% 10%, rgba(240,196,81,.28), transparent 60%), radial-gradient(700px 400px at 0% 60%, rgba(240,196,81,.14), transparent 60%)' } },

    // 👤 Avatares
    { id: 'avatar-guerrero', name: 'Guerrero', description: 'Espada en mano, siempre listo.', icon: '🧙‍♂️', price: 30, category: 'avatares', status: 'disponible', purchase: 'unica', effect: { kind: 'avatar', value: '🧙‍♂️' } },
    { id: 'avatar-hechicera', name: 'Hechicera', description: 'Domina la magia de la constancia.', icon: '🧝‍♀️', price: 30, category: 'avatares', status: 'disponible', purchase: 'unica', effect: { kind: 'avatar', value: '🧝‍♀️' } },
    { id: 'avatar-ninja', name: 'Ninja', description: 'Sigiloso y productivo.', icon: '🥷', price: 45, category: 'avatares', status: 'disponible', purchase: 'unica', effect: { kind: 'avatar', value: '🥷' } },
    { id: 'avatar-astronauta', name: 'Astronauta', description: 'Tus metas están en órbita.', icon: '🧑‍🚀', price: 60, category: 'avatares', status: 'disponible', purchase: 'unica', effect: { kind: 'avatar', value: '🧑‍🚀' } },
    { id: 'avatar-rey', name: 'Monarca', description: 'Solo para quienes gobiernan su tiempo.', icon: '🤴', price: 150, category: 'avatares', status: 'bloqueado', unlockLevel: 8, purchase: 'unica', effect: { kind: 'avatar', value: '🤴' } },

    // ⚔️ Objetos RPG (consumibles)
    { id: 'pocion-xp', name: 'Poción de XP doble', description: 'Duplica la XP de tus próximas 3 misiones.', icon: '🧪', price: 40, category: 'rpg', status: 'disponible', purchase: 'reutilizable', effect: { kind: 'xpBoost', value: 3 } },
    { id: 'escudo-racha', name: 'Escudo de racha', description: 'Si fallas un día, evita el castigo y protege tu racha.', icon: '🛡️', price: 60, category: 'rpg', status: 'disponible', purchase: 'reutilizable', effect: { kind: 'shield', value: 1 } },

    // ✨ Efectos de celebración
    { id: 'efecto-estrellas', name: 'Lluvia de estrellas', description: 'Celebra tus logros con estrellas fugaces.', icon: '🌠', price: 70, category: 'efectos', status: 'disponible', purchase: 'unica', effect: { kind: 'celebration', value: 'estrellas' } },
    { id: 'efecto-monedas', name: 'Lluvia de monedas', description: 'Que lluevan monedas en cada victoria.', icon: '🪙', price: 90, category: 'efectos', status: 'disponible', purchase: 'unica', effect: { kind: 'celebration', value: 'monedas' } },
    { id: 'efecto-fuegos', name: 'Fuegos artificiales', description: 'Explosiones de color al celebrar.', icon: '🎆', price: 120, category: 'efectos', status: 'bloqueado', unlockLevel: 4, purchase: 'unica', effect: { kind: 'celebration', value: 'fuegos' } },

    // 🏆 Insignias (hasta 3 visibles en tu perfil)
    { id: 'insignia-madrugador', name: 'Madrugador', description: 'Para quienes empiezan el día con todo.', icon: '🌄', price: 20, category: 'insignias', status: 'disponible', purchase: 'unica', effect: { kind: 'badge', value: '🌄' } },
    { id: 'insignia-ahorrador', name: 'Ahorrador', description: 'Cada moneda cuenta.', icon: '🐖', price: 30, category: 'insignias', status: 'disponible', purchase: 'unica', effect: { kind: 'badge', value: '🐖' } },
    { id: 'insignia-lector', name: 'Lector voraz', description: 'Páginas y páginas de sabiduría.', icon: '📚', price: 30, category: 'insignias', status: 'disponible', purchase: 'unica', effect: { kind: 'badge', value: '📚' } },
    { id: 'insignia-atleta', name: 'Atleta', description: 'Cuerpo en movimiento.', icon: '🏃', price: 30, category: 'insignias', status: 'disponible', purchase: 'unica', effect: { kind: 'badge', value: '🏃' } },
    { id: 'insignia-leyenda', name: 'Leyenda', description: 'Reservada para el nivel 10.', icon: '🏅', price: 200, category: 'insignias', status: 'bloqueado', unlockLevel: 10, purchase: 'unica', effect: { kind: 'badge', value: '🏅' } },

    // 🎵 Sonidos (se reproducen al completar, pagar y comprar)
    { id: 'sonido-campanas', name: 'Campanas', description: 'Un tintineo suave al completar.', icon: '🔔', price: 40, category: 'sonidos', status: 'disponible', purchase: 'unica', effect: { kind: 'sound', value: 'campanas' } },
    { id: 'sonido-arcade', name: 'Arcade 8 bits', description: 'Sonido retro de videojuego.', icon: '👾', price: 50, category: 'sonidos', status: 'disponible', purchase: 'unica', effect: { kind: 'sound', value: 'arcade' } },
    { id: 'sonido-fanfarria', name: 'Fanfarria', description: 'Trompetas para cada victoria.', icon: '🎺', price: 80, category: 'sonidos', status: 'bloqueado', unlockLevel: 3, purchase: 'unica', effect: { kind: 'sound', value: 'fanfarria' } },

    // 🛡️ Marcos de avatar
    { id: 'marco-oro', name: 'Marco dorado', description: 'Borde de oro pulido.', icon: '🟡', price: 60, category: 'marcos', status: 'disponible', purchase: 'unica', effect: { kind: 'frame', value: 'oro' } },
    { id: 'marco-neon', name: 'Marco neón', description: 'Brillo cian que late.', icon: '🔵', price: 80, category: 'marcos', status: 'disponible', purchase: 'unica', effect: { kind: 'frame', value: 'neon' } },
    { id: 'marco-runas', name: 'Marco rúnico', description: 'Runas antiguas que giran a tu alrededor.', icon: '🔮', price: 130, category: 'marcos', status: 'bloqueado', unlockLevel: 6, purchase: 'unica', effect: { kind: 'frame', value: 'runas' } },

    // 🐉 Mascotas
    { id: 'mascota-gato', name: 'Gato explorador', description: 'Te acompaña en cada misión.', icon: '🐈', price: 100, category: 'mascotas', status: 'disponible', purchase: 'unica', effect: { kind: 'pet', value: '🐈' } },
    { id: 'mascota-buho', name: 'Búho sabio', description: 'Ideal para noches de estudio.', icon: '🦉', price: 120, category: 'mascotas', status: 'disponible', purchase: 'unica', effect: { kind: 'pet', value: '🦉' } },
    { id: 'mascota-dragon', name: 'Dragón bebé', description: 'Crece contigo. Nivel 5 requerido.', icon: '🐉', price: 250, category: 'mascotas', status: 'bloqueado', unlockLevel: 5, purchase: 'unica', effect: { kind: 'pet', value: '🐉' } },

    // 🔥 Auras de perfil
    { id: 'aura-fuego', name: 'Aura de fuego', description: 'Tu tarjeta arde con tu racha.', icon: '🔥', price: 150, category: 'auras', status: 'disponible', purchase: 'unica', effect: { kind: 'aura', value: 'fuego' } },
    { id: 'aura-hielo', name: 'Aura de hielo', description: 'Calma helada y concentración.', icon: '❄️', price: 150, category: 'auras', status: 'disponible', purchase: 'unica', effect: { kind: 'aura', value: 'hielo' } },
    { id: 'aura-arcana', name: 'Aura arcana', description: 'Energía mística en movimiento.', icon: '🌀', price: 220, category: 'auras', status: 'bloqueado', unlockLevel: 7, purchase: 'unica', effect: { kind: 'aura', value: 'arcana' } }
  ];

  LQ.ShopCatalog = { CATEGORIES, EFFECT_KINDS, PRODUCTS };
})(globalThis.LifeQuest = globalThis.LifeQuest || {});
