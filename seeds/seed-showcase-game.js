// Витринная игра «Lanternfall» — полностью заполненная карточка каталога.
//
// Зачем: у остальных 50 игр каталога пустая галерея и developer совпадает с publisher,
// из-за чего две ветки фронта никогда не выполняются на данных — сортировка медиа
// (orderMedia в GameHero.tsx) и раздельные студии (DeveloperPublisherCard в OverviewTab.tsx).
// Здесь и то, и другое заполнено, но карточка выглядит как обычная игра, а не как фикстура.
//
// Контент игры — на английском, как и весь каталог. Комментарии и вывод скрипта — на русском,
// по конвенции остальных сидов.
//
// Идемпотентен: всё привязано к фиксированному слагу SLUG и пересоздаётся целиком.

// Защита от случайного запуска на боевой базе: сиды пишут выдуманные данные, а seed-discounts
// стирает все скидки. Запуск только с явным ALLOW_DEMO_SEED=1 (см. seeds/README.md).
if (process.env.ALLOW_DEMO_SEED !== "1") {
  print("Отказ: демо-сиды запускаются только с ALLOW_DEMO_SEED=1. Это стенд, а не боевая база?");
  quit(1);
}

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SLUG = "lanternfall";
const GAME_ID = "6a687857010637e1454fbee1";
const DETAILS_ID = "6a687857010637e1454fbee2";

const uploadsRoot = process.env.SEED_UPLOADS_DIR || "/seed-uploads";
const assetsDir = process.env.SEED_ASSETS_DIR || "/seeds/assets";
const mediaDir = path.join(uploadsRoot, "demo-media");
fs.mkdirSync(mediaDir, { recursive: true });

// Детерминированный псевдослучайный поток: один и тот же кадр при каждом прогоне,
// демо не «плывёт» между перезапусками (принцип из README).
const rng = (seed) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

// Силуэт гряды: ломаная от левого края к правому, снизу замкнутая в полигон.
const ridgePath = (w, h, baseY, amplitude, steps, next) => {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const x = Math.round((w * i) / steps);
    const y = Math.round(baseY - amplitude * (0.35 + next() * 0.65));
    pts.push(x + "," + y);
  }
  return "M0," + h + " L" + pts.join(" L") + " L" + w + "," + h + " Z";
};

// Стилизованный кадр: небо, луна с ореолом, три гряды силуэтов, полосы тумана
// и точка фонаря. Без подписей и номеров — чтобы выглядело как скриншот, а не как тест.
const buildSceneSvg = (opts) => {
  const w = opts.w;
  const h = opts.h;
  const next = rng(opts.seed);
  const moonX = Math.round(w * (0.18 + next() * 0.64));
  const moonY = Math.round(h * (0.16 + next() * 0.18));
  const moonR = Math.round(Math.min(w, h) * 0.055);
  const lampX = Math.round(w * (0.25 + next() * 0.5));
  const lampY = Math.round(h * 0.78);

  const ridges = [
    { y: h * 0.72, a: h * 0.16, steps: 9, fill: opts.far, op: 0.85 },
    { y: h * 0.83, a: h * 0.14, steps: 13, fill: opts.mid, op: 0.92 },
    { y: h * 0.97, a: h * 0.13, steps: 17, fill: opts.near, op: 1 }
  ].map((r) =>
    '  <path d="' + ridgePath(w, h, r.y, r.a, r.steps, next) + '" fill="' + r.fill + '" opacity="' + r.op + '"/>'
  ).join("\n");

  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">\n' +
    '  <defs>\n' +
    '    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">\n' +
    '      <stop offset="0" stop-color="' + opts.sky0 + '"/><stop offset="1" stop-color="' + opts.sky1 + '"/>\n' +
    '    </linearGradient>\n' +
    '    <radialGradient id="halo"><stop offset="0" stop-color="' + opts.glow + '" stop-opacity="0.55"/>' +
    '<stop offset="1" stop-color="' + opts.glow + '" stop-opacity="0"/></radialGradient>\n' +
    '    <radialGradient id="lamp"><stop offset="0" stop-color="' + opts.lamp + '" stop-opacity="0.9"/>' +
    '<stop offset="1" stop-color="' + opts.lamp + '" stop-opacity="0"/></radialGradient>\n' +
    '  </defs>\n' +
    '  <rect width="' + w + '" height="' + h + '" fill="url(#sky)"/>\n' +
    '  <circle cx="' + moonX + '" cy="' + moonY + '" r="' + moonR * 6 + '" fill="url(#halo)"/>\n' +
    '  <circle cx="' + moonX + '" cy="' + moonY + '" r="' + moonR + '" fill="' + opts.glow + '" opacity="0.9"/>\n' +
    ridges + "\n" +
    '  <rect x="0" y="' + Math.round(h * 0.66) + '" width="' + w + '" height="' + Math.round(h * 0.06) + '" fill="#ffffff" opacity="0.05"/>\n' +
    '  <rect x="0" y="' + Math.round(h * 0.79) + '" width="' + w + '" height="' + Math.round(h * 0.04) + '" fill="#ffffff" opacity="0.04"/>\n' +
    '  <circle cx="' + lampX + '" cy="' + lampY + '" r="' + Math.round(Math.min(w, h) * 0.14) + '" fill="url(#lamp)"/>\n' +
    '  <circle cx="' + lampX + '" cy="' + lampY + '" r="' + Math.round(Math.min(w, h) * 0.012) + '" fill="' + opts.lamp + '"/>\n' +
    '</svg>\n';
};

const PALETTES = [
  { sky0: "#050d18", sky1: "#12405a", far: "#0d2b3e", mid: "#081d2b", near: "#04121b", glow: "#8fd6e8", lamp: "#ffce7a" },
  { sky0: "#0b0714", sky1: "#3d2350", far: "#2a1738", mid: "#1a0e24", near: "#0d0715", glow: "#c9a7ff", lamp: "#ffb35c" },
  { sky0: "#170a06", sky1: "#5c2a12", far: "#3d1c0d", mid: "#281208", near: "#150904", glow: "#ffb469", lamp: "#fff0c2" },
  { sky0: "#04120f", sky1: "#12503f", far: "#0d3529", mid: "#08231b", near: "#04120e", glow: "#7fe3c0", lamp: "#ffe6a3" },
  { sky0: "#0a0f1c", sky1: "#27436e", far: "#1b2f4d", mid: "#111f33", near: "#08111d", glow: "#a8c4ff", lamp: "#ffd28a" },
  { sky0: "#120613", sky1: "#4d1b3a", far: "#361228", mid: "#230b1a", near: "#12060d", glow: "#ff9ec7", lamp: "#ffd9a0" }
];

const writeScene = (name, w, h, paletteIndex, seed) => {
  const p = PALETTES[paletteIndex % PALETTES.length];
  fs.writeFileSync(path.join(mediaDir, name + ".svg"), buildSceneSvg({
    w: w, h: h, seed: seed,
    sky0: p.sky0, sky1: p.sky1, far: p.far, mid: p.mid, near: p.near, glow: p.glow, lamp: p.lamp
  }));
  return "/uploads/demo-media/" + name + ".svg";
};

// Готовые бинарники из assets: видеоклипы галереи и анимированные GIF для описания.
// В JS ни то, ни другое не собрать, поэтому они лежат в репозитории. См. assets/README.md.
const copyAsset = (file) => {
  const src = path.join(assetsDir, file);
  if (!fs.existsSync(src)) {
    throw new Error("нет файла " + src + " — проверь, что seeds/ смонтирован в контейнер");
  }
  fs.writeFileSync(path.join(mediaDir, file), fs.readFileSync(src));
  return "/uploads/demo-media/" + file;
};

// --- галерея -------------------------------------------------------------
// Порядок в этом массиве намеренно не совпадает с порядком показа: orderMedia()
// сначала берёт трейлеры (по order), затем остальные видео, затем картинки (по order).
// Ожидаемую последовательность скрипт печатает в конце — на самих кадрах ничего служебного нет.
const ITEMS = [
  { key: "drowned-cathedral", type: "image", trailer: false, order: 20, w: 1920, h: 1080,
    title: "The Drowned Cathedral", caption: "Tidewater has claimed the old nave." },
  { key: "commentary",        type: "video", trailer: false, order: 60, w: 1280, h: 720,
    title: "Developer Commentary", caption: "Emberline on building the tide system.", clip: "lanternfall-teaser.mp4", dur: 5 },
  { key: "keeper",            type: "image", trailer: false, order: 50, w: 1080, h: 1350,
    title: "Keeper of the Flame", caption: "Every lantern remembers who lit it." },
  { key: "launch-trailer",    type: "video", trailer: true,  order: 10, w: 1280, h: 720,
    title: "Launch Trailer", caption: "Out now on Windows, macOS and Linux.", clip: "lanternfall-launch-trailer.mp4", dur: 8 },
  { key: "harbour-of-bells",  type: "image", trailer: false, order: 40, w: 1920, h: 1080,
    title: "Harbour of Bells", caption: "They ring when the water rises." },
  { key: "gameplay",          type: "video", trailer: true,  order: 20, w: 1280, h: 720,
    title: "Gameplay Overview", caption: "Six minutes of lantern-lit traversal.", clip: "lanternfall-gameplay.mp4", dur: 6 },
  { key: "reedlight",         type: "image", trailer: false, order: 10, w: 2560, h: 1080,
    title: "Reedlight", caption: "The marsh road, an hour before dusk." },
  { key: "long-descent",      type: "image", trailer: false, order: 30, w: 1600, h: 1200,
    title: "The Long Descent", caption: "Down past the flooded galleries." }
];

const gallery = ITEMS.map((item, index) => {
  const poster = writeScene(SLUG + "-" + item.key, item.w, item.h, index, index * 7919 + 17);
  return {
    // Поле называется id (не _id) — так объявлено в GameMediaItemDb. Работает благодаря
    // [BsonNoId] на классе: без него драйвер Mongo считает член Id идентификатором
    // документа и читает его лишь из _id, роняя десериализацию всего батча.
    id: SLUG + "-" + item.key,
    type: item.type,
    url: item.clip ? copyAsset(item.clip) : poster,
    thumbUrl: poster,
    posterUrl: item.type === "video" ? poster : null,
    durationSec: item.dur || null,
    title: item.title,
    caption: item.caption,
    isTrailer: item.trailer,
    width: item.w,
    height: item.h,
    order: item.order
  };
});

const coverUrl = writeScene(SLUG + "-cover", 600, 600, 1, 4242);

// --- иллюстрации для описания ---------------------------------------------
// Описание — обычный markdown, и картинки в нём работают через ![](url): marked
// отдаёт <img>, DOMPurify его пропускает. Широкие и низкие, чтобы в колонке описания
// читались как врезки, а не как ещё одна галерея.
const docMarsh = writeScene(SLUG + "-doc-marsh", 1280, 460, 3, 991);
const docHarbour = writeScene(SLUG + "-doc-harbour", 1280, 460, 5, 1777);
// Анимации. Загружаются как есть, без перекодирования, поэтому анимация сохраняется.
const gifTide = copyAsset("lanternfall-tide.gif");
const gifFlame = copyAsset("lanternfall-flame.gif");

// --- документы -----------------------------------------------------------
const dbx = db.getSiblingDB("SteamShopDatabase");

dbx.Games.deleteMany({ slug: SLUG });
dbx.GameDetails.deleteMany({ slug: SLUG });

// _id — именно ObjectId, а не строка: GameDb.Id помечен [BsonRepresentation(BsonType.ObjectId)],
// поэтому поиск по идентификатору строит ObjectId-фильтр. Со строковым _id игра находится
// по слагу (страница открывается), но не находится по id — и чекаут падает на
// «Some items are no longer available». gameId в GameDetails при этом остаётся строкой:
// там обычный [BsonElement], без представления.
dbx.Games.insertOne({
  _id: ObjectId(GAME_ID),
  name: "Lanternfall",
  externalId: null,
  slug: SLUG,
  price: NumberDecimal("24.99"),
  description: "Carry the last light through a drowned world.",
  title: "Lanternfall",
  gameType: 2,
  imagePath: coverUrl,
  coverMediaId: null,
  releaseDate: new Date("2024-09-12T00:00:00Z"),
  currency: "USD"
});

dbx.GameDetails.insertOne({
  // Тот же случай: GameDetailsDb.Id — ObjectId. А gameId ниже — обычная строка.
  _id: ObjectId(DETAILS_ID),
  gameId: GAME_ID,
  slug: SLUG,
  title: "Lanternfall",
  tagline: "Carry the last light through a drowned world.",
  descriptionMarkdown: [
    "## Lanternfall",
    "",
    "The tide took the lowlands in a single night. What it left behind is a country of",
    "half-sunken towers, bell harbours and flooded galleries — and one lantern that still burns.",
    "",
    "Lanternfall is a hand-drawn adventure about carrying that light inland before it goes out.",
    "Every room you enter is dark until you choose what to spend your flame on: a bridge mechanism,",
    "a stranger's hearth, or the path ahead.",
    "",
    "![The marsh road, an hour before dusk](" + docMarsh + ")",
    "",
    "### The tide remembers",
    "",
    "Water level shifts between chapters and permanently reshapes the routes you learned.",
    "A causeway you crossed in chapter one is a channel by chapter four — and the ferryman",
    "who owed you a favour has moved his post.",
    "",
    "![Tide levels shifting between chapters](" + gifTide + ")",
    "",
    "### Light is a resource, not a meter",
    "",
    "Fuel is finite and never refills on its own. Lighting a village costs you the passage",
    "you were saving it for, and the game never tells you which choice was the mistake.",
    "",
    "![The lantern burning down](" + gifFlame + ")",
    "",
    "### Harbour of bells",
    "",
    "The drowned quarter runs on sound: bells mark depth, and you learn to read them before",
    "you learn to read the maps.",
    "",
    "![Harbour of bells at high water](" + docHarbour + ")",
    "",
    "### Features",
    "",
    "- **A world that answers back.** Water level shifts between chapters and permanently reshapes",
    "  the routes you learned.",
    "- **Light as a resource.** Fuel is finite. Lighting a village costs you the passage you were saving it for.",
    "- **No combat.** Every obstacle is a mechanism, a negotiation, or a climb.",
    "- **Twelve hours, one sitting or twelve.** Chapters are self-contained and resume anywhere."
  ].join("\n"),
  cover: { url: coverUrl, alt: "Lanternfall" },
  gallery: gallery,
  genres: ["Adventure", "Puzzle"],
  tags: ["Atmospheric", "Story Rich", "Exploration", "Singleplayer", "Hand-drawn"],
  // Разные студии — ровно то, чего нет ни у одной другой игры каталога.
  developer: { name: "Emberline Studio", website: "https://emberline.example.com", logoUrl: null },
  publisher: { name: "Northlight Games", website: "https://northlight.example.com", logoUrl: null },
  releaseDate: new Date("2024-09-12T00:00:00Z"),
  platforms: { windows: true, mac: true, linux: true },
  languages: { audio: ["English"], text: ["English", "Russian", "German", "French"] },
  ageRating: null,
  onlineFeatures: ["Single-player"],
  controllerSupport: "Full",
  cloudSavesSupported: true,
  basePrice: NumberDecimal("24.99"),
  // Без скидки: цену со скидкой считает не это поле, а коллекция GameDiscounts
  // (её целиком пересоздаёт seed-discounts.js). Ставить здесь процент — значит
  // держать в документе цифру, которую витрина всё равно проигнорирует.
  discountPercent: null,
  currency: "USD",
  finalPrice: NumberDecimal("24.99"),
  isActive: true,
  isNew: false,
  isTopRated: true,
  showInFeaturedStorefront: false,
  featuredStorefrontPriority: 0,
  keyType: "SteamKey",
  keyFeatures: ["Instant delivery", "Official Steam key", "Region-free", "Steam Cloud saves"],
  awards: [],
  editions: [],
  dlcItems: [],
  systemRequirements: {
    windows: {
      minimum: { os: "Windows 10 64-bit", cpu: "Intel Core i3-6100", ram: "4 GB", gpu: "GeForce GTX 750 Ti", storage: "6 GB", notes: null },
      recommended: { os: "Windows 11 64-bit", cpu: "Intel Core i5-9400", ram: "8 GB", gpu: "GeForce GTX 1060", storage: "6 GB SSD", notes: null }
    },
    mac: {
      minimum: { os: "macOS 12 Monterey", cpu: "Apple M1", ram: "8 GB", gpu: "Integrated", storage: "6 GB", notes: null },
      recommended: null
    },
    linux: {
      minimum: { os: "Ubuntu 22.04", cpu: "Intel Core i3-6100", ram: "4 GB", gpu: "GeForce GTX 750 Ti", storage: "6 GB", notes: null },
      recommended: null
    }
  },
  similarGameIds: [],
  autoRecommendRules: { enabled: false },
  ratingAvg: 0,
  reviewsCount: 0
});

// --- ключи на складе -----------------------------------------------------
// Без них витрина всё равно пишет «In stock», но покупка упирается в пустой склад.
// Формат и хеш — как у остальных записей коллекции: TALE-XXXXX-XXXXX-XXXXX и sha256(Key).
// Ключи детерминированные (производные от слага), непроданный ключ — это UserId: "".
// _id не задаём: у GameKeys он ObjectId, пусть его выдаёт Mongo.
const KEY_COUNT = 12;
dbx.GameKeys.deleteMany({ GameId: GAME_ID });
const keys = [];
for (let i = 0; i < KEY_COUNT; i++) {
  const digest = crypto.createHash("md5").update(SLUG + "-key-" + i).digest("hex").toUpperCase();
  const key = "TALE-" + digest.slice(0, 5) + "-" + digest.slice(5, 10) + "-" + digest.slice(10, 15);
  keys.push({
    UserId: "",
    GameId: GAME_ID,
    Key: key,
    KeyHash: crypto.createHash("sha256").update(key).digest("hex"),
    KeyType: "Steam Key",
    IssuedAt: new Date("0001-01-01T00:00:00Z"),
    IsActive: false,
    Voided: false,
    VoidedAt: null
  });
}
dbx.GameKeys.insertMany(keys);

// Ожидаемый порядок показа — тем же алгоритмом, что orderMedia() на фронте.
const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
const shown = gallery.filter((m) => m.type === "video" && m.isTrailer).sort(byOrder)
  .concat(gallery.filter((m) => m.type === "video" && !m.isTrailer).sort(byOrder))
  .concat(gallery.filter((m) => m.type !== "video").sort(byOrder));

print("showcase game: " + SLUG + " — " + gallery.length + " элементов галереи (" +
  gallery.filter((g) => g.type === "video").length + " видео, из них " +
  gallery.filter((g) => g.isTrailer).length + " трейлера), студии разные, " +
  KEY_COUNT + " ключей на складе");
print("ожидаемый порядок в галерее:");
shown.forEach((m, i) => print("  " + (i + 1) + ". " + m.title + "  [" + m.type + ", order " + m.order + "]"));
