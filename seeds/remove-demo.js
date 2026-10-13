// Удаляет из базы всё, что записали демо-сиды (seeds/seed-*.js), — перед переходом на настоящий
// каталог. Только по меткам сидов: выдуманные товары по их адресам, ключи TALE-/demo-cost-,
// заказы DEMO-, отзывы и комментарии от seed-*, демо-посты блога, демо-скидки, команда «О нас».
// Настоящие игры с теми же названиями (Portal 2, Hades…) остаются: их карточки обновляет импорт из
// Steam, а заказы, вишлисты и корзины покупателей продолжают на них ссылаться.
//
// Запуск (стенд):
//   docker compose exec -T mongo1 mongosh --quiet "mongodb://mongo1:27017,mongo2:27017,mongo3:27017/SteamShopDatabase?replicaSet=rs0" \
//     --eval "const ALLOW_DEMO_CLEANUP=1" --file /dev/stdin < seeds/remove-demo.js
// Перед запуском — резервная копия (docs/backup-restore.md). Файлы демо-обложек из тома uploads
// удаляются отдельно: demo-covers, demo-upcoming, demo-media, demo-team.

if (typeof ALLOW_DEMO_CLEANUP === "undefined") {
  throw new Error("Refusing to run without ALLOW_DEMO_CLEANUP (see the header of this file).");
}

const report = {};
const count = (name, result) => {
  report[name] = (report[name] || 0) + (result.deletedCount ?? result.modifiedCount ?? 0);
};

// --- Выдуманные товары: витрина, апкаминги, ПО ---
const fictionalSlugs = [
  "lanternfall",
  "hollow-meridian", "skyward-ledger", "cinder-and-salt", "nightshift-at-vesper-station", "orbital-kitchen-co", "the-last-cartographer",
  "nova-total-security", "harbor-vpn", "prism-photo-editor", "diskpilot-pro", "quill-office-suite", "arcline-os-pro",
];
const fictional = db.Games.find({ slug: { $in: fictionalSlugs } }, { _id: 1 }).toArray().map((g) => g._id);
const fictionalIds = fictional.map(String);
const anyId = fictionalIds.concat(fictional);

count("GameDetails", db.GameDetails.deleteMany({ gameId: { $in: fictionalIds } }));
count("GameReviews", db.GameReviews.deleteMany({ gameId: { $in: anyId } }));
count("GameDiscounts", db.GameDiscounts.deleteMany({ gameId: { $in: anyId } }));
count("WishlistItems", db.WishlistItems.deleteMany({ gameId: { $in: anyId } }));
count("ViewedGames", db.ViewedGames.deleteMany({ GameId: { $in: anyId } }));
count("GameTrackingEvents", db.GameTrackingEvents.deleteMany({ gameId: { $in: anyId } }));
count("GameQuestions", db.GameQuestions.deleteMany({ gameId: { $in: anyId } }));
count("Cart items", db.Cart.updateMany({}, { $pull: { cartGames: { gameId: { $in: anyId } } } }));
count("similarGameIds", db.GameDetails.updateMany({ similarGameIds: { $in: fictionalIds } }, { $pull: { similarGameIds: { $in: fictionalIds } } }));
count("Games", db.Games.deleteMany({ _id: { $in: fictional } }));

// --- Ключи: демо-партии и ключи выдуманных товаров. Ключи, выданные по настоящим (не DEMO-)
// заказам, остаются — иначе из этих заказов пропали бы уже отданные ключи. ---
const realOrderIds = db.Orders.find({ OrderNumber: { $not: /^DEMO-/ } }, { OrderId: 1 }).toArray()
  .map((o) => o.OrderId).filter((id) => id != null);
count("GameKeys", db.GameKeys.deleteMany({
  $and: [
    { $or: [{ BatchId: /^demo-cost-/ }, { Key: /^TALE-/ }, { GameId: { $in: anyId } }] },
    { $or: [{ OrderId: { $exists: false } }, { OrderId: null }, { OrderId: { $nin: realOrderIds } }] },
  ],
}));

// --- Заказы, отзывы, вовлечённость ---
count("Orders", db.Orders.deleteMany({ OrderNumber: /^DEMO-/ }));
count("GameReviews", db.GameReviews.deleteMany({ userId: /^seed-/ }));
count("GameReviewHelpfulVotes", db.GameReviewHelpfulVotes.deleteMany({ userId: /^seed-/ }));
count("BlogComments", db.BlogComments.deleteMany({ anonId: /^seed-/ }));
count("BlogEvents", db.BlogEvents.deleteMany({ anonId: /^seed-/ }));
count("BlogPostUniqueViews", db.BlogPostUniqueViews.deleteMany({ $or: [{ viewerKey: /^seed-/ }, { source: "seed" }] }));

// --- Демо-посты блога вместе с версиями ---
const demoPosts = db.BlogPosts.find({ $or: [{ externalId: /^seed-/ }, { authorId: "seed-editor" }] }, { _id: 1 }).toArray().map((p) => p._id);
count("BlogPostVersions", db.BlogPostVersions.deleteMany({ postId: { $in: demoPosts.map(String) } }));
count("BlogComments", db.BlogComments.deleteMany({ postId: { $in: demoPosts.map(String).concat(demoPosts) } }));
count("BlogPostUniqueViews", db.BlogPostUniqueViews.deleteMany({ postId: { $in: demoPosts.map(String).concat(demoPosts) } }));
count("BlogPosts", db.BlogPosts.deleteMany({ _id: { $in: demoPosts } }));

// --- Скидки: seed-discounts стирал все и заводил свои, без метки — это все текущие скидки ---
if (db.DemoSeedState.countDocuments() > 0) {
  count("GameDiscounts", db.GameDiscounts.deleteMany({}));
}

// --- Обложки-заглушки у настоящих игр: импорт из Steam поставит настоящие ---
count("Games imagePath", db.Games.updateMany({ imagePath: /^\/uploads\/demo-/ }, { $set: { imagePath: "" } }));
count("GameDetails cover", db.GameDetails.updateMany({ "cover.url": /^\/uploads\/demo-/ }, { $set: { cover: null } }));

// --- Команда «О нас»: вымышленные люди ---
count("SiteSettings team", db.SiteSettings.updateMany({ UpdatedBy: "seed-team.js" }, { $set: { TeamJson: null } }));

count("DemoSeedState", db.DemoSeedState.deleteMany({}));

printjson(report);
