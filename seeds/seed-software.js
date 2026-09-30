// Демо-ПО для софт-режима каталога (/games?type=software): шесть вымышленных программ в разных категориях.
//
// Зачем: без ПО в каталоге софт-режим, пункт Software в шапке и полка «Software deals» не
// показываются вовсе, а выбор лицензии, таблица сравнения и инструкции активации не выполняются на данных.
// Здесь покрыто всё это:
//   - сетка лицензий «срок × устройства» с дырами (не каждая комбинация продаётся);
//   - подписка (VPN), бессрочные лицензии, одна лицензия у товара без выбора;
//   - все три вида активации кроме Microsoft account (вымышленному вендору он ни к чему);
//   - своя скидка у лицензии (товар попадает в «Software deals»), лицензия без ключей и лицензия,
//     у которой ключей мало («N left»).
//
// Названия, вендоры и ссылки — вымышленные (домены .example): это демо, а не каталог реальных программ.
// Контент на английском, как весь каталог; комментарии и вывод — на русском, по конвенции сидов.
//
// Идемпотентен: товары привязаны к фиксированным слагам и пересоздаются целиком вместе со своими ключами.
// Идёт после seed-game-covers: тот переписывает imagePath всем товарам каталога.

// Защита от случайного запуска на боевой базе: сиды пишут выдуманные данные, а seed-discounts
// стирает все скидки. Запуск только с явным ALLOW_DEMO_SEED=1 (см. seeds/README.md).
if (process.env.ALLOW_DEMO_SEED !== "1") {
  print("Отказ: демо-сиды запускаются только с ALLOW_DEMO_SEED=1. Это стенд, а не боевая база?");
  quit(1);
}

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const uploadsRoot = process.env.SEED_UPLOADS_DIR || "/seed-uploads";
const coversDir = path.join(uploadsRoot, "demo-covers");
fs.mkdirSync(coversDir, { recursive: true });

const hex = (text, length) => crypto.createHash("md5").update(text).digest("hex").slice(0, length);
// Детерминированные ObjectId от слага: повторный прогон даёт те же id, ссылки и заказы не рвутся.
const objectIdFor = (slug, salt) => "5f" + hex("software-" + salt + "-" + slug, 22);

// Обложка: градиент категории, крупная буква и название — узнаваемо в сетке, без чужих логотипов.
const coverSvg = (title, from, to, glyph) =>
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">\n' +
  '  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="' + from + '"/><stop offset="1" stop-color="' + to + '"/></linearGradient></defs>\n' +
  '  <rect width="600" height="800" fill="url(#g)"/>\n' +
  '  <circle cx="480" cy="140" r="190" fill="#ffffff" opacity="0.08"/>\n' +
  '  <circle cx="90" cy="690" r="150" fill="#ffffff" opacity="0.06"/>\n' +
  '  <rect x="200" y="230" width="200" height="200" rx="46" fill="#ffffff" opacity="0.16"/>\n' +
  '  <text x="300" y="370" font-family="Segoe UI, Arial, sans-serif" font-size="130" font-weight="700" fill="#ffffff" text-anchor="middle">' + glyph + '</text>\n' +
  '  <text x="300" y="560" font-family="Segoe UI, Arial, sans-serif" font-size="44" font-weight="700" fill="#ffffff" text-anchor="middle">' + title + '</text>\n' +
  '</svg>\n';

// license(code, term months | null, devices | null, price, keys, extra)
const license = (code, months, devices, price, keys, extra) =>
  Object.assign({ code: code, months: months, devices: devices, price: price, keys: keys }, extra || {});

const PRODUCTS = [
  {
    slug: "nova-total-security", title: "Nova Total Security", category: "security",
    vendor: "Nova Labs", colors: ["#10b981", "#065f46"], glyph: "N",
    tagline: "Antivirus, firewall and a password manager in one app.",
    description: [
      "All-in-one protection for home devices: real-time antivirus, web and email protection, a firewall",
      "and parental controls under one licence.",
      "",
      "### What's included",
      "",
      "- Real-time antivirus and ransomware shield",
      "- Web and phishing protection",
      "- Firewall and Wi-Fi checks",
      "- Password manager",
      "- Free version upgrades during the licence term"
    ],
    platforms: { windows: true, mac: true, android: true },
    activation: { target: "VendorWebsite", url: "https://nova-labs.example/licenses", label: "Nova account" },
    tags: ["Antivirus", "Privacy"],
    requirements: { windows: "Windows 10 or 11, 2 GB RAM, 1.5 GB disk", mac: "macOS 12 or later" },
    licenses: [
      // Своя скидка у самой дешёвой лицензии — товар попадает в «Software deals».
      license("1y-1", 12, 1, "19.99", 8, { isDefault: true, discount: "25" }),
      license("1y-3", 12, 3, "29.99", 2),
      license("1y-5", 12, 5, "39.99", 6),
      license("2y-3", 24, 3, "47.99", 5),
      license("2y-5", 24, 5, "63.99", 0)
    ]
  },
  {
    slug: "harbor-vpn", title: "Harbor VPN", category: "vpn",
    vendor: "Harbor Networks", colors: ["#06b6d4", "#1e40af"], glyph: "H",
    tagline: "Private browsing on every device, with servers in 60 countries.",
    description: [
      "A no-logs VPN with fast servers, a kill switch and split tunnelling.",
      "",
      "One subscription covers five devices at once — phone, laptop and the TV in the living room."
    ],
    platforms: { windows: true, mac: true, android: true, ios: true },
    activation: { target: "InApp", url: "https://harbor-vpn.example/download", label: null },
    tags: ["VPN", "Privacy"],
    requirements: { windows: "Windows 10 or later", mac: "macOS 11 or later" },
    licenses: [
      license("sub-1m", 1, 5, "4.99", 20, { isDefault: true, subscription: true }),
      license("sub-1y", 12, 5, "39.99", 10, { subscription: true }),
      license("sub-2y", 24, 5, "59.99", 4, { subscription: true })
    ]
  },
  {
    slug: "prism-photo-editor", title: "Prism Photo Editor", category: "design",
    vendor: "Prism Creative", colors: ["#d946ef", "#6d28d9"], glyph: "P",
    tagline: "Layer-based photo editing without a subscription.",
    description: [
      "Layers, masks, RAW development and non-destructive filters in a one-time purchase.",
      "",
      "Updates within the major version are free."
    ],
    platforms: { windows: true, mac: true },
    activation: { target: "InApp", url: null, label: null },
    tags: ["Photo", "Design"],
    requirements: { windows: "Windows 10 64-bit, 8 GB RAM, 4 GB disk", mac: "macOS 13 or later, Apple silicon or Intel" },
    licenses: [
      license("life-1", null, 1, "59.00", 7, { isDefault: true }),
      license("life-2", null, 2, "79.00", 3)
    ]
  },
  {
    slug: "diskpilot-pro", title: "DiskPilot Pro", category: "utilities",
    vendor: "Pilot Tools", colors: ["#64748b", "#1e293b"], glyph: "D",
    tagline: "Partition, clone and clean up drives safely.",
    description: [
      "Resize partitions without losing data, clone a system drive to a new SSD and find what fills the disk.",
      "",
      "One licence, one PC, no expiry."
    ],
    platforms: { windows: true },
    activation: { target: "InApp", url: null, label: null },
    tags: ["Disk", "Backup"],
    requirements: { windows: "Windows 10 or 11, 1 GB RAM" },
    // Одна лицензия — на странице без выбора срока и устройств.
    licenses: [license("life-1", null, 1, "19.99", 15, { isDefault: true })]
  },
  {
    slug: "quill-office-suite", title: "Quill Office Suite", category: "office",
    vendor: "Quill Software", colors: ["#f97316", "#9a3412"], glyph: "Q",
    tagline: "Documents, spreadsheets and slides that open everyone's files.",
    description: [
      "A word processor, spreadsheets and presentations with full support for common office formats.",
      "",
      "Works offline; cloud sync is optional."
    ],
    platforms: { windows: true, mac: true, linux: true },
    activation: { target: "VendorWebsite", url: "https://quill-software.example/account", label: "Quill account" },
    tags: ["Office", "Documents"],
    requirements: { windows: "Windows 10 or later, 4 GB RAM", mac: "macOS 12 or later", linux: "Ubuntu 22.04 or later" },
    licenses: [
      license("1y-1", 12, 1, "29.99", 9, { isDefault: true }),
      license("life-1", null, 1, "89.00", 4),
      license("life-5", null, 5, "149.00", 0)
    ]
  },
  {
    slug: "arcline-os-pro", title: "Arcline OS Pro", category: "operating-systems",
    vendor: "Arcline Systems", colors: ["#3b82f6", "#1e3a8a"], glyph: "A",
    tagline: "The desktop system for work machines and home labs.",
    description: [
      "A professional desktop operating system with disk encryption, remote desktop and virtualisation built in.",
      "",
      "The licence is tied to one device and can be moved to a new one."
    ],
    platforms: { windows: false, linux: true },
    activation: { target: "VendorWebsite", url: "https://arcline.example/activate", label: null },
    tags: ["Operating system"],
    requirements: { linux: "64-bit CPU, 4 GB RAM, 40 GB disk" },
    licenses: [license("life-1", null, 1, "119.00", 6, { isDefault: true })]
  }
];

const termLabel = (months, subscription) => {
  let term = months == null ? (subscription ? null : "Lifetime") : months === 1 ? "1 month" : months % 12 === 0 ? (months === 12 ? "1 year" : (months / 12) + " years") : months + " months";
  return subscription ? (term ? "Subscription · " + term : "Subscription") : term;
};
const licenseTitle = (l) => [termLabel(l.months, l.subscription), l.devices ? l.devices + (l.devices === 1 ? " device" : " devices") : null].filter(Boolean).join(" · ");

const dbx = db.getSiblingDB("SteamShopDatabase");
let keyTotal = 0;

PRODUCTS.forEach((p) => {
  const gameId = objectIdFor(p.slug, "game");
  const detailsId = objectIdFor(p.slug, "details");
  const coverFile = p.slug + ".svg";
  fs.writeFileSync(path.join(coversDir, coverFile), coverSvg(p.title, p.colors[0], p.colors[1], p.glyph));
  const coverUrl = "/uploads/demo-covers/" + coverFile;
  const cheapest = p.licenses.reduce((min, l) => (Number(l.price) < Number(min.price) ? l : min), p.licenses[0]);

  dbx.Games.deleteMany({ slug: p.slug });
  dbx.GameDetails.deleteMany({ slug: p.slug });
  dbx.GameKeys.deleteMany({ GameId: gameId });

  dbx.Games.insertOne({
    _id: ObjectId(gameId),
    name: p.title,
    externalId: null,
    slug: p.slug,
    // Базовая цена товара — самой дешёвой лицензии: ей пользуются места, не знающие о лицензиях.
    price: NumberDecimal(cheapest.price),
    description: p.tagline,
    title: p.title,
    gameType: 0,
    imagePath: coverUrl,
    coverMediaId: null,
    releaseDate: new Date("2025-03-01T00:00:00Z"),
    currency: "USD",
    kind: "Software",
    softwareCategory: p.category
  });

  const req = (text) => (text ? { minimum: { os: text, cpu: null, ram: null, gpu: null, storage: null, notes: null }, recommended: null } : null);
  dbx.GameDetails.insertOne({
    _id: ObjectId(detailsId),
    gameId: gameId,
    slug: p.slug,
    title: p.title,
    tagline: p.tagline,
    descriptionMarkdown: p.description.join("\n"),
    cover: { url: coverUrl, alt: p.title },
    gallery: [],
    genres: [],
    tags: p.tags,
    developer: { name: p.vendor, website: null, logoUrl: null },
    publisher: { name: p.vendor, website: null, logoUrl: null },
    releaseDate: new Date("2025-03-01T00:00:00Z"),
    platforms: Object.assign({ windows: false, mac: false, linux: false, playStation: false, xbox: false, android: false, ios: false }, p.platforms),
    languages: { audio: [], text: ["English", "German", "French", "Spanish"] },
    ageRating: null,
    onlineFeatures: [],
    controllerSupport: "None",
    cloudSavesSupported: false,
    basePrice: NumberDecimal(cheapest.price),
    discountPercent: null,
    currency: "USD",
    finalPrice: NumberDecimal(cheapest.price),
    isActive: true,
    isNew: false,
    isTopRated: false,
    showInFeaturedStorefront: false,
    featuredStorefrontPriority: 0,
    keyType: "Other",
    keyFeatures: ["Instant delivery", "Genuine licence key"],
    awards: [],
    activation: Object.assign({ target: p.activation.target }, p.activation.url ? { url: p.activation.url } : {}, p.activation.label ? { label: p.activation.label } : {}),
    editions: p.licenses.map((l) => {
      const edition = {
        code: l.code,
        title: licenseTitle(l),
        description: "",
        price: NumberDecimal(l.price),
        discountPercent: l.discount ? NumberDecimal(l.discount) : null,
        includedItems: [],
        isDefault: Boolean(l.isDefault)
      };
      if (l.months != null) edition.licenseTermMonths = l.months;
      if (l.devices != null) edition.licenseDevices = l.devices;
      if (l.subscription) edition.isSubscription = true;
      return edition;
    }),
    dlcItems: [],
    systemRequirements: {
      windows: req(p.requirements.windows),
      mac: req(p.requirements.mac),
      linux: req(p.requirements.linux)
    },
    similarGameIds: [],
    autoRecommendRules: { enabled: false },
    ratingAvg: 0,
    reviewsCount: 0
  });

  // Ключи — по лицензиям (EditionCode), в том же формате, что у игр. Непроданный ключ — UserId: "".
  const keys = [];
  p.licenses.forEach((l) => {
    for (let i = 0; i < l.keys; i++) {
      const digest = crypto.createHash("md5").update(p.slug + "-" + l.code + "-key-" + i).digest("hex").toUpperCase();
      const key = "TALE-" + digest.slice(0, 5) + "-" + digest.slice(5, 10) + "-" + digest.slice(10, 15);
      keys.push({
        UserId: "",
        GameId: gameId,
        Key: key,
        KeyHash: crypto.createHash("sha256").update(key).digest("hex"),
        KeyType: p.vendor,
        EditionCode: l.code,
        IssuedAt: new Date("0001-01-01T00:00:00Z"),
        IsActive: false,
        Voided: false,
        VoidedAt: null
      });
    }
  });
  if (keys.length > 0) {
    dbx.GameKeys.insertMany(keys);
  }
  keyTotal += keys.length;
  print("  " + p.title + " [" + p.category + "] — " + p.licenses.length + " лиц., " + keys.length + " ключей");
});

print("software: " + PRODUCTS.length + " товаров, " + keyTotal + " ключей");
