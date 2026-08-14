// Демо-скидки. ВНИМАНИЕ: коллекция GameDiscounts пересоздаётся целиком — у схемы
// нет поля-маркера, чтобы отличить посевные скидки от заведённых руками, поэтому
// сид честно предназначен только для демо-стенда (см. seeds/README.md).
// Детерминирован: выбор игр, проценты и сроки считаются от slug.

const dbx = db.getSiblingDB("SteamShopDatabase");
const now = new Date();

const removed = dbx.GameDiscounts.deleteMany({}).deletedCount;
print(`cleanup: removed ${removed} discounts`);

function hash(s) {
  let h = 7;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

const games = dbx.Games.find({}, { slug: 1 }).toArray();
let created = 0;
games.forEach((game) => {
  const slug = (game.slug || "").trim().toLowerCase();
  if (!slug) {
    return;
  }

  const h = hash(slug);
  // Скидка примерно у каждой четвёртой игры — витрина не выглядит «всё по акции».
  if (h % 4 !== 0) {
    return;
  }

  const percent = 15 + (h % 71); // 15–85%
  const startedDaysAgo = 1 + (h % 5);
  // Паре скидок оставляем короткий хвост (~1–2 дня) — для бейджей «скоро закончится».
  const daysLeft = h % 7 === 0 ? 1 + (h % 2) : 7 + (h % 21);

  dbx.GameDiscounts.insertOne({
    gameId: String(game._id),
    discountPercent: percent,
    startDate: new Date(now.getTime() - startedDaysAgo * 864e5),
    endDate: new Date(now.getTime() + daysLeft * 864e5)
  });
  created += 1;
});

print(`discounts: ${created} created`);
