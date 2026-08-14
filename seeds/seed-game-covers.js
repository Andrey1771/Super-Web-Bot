// Демо-обложки игр: детерминированные SVG-файлы в uploads-томе + переключение
// imagePath на них. Никакого кода в проде: дальше файлы отдаёт обычная статика
// /uploads/. Идемпотентен: файлы перезаписываются, пути переустанавливаются.
// Требует смонтированного uploads-тома (см. demo-seeder в docker-compose).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const uploadsRoot = process.env.SEED_UPLOADS_DIR || "/seed-uploads";
const coversDir = path.join(uploadsRoot, "demo-covers");
fs.mkdirSync(coversDir, { recursive: true });

// Тёмные насыщенные пары — на карточках каталога обложка занимает почти всю
// площадь, и пастель сливалась бы со светлым фоном витрины.
const PALETTES = [
  { from: "#3b2a72", to: "#6b3ff2", accent: "#e9e2ff" },
  { from: "#0f4c5c", to: "#2a9d8f", accent: "#dff6f0" },
  { from: "#7b2d43", to: "#e76f51", accent: "#ffe8dd" },
  { from: "#1d3557", to: "#457b9d", accent: "#e3f1fa" },
  { from: "#4a2c6d", to: "#9d4edd", accent: "#f3e8ff" },
  { from: "#264653", to: "#2a9d8f", accent: "#e9f5db" },
  { from: "#5f0f40", to: "#9a031e", accent: "#ffe5ec" },
  { from: "#283618", to: "#606c38", accent: "#f0efeb" }
];

const escapeXml = (value) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const buildCoverSvg = (slug) => {
  // MD5 — не безопасность, а стабильный выбор палитры: один slug — одна картинка.
  const hash = crypto.createHash("md5").update(slug).digest();
  const palette = PALETTES[hash[0] % PALETTES.length];
  const angle = 45 + ((hash[1] % 60) - 30);

  const words = slug.split("-").filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0].toUpperCase()).join("") || "?";
  let title = words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
  if (title.length > 26) {
    title = title.slice(0, 25) + "…";
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="bg" gradientTransform="rotate(${angle} 0.5 0.5)">
      <stop offset="0" stop-color="${palette.from}"/>
      <stop offset="1" stop-color="${palette.to}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#bg)"/>
  <circle cx="500" cy="110" r="180" fill="${palette.accent}" opacity="0.08"/>
  <circle cx="90" cy="520" r="140" fill="${palette.accent}" opacity="0.08"/>
  <text x="300" y="316" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="168" font-weight="800" fill="${palette.accent}" opacity="0.92">${escapeXml(initials)}</text>
  <text x="300" y="520" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="30" font-weight="600" fill="${palette.accent}" opacity="0.75">${escapeXml(title)}</text>
</svg>
`;
};

const dbx = db.getSiblingDB("SteamShopDatabase");
let written = 0;
dbx.Games.find({}, { slug: 1 }).forEach((game) => {
  const slug = (game.slug || "").trim().toLowerCase();
  if (!slug) {
    print(`skip: game ${game._id} has no slug`);
    return;
  }

  fs.writeFileSync(path.join(coversDir, `${slug}.svg`), buildCoverSvg(slug));
  dbx.Games.updateOne({ _id: game._id }, { $set: { imagePath: `/uploads/demo-covers/${slug}.svg` } });
  written += 1;
});

print(`game covers: ${written} SVG files written to ${coversDir}, imagePath updated`);
