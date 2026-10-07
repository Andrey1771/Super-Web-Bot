// Превращает копию базы стенда в базу демо-сайта для портфолио (запускает build-demo-pack.sh).
//
//   mongosh <копия базы> --file build-demo-db.js        (каталог — в /tmp/demo-catalog.json)
//
// Что остаётся: игры, DLC и программы из catalog.json, новости, настройки магазина, курсы валют,
// база знаний чата, тексты бота. Что уходит: все остальные товары и всё, что оставили люди, — заказы,
// ключи, корзины, отзывы, обращения, аккаунты, журналы. Ключи Google Analytics тоже: у демо своих нет.
// В конце печатает JSON со списком файлов из /uploads, на которые ссылается демо-база, — их и везём.

const catalog = JSON.parse(require("fs").readFileSync("/tmp/demo-catalog.json", "utf8"));
const now = new Date();

// --- 1. Товары: только из каталога демо. ---
const keepApps = new Set();
for (const g of catalog.games) {
  keepApps.add(`steam-${g.appId}`);
  for (const d of g.dlc || []) keepApps.add(`steam-${d}`);
}
for (const s of catalog.software || []) keepApps.add(`steam-${s.appId}`);

const removedGames = db.Games.deleteMany({ externalId: { $nin: [...keepApps] } }).deletedCount;
const gameIds = db.Games.find({}, { _id: 1 }).toArray().map((g) => g._id.toString());
const removedDetails = db.GameDetails.deleteMany({ gameId: { $nin: gameIds } }).deletedCount;
print(`games kept ${gameIds.length}, removed ${removedGames} (+${removedDetails} cards)`);

// Дубли с одним steam-id (след гонки старого параллельного импорта DLC): остаётся более ранняя запись.
let duplicates = 0;
db.Games.aggregate([{ $group: { _id: "$externalId", ids: { $push: "$_id" }, n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]).forEach((group) => {
  const extra = group.ids.sort((a, b) => (a.toString() < b.toString() ? -1 : 1)).slice(1);
  db.Games.deleteMany({ _id: { $in: extra } });
  db.GameDetails.deleteMany({ gameId: { $in: extra.map((id) => id.toString()) } });
  duplicates += extra.length;
});
print(`duplicates removed: ${duplicates}`);

const missing = [...keepApps].filter((x) => !db.Games.findOne({ externalId: x }));
if (missing.length) throw new Error(`catalog.json lists apps that are not in the source base: ${missing.join(", ")}`);

// Жанр витрины, где Steam промахнулся (GTA V — не спорт).
for (const g of catalog.games.filter((x) => x.genre)) {
  db.Games.updateOne({ externalId: `steam-${g.appId}` }, { $set: { genre: g.genre } });
}

// У DLC — без роликов: так демо легче в разы, а ролики есть у самих игр.
const dlcIds = db.Games.find({ parentGameId: { $nin: [null, ""] } }, { _id: 1 }).toArray().map((g) => g._id.toString());
db.GameDetails.updateMany({ gameId: { $in: dlcIds } }, { $pull: { gallery: { type: "video" } } });

// «Скоро выйдет» остаётся скоро: предзаказы выходят через 1–3 месяца. Сдвиг в днях записан в DemoUpcoming —
// по нему каждая новая песочница ставит даты от своего «сегодня» (DemoSandboxService.ShiftUpcomingAsync).
db.DemoUpcoming.drop();
let shift = 0;
db.Games.find({ parentGameId: { $in: [null, ""] }, releaseDate: { $gt: now } }).sort({ releaseDate: 1 }).forEach((g) => {
  const offsetDays = 30 + 20 * shift++;
  const date = new Date(now.getTime() + offsetDays * 24 * 3600 * 1000);
  date.setUTCHours(0, 0, 0, 0);
  db.Games.updateOne({ _id: g._id }, { $set: { releaseDate: date } });
  db.GameDetails.updateOne({ gameId: g._id.toString() }, { $set: { releaseDate: date } });
  db.DemoUpcoming.insertOne({ gameId: g._id.toString(), offsetDays });
});
print(`upcoming shifted: ${shift}`);

// Переводы описаний, которых нет в Steam (чаще всего украинского и польского): deploy/demo/translations.json,
// ключ — внешний id товара. Кладутся только туда, где языка нет, — переводы из Steam не перезаписываются.
let translations = {};
try {
  translations = JSON.parse(require("fs").readFileSync("/tmp/demo-translations.json", "utf8"));
} catch (e) {
  print("no translations file — skipped");
}
let translated = 0;
for (const [externalId, locales] of Object.entries(translations)) {
  const game = db.Games.findOne({ externalId }, { _id: 1, descriptionI18n: 1 });
  if (!game) continue;
  const details = db.GameDetails.findOne({ gameId: game._id.toString() }, { descriptionMarkdownI18n: 1, taglineI18n: 1 });
  if (!details) continue;
  const set = {};
  const gameSet = {};
  for (const [locale, text] of Object.entries(locales)) {
    if (!(details.descriptionMarkdownI18n || {})[locale] && text.description) set[`descriptionMarkdownI18n.${locale}`] = text.description;
    if (!(details.taglineI18n || {})[locale] && text.tagline) set[`taglineI18n.${locale}`] = text.tagline;
    if (!(game.descriptionI18n || {})[locale] && text.tagline) gameSet[`descriptionI18n.${locale}`] = text.tagline;
  }
  if (Object.keys(set).length) { db.GameDetails.updateOne({ _id: details._id }, { $set: set }); translated++; }
  if (Object.keys(gameSet).length) db.Games.updateOne({ _id: game._id }, { $set: gameSet });
}
print(`translations applied: ${translated}`);

// --- 2. Пользовательские данные и служебное — пустые (индексы остаются). ---
const keepCollections = new Set([
  "DemoUpcoming",
  "Games", "GameDetails", "MediaAssets", "CoverImageMeta", "Settings", "SiteSettings", "BotResources",
  "FxRates", "SupportKnowledgeArticles", "BlogPosts", "BlogPostVersions", "BlogHomepageSettings",
  "BlogViewSettings", "DealOfWeekSettings", "PromoCodes", "AnalyticsSettings", "GameDiscounts", "TarotSettings",
]);
for (const name of db.getCollectionNames()) {
  if (name.startsWith("hangfire.")) {
    db[name].drop();
  } else if (!keepCollections.has(name) && !name.startsWith("system.")) {
    db[name].deleteMany({});
  }
}
db.PromoCodes.updateMany({}, { $set: { UsedCount: 0, usedCount: 0 } });

// Ключи Google Analytics и почта специалиста стенда в демо не едут.
db.AnalyticsSettings.updateMany({}, {
  $set: { IsEnabled: false, GaMeasurementId: null, GaPropertyId: null, GaApiSecret: null, GtmContainerId: null,
    GaOauthClientId: null, GaOauthClientSecret: null, GaOauthRefreshToken: null, GaOauthRefreshTokenSavedAt: null },
});
db.SiteSettings.updateMany({}, { $set: { SpecialistEmail: null } });

// --- 3. Медиатека: адреса без хоста стенда и только живые файлы. ---
db.MediaAssets.find({ $or: [{ url: /^https?:\/\/[^/]+\/uploads\// }, { thumbnailUrl: /^https?:\/\/[^/]+\/uploads\// }] }).forEach((m) => {
  const strip = (u) => (u ? u.replace(/^https?:\/\/[^/]+(?=\/uploads\/)/, "") : u);
  db.MediaAssets.updateOne({ _id: m._id }, { $set: { url: strip(m.url), thumbnailUrl: strip(m.thumbnailUrl) } });
});

// Все адреса /uploads/… в оставшихся документах.
const referenced = new Set();
const collect = (doc) => {
  const text = JSON.stringify(doc);
  for (const m of text.matchAll(/(?:https?:\/\/[^/"]+)?\/uploads\/([^"\\?#\s)]+)/g)) referenced.add(m[1]);
};
for (const name of ["Games", "GameDetails", "BlogPosts", "BlogPostVersions", "Settings", "SiteSettings", "BlogHomepageSettings"]) {
  db[name].find().forEach(collect);
}
// Медиатека: оставляем записи о файлах, на которые есть ссылки, остальные — без файлов, — убираем.
const assetIds = new Set(db.Games.find({ coverMediaId: { $ne: null } }, { coverMediaId: 1 }).toArray().map((g) => String(g.coverMediaId)));
const removedAssets = db.MediaAssets.deleteMany({
  $nor: [{ _id: { $in: [...assetIds].filter((x) => /^[0-9a-f]{24}$/.test(x)).map((x) => ObjectId(x)) } }],
  url: { $nin: [...referenced].map((p) => `/uploads/${p}`) },
}).deletedCount;
db.MediaAssets.find().forEach(collect);
db.CoverImageMeta.deleteMany({ _id: { $nin: [...referenced] } });
print(`media assets removed ${removedAssets}, kept ${db.MediaAssets.countDocuments()}; files referenced ${referenced.size}`);

print("FILES_JSON " + JSON.stringify([...referenced].sort()));
