// Будущие игры: шесть вымышленных релизов с датами впереди, чтобы полка «Upcoming games»
// на главной и фильтр «Coming soon» в каталоге не стояли пустыми.
//
// Даты считаются от дня запуска (через 3 недели, 6 недель, …), а не зашиты: зашитая дата
// через полгода стала бы прошлой, и игры тихо «вышли» бы без ключей на складе. Всё остальное
// детерминировано: id, обложки, тексты — одни и те же при каждом прогоне.
//
// Ключей у этих игр нет намеренно: витрина для «Coming soon» показывает дату и «Wishlist»,
// а не «Buy». Склад появится вместе с релизом.
//
// Контент — на английском, как весь каталог; комментарии и вывод — на русском, по конвенции сидов.
// Идемпотентен: игры находятся по своим слагам и пересоздаются целиком.

// Защита от случайного запуска на боевой базе (см. seeds/README.md).
if (process.env.ALLOW_DEMO_SEED !== "1") {
  print("Отказ: демо-сиды запускаются только с ALLOW_DEMO_SEED=1. Это стенд, а не боевая база?");
  quit(1);
}

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const uploadsRoot = process.env.SEED_UPLOADS_DIR || "/seed-uploads";
// Своя папка, а не demo-covers: seed-game-covers переписывает всё под /uploads/demo-covers/
// генератом с инициалами, а здесь обложки нарисованы под каждую игру.
const coversDir = path.join(uploadsRoot, "demo-upcoming");
fs.mkdirSync(coversDir, { recursive: true });

const hex = (text, length) => crypto.createHash("md5").update(text).digest("hex").slice(0, length);
// Детерминированные ObjectId от слага: повторный прогон даёт те же id, вишлисты не рвутся.
const objectIdFor = (slug, salt) => "5e" + hex("upcoming-" + salt + "-" + slug, 22);

// Дата релиза: сегодня + N дней, округлённая до полуночи UTC. «Сегодня» — момент запуска.
const inDays = (days) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

// Детерминированный псевдослучайный поток для декора обложек.
const rng = (seed) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

const escapeXml = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// --- мотивы обложек -------------------------------------------------------
// Каждой игре — свой узор, чтобы полка не выглядела шестью копиями одной картинки.
const MOTIFS = {
  // Звёздное небо с кольцами планеты.
  orbit: (next, ink) => {
    let out = "";
    for (let i = 0; i < 70; i++) {
      out += '<circle cx="' + Math.round(next() * 600) + '" cy="' + Math.round(next() * 420) + '" r="' + (1 + Math.round(next() * 2)) + '" fill="' + ink + '" opacity="' + (0.3 + next() * 0.6).toFixed(2) + '"/>';
    }
    out += '<circle cx="300" cy="230" r="120" fill="' + ink + '" opacity="0.12"/>';
    out += '<ellipse cx="300" cy="230" rx="215" ry="52" fill="none" stroke="' + ink + '" stroke-width="10" opacity="0.5" transform="rotate(-18 300 230)"/>';
    out += '<ellipse cx="300" cy="230" rx="245" ry="66" fill="none" stroke="' + ink + '" stroke-width="3" opacity="0.35" transform="rotate(-18 300 230)"/>';
    return out;
  },
  // Гряды холмов и солнце — тёплая ферма.
  hills: (next, ink) => {
    let out = '<circle cx="420" cy="170" r="70" fill="' + ink + '" opacity="0.85"/>';
    [250, 300, 350].forEach((base, i) => {
      let d = "M0," + base;
      for (let x = 0; x <= 600; x += 60) {
        d += " Q" + (x + 30) + "," + (base - 40 - next() * 40) + " " + (x + 60) + "," + base;
      }
      d += " L600,600 L0,600 Z";
      out += '<path d="' + d + '" fill="' + ink + '" opacity="' + (0.12 + i * 0.1).toFixed(2) + '"/>';
    });
    return out;
  },
  // Шестиугольная сетка — стратегия.
  hexgrid: (next, ink) => {
    let out = "";
    const r = 34;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 9; col++) {
        const cx = col * r * 1.75 + (row % 2 ? r * 0.875 : 0) + 20;
        const cy = row * r * 1.5 + 40;
        const pts = [];
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 180) * (60 * k - 30);
          pts.push((cx + r * Math.cos(a)).toFixed(1) + "," + (cy + r * Math.sin(a)).toFixed(1));
        }
        const lit = next() > 0.72;
        out += '<polygon points="' + pts.join(" ") + '" fill="' + ink + '" opacity="' + (lit ? 0.35 : 0.08) + '" stroke="' + ink + '" stroke-opacity="0.35" stroke-width="1.5"/>';
      }
    }
    return out;
  },
  // Тонкие линии карты с компасом — приключение.
  chart: (next, ink) => {
    let out = "";
    for (let i = 0; i < 9; i++) {
      let d = "M0," + Math.round(60 + i * 52);
      for (let x = 60; x <= 600; x += 60) {
        d += " Q" + (x - 30) + "," + Math.round(60 + i * 52 + (next() - 0.5) * 70) + " " + x + "," + Math.round(60 + i * 52 + (next() - 0.5) * 30);
      }
      out += '<path d="' + d + '" fill="none" stroke="' + ink + '" stroke-width="1.5" opacity="0.35"/>';
    }
    out += '<circle cx="300" cy="230" r="92" fill="none" stroke="' + ink + '" stroke-width="3" opacity="0.7"/>';
    out += '<polygon points="300,150 318,230 300,310 282,230" fill="' + ink + '" opacity="0.85"/>';
    out += '<polygon points="220,230 300,212 380,230 300,248" fill="' + ink + '" opacity="0.55"/>';
    return out;
  },
  // Коридор с мигающими лампами — хоррор.
  corridor: (next, ink) => {
    let out = '<polygon points="0,0 600,0 380,300 220,300" fill="' + ink + '" opacity="0.08"/>';
    out += '<polygon points="0,600 600,600 380,300 220,300" fill="' + ink + '" opacity="0.14"/>';
    for (let i = 0; i < 6; i++) {
      const t = i / 6;
      const y = Math.round(40 + t * 240);
      const w = Math.round(320 - t * 260);
      out += '<rect x="' + Math.round(300 - w / 2) + '" y="' + y + '" width="' + w + '" height="4" fill="' + ink + '" opacity="' + (next() > 0.5 ? 0.9 : 0.25) + '"/>';
    }
    out += '<rect x="286" y="290" width="28" height="60" fill="' + ink + '" opacity="0.9"/>';
    return out;
  },
  // Плитка кухни и пар — казуальная кооперативная игра.
  kitchen: (next, ink) => {
    let out = "";
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 10; x++) {
        if ((x + y) % 2 === 0) {
          out += '<rect x="' + x * 60 + '" y="' + y * 60 + '" width="60" height="60" fill="' + ink + '" opacity="0.07"/>';
        }
      }
    }
    for (let i = 0; i < 3; i++) {
      const x = 210 + i * 90;
      out += '<path d="M' + x + ',300 C' + (x - 30) + ',250 ' + (x + 30) + ',210 ' + x + ',150" fill="none" stroke="' + ink + '" stroke-width="10" stroke-linecap="round" opacity="' + (0.35 + next() * 0.3).toFixed(2) + '"/>';
    }
    out += '<rect x="150" y="300" width="300" height="34" rx="17" fill="' + ink + '" opacity="0.85"/>';
    return out;
  }
};

// Обложка 600×600, как у остального демо-каталога: фон-градиент, узор, название и студия.
const coverSvg = (game) => {
  const next = rng(parseInt(hex(game.slug, 8), 16));
  const words = game.title.split(" ");
  // Название переносится на две строки по середине слов — длинные заголовки не вылезают за край.
  const half = Math.ceil(words.length / 2);
  const lines = words.length > 2 ? [words.slice(0, half).join(" "), words.slice(half).join(" ")] : [game.title];
  const titleSize = lines.some((l) => l.length > 13) ? 54 : 66;
  const titleY = lines.length === 2 ? 430 : 470;
  const title = lines.map((line, i) =>
    '<text x="300" y="' + (titleY + i * (titleSize + 8)) + '" text-anchor="middle" font-family="\'Segoe UI\', Arial, sans-serif" font-size="' + titleSize + '" font-weight="800" fill="' + game.ink + '">' + escapeXml(line) + '</text>'
  ).join("\n  ");

  return '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600" role="img" aria-label="' + escapeXml(game.title) + '">\n' +
    '  <defs><linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">' +
    '<stop offset="0" stop-color="' + game.colors[0] + '"/><stop offset="1" stop-color="' + game.colors[1] + '"/></linearGradient></defs>\n' +
    '  <rect width="600" height="600" fill="url(#bg)"/>\n' +
    '  ' + MOTIFS[game.motif](next, game.ink) + '\n' +
    '  <rect x="0" y="380" width="600" height="220" fill="' + game.colors[1] + '" opacity="0.55"/>\n' +
    '  ' + title + '\n' +
    '  <text x="300" y="556" text-anchor="middle" font-family="\'Segoe UI\', Arial, sans-serif" font-size="22" font-weight="600" letter-spacing="3" fill="' + game.ink + '" opacity="0.75">' + escapeXml(game.developer.toUpperCase()) + '</text>\n' +
    '</svg>\n';
};

// --- игры ----------------------------------------------------------------
// gameType — индекс enum GameType (0 Action, 1 Adventure, 2 RPG, 3 Simulation, 4 Strategy,
// 5 Puzzle, 9 Horror, 10 Casual); genre — слаг того же жанра, как у остальных игр каталога.
const GAMES = [
  {
    slug: "hollow-meridian", title: "Hollow Meridian", releaseInDays: 21, price: "49.99",
    gameType: 2, genre: "role-playing-games-rpgs", genres: ["Role-Playing Games (RPGs)", "Action"],
    tags: ["Open World", "Dark Fantasy", "Souls-like", "Singleplayer"],
    developer: "Greyfall Interactive", publisher: "Greyfall Interactive",
    motif: "orbit", colors: ["#1b1035", "#4b2a8a"], ink: "#efe6ff",
    platforms: { windows: true, mac: false, linux: false }, controller: "Full", online: ["Single-player"],
    tagline: "Walk the line where the sky ends and the old gods wait.",
    description: [
      "Hollow Meridian is an action RPG set on the rim of a world that stopped turning. One half burns",
      "under an eternal noon, the other lies frozen in permanent night, and the narrow band between them",
      "is the only place anything still grows.",
      "",
      "### Two suns, one road",
      "",
      "Every region can be explored from the day side or the night side. Enemies, routes and even the",
      "story you hear change with the light you bring.",
      "",
      "### Features",
      "",
      "- **Stance-based combat** with weapons that remember how you used them.",
      "- **A living frontier**: settlements grow or fall depending on which side of the Meridian you favour.",
      "- **No level grind** — power comes from relics, oaths and the allies you keep."
    ]
  },
  {
    slug: "skyward-ledger", title: "Skyward Ledger", releaseInDays: 42, price: "29.99",
    gameType: 4, genre: "strategy", genres: ["Strategy", "Simulation"],
    tags: ["City Builder", "Economy", "Relaxing", "Sandbox"],
    developer: "Paper Lantern Games", publisher: "Paper Lantern Games",
    motif: "hexgrid", colors: ["#0c3b4a", "#1c8b8f"], ink: "#e6fbff",
    platforms: { windows: true, mac: true, linux: true }, controller: "Partial", online: ["Single-player", "Cloud saves"],
    tagline: "Build a trading city on floating islands and keep the books balanced.",
    description: [
      "Skyward Ledger is a calm city builder about running a merchant republic in the clouds. Chain",
      "islands together with bridges and cargo lifts, sign contracts with passing airships and try",
      "not to bankrupt the treasury before the monsoon.",
      "",
      "### Features",
      "",
      "- **Real supply chains**: every good has a source, a route and a price that moves.",
      "- **Weather that matters** — trade winds decide which ports you can reach this season.",
      "- **Pause any time.** No raids, no timers, just ledgers that want to be balanced."
    ]
  },
  {
    slug: "cinder-and-salt", title: "Cinder & Salt", releaseInDays: 63, price: "19.99",
    gameType: 3, genre: "simulation", genres: ["Simulation", "Casual Games"],
    tags: ["Farming Sim", "Cozy", "Crafting", "Life Sim"],
    developer: "Hearthside Studio", publisher: "Northlight Games",
    motif: "hills", colors: ["#5a1d2c", "#d9743f"], ink: "#fff1dc",
    platforms: { windows: true, mac: true, linux: false }, controller: "Full", online: ["Single-player", "Online co-op"],
    tagline: "Rebuild a volcanic island farm, one harvest at a time.",
    description: [
      "Cinder & Salt is a cozy farming sim on an island the volcano gave back. Ash makes the soil rich",
      "and the weather strange: crops grow fast, seasons run short, and the sea keeps bringing gifts.",
      "",
      "### Features",
      "",
      "- **Volcanic seasons** that reshape which fields you can plant.",
      "- **A village worth knowing** — fourteen neighbours with their own routines and recipes.",
      "- **Play together** in drop-in online co-op for up to four."
    ]
  },
  {
    slug: "nightshift-at-vesper-station", title: "Nightshift at Vesper Station", releaseInDays: 91, price: "24.99",
    gameType: 9, genre: "horror", genres: ["Horror", "Adventure"],
    tags: ["Psychological Horror", "Atmospheric", "Story Rich", "First-Person"],
    developer: "Dim Room Collective", publisher: "Dim Room Collective",
    motif: "corridor", colors: ["#07090f", "#2a1b3d"], ink: "#d7c9ff",
    platforms: { windows: true, mac: false, linux: false }, controller: "Full", online: ["Single-player"],
    tagline: "Eleven hours until dawn. The trains stopped running at nine.",
    description: [
      "Nightshift at Vesper Station is a first-person horror story about the last attendant of a",
      "metro station that no longer appears on any map. Keep the lights on, answer the intercom,",
      "and decide which passengers are allowed to leave.",
      "",
      "### Features",
      "",
      "- **One long night**, told in real time across eleven chapters.",
      "- **No combat** — safety comes from routine, and routine is what the station wants to break.",
      "- **Sound-first design**; headphones strongly recommended."
    ]
  },
  {
    slug: "orbital-kitchen-co", title: "Orbital Kitchen Co.", releaseInDays: 120, price: "14.99",
    gameType: 10, genre: "casual-games", genres: ["Casual Games", "Simulation"],
    tags: ["Co-op", "Cooking", "Party Game", "Local Multiplayer"],
    developer: "Two Spoons", publisher: "Two Spoons",
    motif: "kitchen", colors: ["#123a5c", "#ff8a4c"], ink: "#fff8ef",
    platforms: { windows: true, mac: true, linux: true }, controller: "Full", online: ["Local co-op", "Online co-op"],
    tagline: "Cook for a space station in zero gravity. Nothing stays on the plate.",
    description: [
      "Orbital Kitchen Co. is a chaotic co-op cooking game where the kitchen keeps rotating and the",
      "soup does not. Catch floating ingredients, dodge the maintenance drone and serve a hungry",
      "crew before the next docking window.",
      "",
      "### Features",
      "",
      "- **Two to four cooks** locally or online, with cross-play.",
      "- **Kitchens that move**: gravity flips, modules detach, the pantry drifts away.",
      "- **A campaign of forty shifts** plus a daily challenge station."
    ]
  },
  {
    slug: "the-last-cartographer", title: "The Last Cartographer", releaseInDays: 175, price: "34.99",
    gameType: 1, genre: "adventure", genres: ["Adventure", "Puzzle"],
    tags: ["Exploration", "Puzzle", "Hand-drawn", "Atmospheric"],
    developer: "Emberline Studio", publisher: "Northlight Games",
    motif: "chart", colors: ["#1f2a3a", "#4f6d8a"], ink: "#f2ecd9",
    platforms: { windows: true, mac: true, linux: true }, controller: "Full", online: ["Single-player"],
    tagline: "Every map you draw becomes true.",
    description: [
      "The Last Cartographer is a hand-drawn puzzle adventure about a mapmaker whose charts rewrite",
      "the coastline. Draw a bridge and one appears. Erase an island and remember what lived there.",
      "",
      "From the studio behind Lanternfall.",
      "",
      "### Features",
      "",
      "- **Draw to solve**: the map is your inventory, your tool and your record.",
      "- **A coast that remembers** every correction you make.",
      "- **Eight regions, no combat, one sitting or many.**"
    ]
  }
];

// --- запись --------------------------------------------------------------
const dbx = db.getSiblingDB("SteamShopDatabase");
const slugs = GAMES.map((g) => g.slug);
dbx.Games.deleteMany({ slug: { $in: slugs } });
dbx.GameDetails.deleteMany({ slug: { $in: slugs } });

GAMES.forEach((game) => {
  const gameId = objectIdFor(game.slug, "game");
  const detailsId = objectIdFor(game.slug, "details");
  const releaseDate = inDays(game.releaseInDays);
  const coverFile = game.slug + ".svg";
  fs.writeFileSync(path.join(coversDir, coverFile), coverSvg(game));
  const coverUrl = "/uploads/demo-upcoming/" + coverFile;

  // _id — ObjectId (GameDb.Id хранится как ObjectId), gameId в GameDetails — строка. См. seed-showcase-game.js.
  dbx.Games.insertOne({
    _id: ObjectId(gameId),
    name: game.title,
    externalId: null,
    slug: game.slug,
    price: NumberDecimal(game.price),
    description: game.tagline,
    title: game.title,
    gameType: game.gameType,
    imagePath: coverUrl,
    coverMediaId: null,
    releaseDate: releaseDate,
    currency: "USD",
    genre: game.genre
  });

  dbx.GameDetails.insertOne({
    _id: ObjectId(detailsId),
    gameId: gameId,
    slug: game.slug,
    title: game.title,
    tagline: game.tagline,
    descriptionMarkdown: ["## " + game.title, ""].concat(game.description).join("\n"),
    cover: { url: coverUrl, alt: game.title },
    gallery: [],
    genres: game.genres,
    tags: game.tags,
    developer: { name: game.developer, website: null, logoUrl: null },
    publisher: { name: game.publisher, website: null, logoUrl: null },
    releaseDate: releaseDate,
    platforms: game.platforms,
    languages: { audio: ["English"], text: ["English", "German", "French", "Russian"] },
    ageRating: null,
    onlineFeatures: game.online,
    controllerSupport: game.controller,
    cloudSavesSupported: true,
    basePrice: NumberDecimal(game.price),
    discountPercent: null,
    currency: "USD",
    finalPrice: NumberDecimal(game.price),
    isActive: true,
    isNew: false,
    isTopRated: false,
    showInFeaturedStorefront: false,
    featuredStorefrontPriority: 0,
    keyType: "SteamKey",
    keyFeatures: ["Official Steam key", "Region-free", "Delivered at launch"],
    awards: [],
    editions: [],
    dlcItems: [],
    systemRequirements: {
      windows: {
        minimum: { os: "Windows 10 64-bit", cpu: "Intel Core i5-8400", ram: "8 GB", gpu: "GeForce GTX 1060", storage: "20 GB", notes: null },
        recommended: { os: "Windows 11 64-bit", cpu: "Intel Core i7-10700", ram: "16 GB", gpu: "GeForce RTX 3060", storage: "20 GB SSD", notes: null }
      },
      mac: game.platforms.mac ? { minimum: { os: "macOS 13 Ventura", cpu: "Apple M1", ram: "8 GB", gpu: "Integrated", storage: "20 GB", notes: null }, recommended: null } : null,
      linux: game.platforms.linux ? { minimum: { os: "Ubuntu 22.04", cpu: "Intel Core i5-8400", ram: "8 GB", gpu: "GeForce GTX 1060", storage: "20 GB", notes: null }, recommended: null } : null
    },
    similarGameIds: [],
    autoRecommendRules: { enabled: false },
    ratingAvg: 0,
    reviewsCount: 0
  });
});

print("upcoming games: " + GAMES.length + " игр с датами впереди, обложки в " + coversDir + ", ключей нет (coming soon)");
GAMES.forEach((g) => print("  " + g.title + " — " + inDays(g.releaseInDays).toISOString().slice(0, 10)));
