/**
 * Рисованные аватары для демо-команды на странице «О нас».
 *
 * Это НЕ фотографии и не портреты живых людей — намеренно. Стоковое фото реального
 * человека, подписанное «Head of Support», выдаёт его за сотрудника магазина: лицензии
 * Unsplash и Pexels прав на изображение человека не передают, а обратный поиск по картинке
 * находит то же лицо ещё в трёх чужих «командах». Рисунок такого вопроса не создаёт.
 *
 * Все четыре собираются одним шаблоном: одинаковая посадка головы, один размер глаз, одна
 * форма плеч. Меняются только волосы, тон кожи и оттенок фона — иначе набор читается как
 * коллаж из разных источников, а не как команда.
 *
 * Оттенок фона у каждого — тот же, что витрина считает из его имени (см. avatarHue в
 * about-us.tsx). Поэтому кружок с буквой и кружок с аватаром одного цвета: заменив одно
 * другим, карточка не меняет палитру.
 *
 * Запуск:  node seeds/assets/team/build-avatars.js
 * Растеризация в PNG — отдельно (to-png.html рядом), потому что медиатека SVG не принимает.
 */

const fs = require("fs");
const path = require("path");

/** Светлый и глубокий тон фона — ровно те, что даёт CSS-градиент кружка с буквой. */
const BACKDROPS = {
  332: { light: "#ffe6f1", deep: "#e79dbf", cloth: "#a63f76" },
  185: { light: "#e6fdff", deep: "#9de0e7", cloth: "#3fa0a6" },
  296: { light: "#fde6ff", deep: "#e29de7", cloth: "#9c3fa6" },
  216: { light: "#e6f0ff", deep: "#9dbae7", cloth: "#3f6da6" },
};

/**
 * Волосы — единственное, что различает силуэты. Всё остальное общее, поэтому формы заданы
 * одна под другую: каждая опирается на ту же окружность головы (центр 50,42, радиусы 19×22).
 */
const HAIR = {
  /** Длинные, обрамляют лицо и спускаются на плечи. */
  long: (c) => `
    <path d="M50 16c-16 0-27 11-27 27 0 14 1 25 4 36h9c-4-15-5-27-3-36 8 5 26 5 34 0 2 9 1 21-3 36h9c3-11 4-22 4-36 0-16-11-27-27-27z" fill="${c}"/>`,
  /** Короткие, ровная линия роста. */
  short: (c) => `
    <path d="M30 43c0-13 9-23 20-23s20 10 20 23c-2-9-9-14-20-14s-18 5-20 14z" fill="${c}"/>`,
  /** Убраны назад в пучок. */
  bun: (c) => `
    <circle cx="50" cy="16" r="8" fill="${c}"/>
    <path d="M30 45c0-15 9-25 20-25s20 10 20 25c-1-11-8-17-20-17s-19 6-20 17z" fill="${c}"/>`,
  /** Короткие с пробором на бок. */
  parted: (c) => `
    <path d="M30 44c0-14 9-24 20-24 8 0 14 3 17 9-6 5-19 8-30 6-4 1-6 4-7 9z" fill="${c}"/>`,
};

/** Очки — тонкая оправа. Толщину держим крупной: в кружке 72px линия в 1px пропадает. */
const GLASSES = `
    <g fill="none" stroke="#3b2c45" stroke-width="1.8" opacity=".85">
      <circle cx="42" cy="42" r="6"/>
      <circle cx="58" cy="42" r="6"/>
      <path d="M48 42h4M36 41l-4 1M64 41l4 1" stroke-linecap="round"/>
    </g>`;

const PEOPLE = [
  { file: "mara", name: "Mara Delacroix", hue: 332, skin: "#f2c9a0", shade: "#e0b189", hair: "long", hairColor: "#3b2c45" },
  { file: "owen", name: "Owen Bright", hue: 185, skin: "#c08552", shade: "#a97246", hair: "short", hairColor: "#2b2233" },
  { file: "sana", name: "Sana Iqbal", hue: 296, skin: "#e0a878", shade: "#c99368", hair: "bun", hairColor: "#4a2f2a" },
  { file: "teodor", name: "Teodor Lind", hue: 216, skin: "#f5d3b3", shade: "#e3bf9c", hair: "parted", hairColor: "#c98a3c", glasses: true },
];

const avatar = (p) => {
  const bg = BACKDROPS[p.hue];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512" role="img">
  <title>${p.name}</title>
  <desc>Рисованный аватар для демонстрационной витрины. Не фотография и не портрет реального человека.</desc>
  <defs>
    <radialGradient id="bg" cx="30%" cy="30%" r="85%">
      <stop offset="0" stop-color="${bg.light}"/>
      <stop offset="1" stop-color="${bg.deep}"/>
    </radialGradient>
  </defs>

  <rect width="100" height="100" fill="url(#bg)"/>

  <!-- Плечи уходят за нижнюю кромку: в круглой рамке обрез снизу не виден. -->
  <ellipse cx="50" cy="112" rx="33" ry="34" fill="${bg.cloth}"/>
  <path d="M40 80q10 9 20 0l-3-2q-7 6-14 0z" fill="#ffffff" opacity=".55"/>

  <rect x="43" y="56" width="14" height="18" rx="7" fill="${p.shade}"/>
  <ellipse cx="50" cy="42" rx="19" ry="22" fill="${p.skin}"/>
  <circle cx="31" cy="45" r="3.4" fill="${p.shade}"/>
  <circle cx="69" cy="45" r="3.4" fill="${p.shade}"/>
${HAIR[p.hair](p.hairColor)}

  <!-- Глаза и рот у всех одинаковые: лицо в 72px различается причёской, а не мимикой. -->
  <ellipse cx="43" cy="42" rx="2.1" ry="2.7" fill="#2b2233"/>
  <ellipse cx="57" cy="42" rx="2.1" ry="2.7" fill="#2b2233"/>
  <path d="M39.5 36.5q3.5-2 7 0M53.5 36.5q3.5-2 7 0" stroke="${p.hairColor}" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".75"/>
  <path d="M45 51q5 4 10 0" stroke="#a96b5a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
${p.glasses ? GLASSES : ""}
</svg>
`;
};

const dir = __dirname;
for (const p of PEOPLE) {
  fs.writeFileSync(path.join(dir, `${p.file}.svg`), avatar(p), "utf8");
  console.log("нарисован", p.file + ".svg", "—", p.name);
}
