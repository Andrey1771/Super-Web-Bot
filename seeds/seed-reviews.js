// Демо-отзывы на игры. Идемпотентно: свои прошлые отзывы (userId вида "seed-*") удаляет и сеет
// заново. Игры выбираются по слагу, а не по номеру в каталоге: стоило каталогу вырасти, номера
// сдвигались, и отзывы уезжали на другие игры.
//
// Цель — все состояния, которые умеет показывать витрина, на конкретных играх (см. STATES ниже):
// «Very Positive», «Positive», «Mixed», «Negative», ровно один отзыв, больше страницы (кнопка
// «Show more»), все на модерации (витрина показывает «No reviews yet»), все скрытые, без часов и
// без голосов, поляризованные оценки. Скриншотов у отзывов нет: витрина их не показывает. Остальные игры получают понемногу для массовки, часть каталога остаётся без отзывов.
//
// Только игры: у ПО нет «часов в игре», и игровой отзыв на VPN выглядит нелепо. Невышедшие игры
// (seed-upcoming-games) тоже пропускаем: отзыв на то, что ещё не вышло, выдаёт демо.
//
// ВАЖНО: статус здесь "Published"/"Hidden"/"Pending" в PascalCase — репозиторий сравнивает его с
// ReviewStatus.ToString(). Это НЕ то же самое, что "PUBLISHED" у постов блога. Остальные поля — camelCase.

// Защита от случайного запуска на боевой базе: сиды пишут выдуманные данные, а seed-discounts
// стирает все скидки. Запуск только с явным ALLOW_DEMO_SEED=1 (см. seeds/README.md).
if (process.env.ALLOW_DEMO_SEED !== "1") {
  print("Отказ: демо-сиды запускаются только с ALLOW_DEMO_SEED=1. Это стенд, а не боевая база?");
  quit(1);
}

const db = db.getSiblingDB("SteamShopDatabase");
const now = Date.now();
const day = 86400000;

// Тексты про сам опыт игры, а не про магазин. Пара штук про доставку — так пишут в реальности.
// Пул шире оценок: у каждой звезды — свои тексты, чтобы «Negative» не звучал восторженно.
const bodies = {
  5: [
    "Ate my entire weekend and I am not upset about it. The kind of game where you say one more hour at midnight and mean it.",
    "Held up better than I expected on a five-year-old laptop. Dropped the shadows one notch and it never stuttered again.",
    "Bought it on a whim during a sale and it turned into the game I recommend to everyone. No notes.",
    "The soundtrack alone is worth it. Still catch myself humming the main theme weeks later.",
    "Key landed in my inbox before I finished closing the checkout tab. Game is excellent too.",
    "Third playthrough and still finding things. That basically never happens to me.",
    "One of those games that respects your time. No filler, no padding, just good design start to finish.",
    "Played it with my partner passing the controller. Turned into a whole ritual.",
    "Instant delivery worked exactly as advertised, key activated on Steam first try.",
    "I went in expecting a decent evening and came out three weeks later with a favourite game. The writing is sharp, the world reacts to what you do in ways I kept testing just to see if it would notice — it did, every time. Performance was flawless on a mid-range card, controller support is proper, and the ending stuck the landing. If you have been on the fence: get off it."
  ],
  4: [
    "Really strong for the first fifteen hours, then it starts repeating itself a bit. Still an easy recommend at this price.",
    "Great game, rough menus. You get used to them, but the first hour is more confusing than it needs to be.",
    "Co-op is the way to play this. Solo it drags; with a friend it is one of the best evenings I have had this year.",
    "Exactly what it says on the box. Nothing revolutionary, everything well made.",
    "Runs fine on Steam Deck after tweaking the controls. Battery takes a beating though.",
    "Story got me. Combat took a while to click, but once it did I stopped noticing it and just played.",
    "Bought it for one friend and ended up playing more than they did. Good problem to have.",
    "Visually gorgeous. Wish the map was less cluttered, but that is a small complaint.",
    "Took two hours to get going and then I could not put it down. Push past the slow opening.",
    "Does one thing and does it really well. If that thing appeals to you, buy it."
  ],
  3: [
    "Good bones, uneven pacing. The middle third could lose five hours and be better for it.",
    "Fun, but I hit two crashes in twenty hours. Autosave saved me both times, still annoying.",
    "Worth it on discount, hard to justify at full price. Content runs out faster than the trailers suggest.",
    "Solid single evening of fun, then it repeats. Fine for the price, not something I will come back to.",
    "Half a great game. The exploration is superb, the combat is a chore, and you cannot have one without the other."
  ],
  2: [
    "Wanted to like it. The difficulty spikes out of nowhere around the halfway mark and never really recovers.",
    "Looks lovely, plays clumsy. Refunded my friend's copy after two hours; kept mine out of stubbornness.",
    "Constant stutter on a machine that runs everything else fine. Waited for three patches, still there."
  ],
  1: [
    "Crashed on the loading screen four times, then corrupted the save. Nothing else to say.",
    "Not what the store page promises. The 'open world' is three corridors and a menu.",
    "Ok."
  ]
};

const names = [
  "Marek T.", "Ana P.", "Dmitri K.", "Sofia L.", "Ben H.", "Nadia R.",
  "Tomas V.", "Iris M.", "Lukas B.", "Yara S.", "Oskar N.", "Elena D.",
  "Rafael C.", "Mina J.", "Piotr W.", "Clara F.", "Lukas H.", "Noor A.",
  "Jonas K.", "Aiko T.", "Sven R.", "Priya N.", "Mateo G.", "Hanna Ø."
];

// --- состояния по слагам ------------------------------------------------------
// ratings — оценки по порядку; флаги задают крайние случаи. Чего нет в флагах — как у обычного отзыва:
// покупка подтверждена у 6 из 7, часы у 2 из 3, голоса «полезно» по формуле от номера.
const STATES = [
  // Витринная игра: «Very Positive», отмечена Top rated, больше страницы («Show more»),
  // один скрытый и один на модерации — в среднюю оценку они не идут.
  { slug: "lanternfall", note: "Very Positive, >1 страницы, скрытый + на модерации",
    ratings: [5, 5, 4, 5, 5, 4, 5, 5, 3, 5, 4, 5, 5, 2], hidden: [8], pending: [13] },
  { slug: "a-plague-tale-requiem", note: "Positive", ratings: [5, 4, 4, 5, 4, 3, 4, 4] },
  { slug: "disco-elysium", note: "Mixed: тройки нейтральны, «за» и «против» поровну", ratings: [4, 3, 2, 3, 4, 3, 2] },
  { slug: "outlast", note: "Negative; у второго отзыва покупка возвращена — пометка «Refunded»", ratings: [2, 1, 3, 2, 1], refunded: [1] },
  { slug: "baba-is-you", note: "ровно один отзыв", ratings: [5] },
  { slug: "stray", note: "покупка не подтверждена у всех (поле хранится, витрина не показывает)", ratings: [4, 5, 4], verified: [false, false, false] },
  { slug: "unpacking", note: "большие наигранные часы", ratings: [5, 5, 4, 5, 4], playtime: [120, 88.5, 240, 61, 310] },
  { slug: "hades", note: "все на модерации — витрина показывает «No reviews yet»", ratings: [5, 4, 5], pending: [0, 1, 2] },
  { slug: "cult-of-the-lamb", note: "все скрыты модератором", ratings: [4, 4, 3], hidden: [0, 1, 2] },
  { slug: "vampire-survivors", note: "без часов и без голосов «полезно»", ratings: [5, 4, 5, 4, 3, 5], playtime: [null, null, null, null, null, null], helpful: [0, 0, 0, 0, 0, 0] },
  { slug: "firewatch", note: "поляризованные оценки: только 5 и 1", ratings: [5, 5, 1, 1, 5, 1] },
  { slug: "portal-2", note: "один отзыв правили (updatedAt)", ratings: [5, 5, 4, 5], edited: [1] },
  { slug: "slay-the-spire", note: "всё с минимальными часами (0.5h)", ratings: [4, 5, 4], playtime: [0.5, 1, 0.5] },
  // Массовка: понемногу разным играм, чтобы каталог не выглядел пустым. Остальные — без отзывов.
  { slug: "red-dead-redemption-2", ratings: [5, 4, 5, 4, 5] },
  { slug: "cities-skylines-ii", ratings: [3, 4, 3, 4, 2] },
  { slug: "doom-eternal", ratings: [5, 4, 4, 5] },
  { slug: "sekiro-shadows-die-twice", ratings: [5, 3, 5, 4] },
  { slug: "stardew-valley", ratings: [5, 5, 5] },
  { slug: "euro-truck-simulator-2", ratings: [4, 5, 4] },
  { slug: "forza-horizon-5", ratings: [4, 4, 3] },
  { slug: "ghostrunner", ratings: [4, 5, 3] },
  { slug: "kerbal-space-program", ratings: [5, 4] },
  { slug: "metal-gear-rising-revengeance", ratings: [5, 5] },
  { slug: "the-witcher-3-wild-hunt", ratings: [5, 5] },
  { slug: "persona-5-royal", ratings: [5, 4] },
  { slug: "inscryption", ratings: [5, 4, 5] },
  { slug: "the-witness", ratings: [4, 3] },
  { slug: "xcom-2", ratings: [4, 4, 2] }
];

// Свои отзывы — заново: и отметки «полезно» на них, иначе они указывали бы на удалённые отзывы.
const oldSeedIds = db.GameReviews.find({ userId: /^seed-/ }, { _id: 1 }).toArray().map(function (r) { return r._id; });
if (oldSeedIds.length > 0) {
  const helpful = db.GameReviewHelpfulVotes.deleteMany({ reviewId: { $in: oldSeedIds.map(function (id) { return id.toString(); }) } }).deletedCount;
  const removed = db.GameReviews.deleteMany({ userId: /^seed-/ }).deletedCount;
  print("cleanup: removed " + removed + " seed review(s), " + helpful + " helpful vote(s)");
}

// Невышедшие и ПО в STATES не попадают по построению, но проверяем: слаг мог смениться.
const eligible = {};
db.Games.find({ kind: { $ne: "Software" }, releaseDate: { $not: { $gt: new Date() } } }, { slug: 1, title: 1 }).forEach(function (g) {
  if (g.slug) eligible[g.slug] = g;
});

var createdTotal = 0;
var userSeq = 0;
var summary = [];
var missing = [];

STATES.forEach(function (state) {
  const game = eligible[state.slug];
  if (!game) { missing.push(state.slug); return; }
  const gameId = String(game._id);
  const has = function (list, i) { return Array.isArray(list) && list.indexOf(i) >= 0; };
  const pick = function (list, i, fallback) { return Array.isArray(list) && list.length > i ? list[i] : fallback; };

  var sum = 0, published = 0;
  state.ratings.forEach(function (rating, i) {
    userSeq++;
    const pool = bodies[rating];
    const text = pool[(userSeq * 5 + i) % pool.length];
    const hidden = has(state.hidden, i);
    const pending = has(state.pending, i);
    const status = hidden ? "Hidden" : pending ? "Pending" : "Published";
    const verified = pick(state.verified, i, (userSeq % 7) !== 0);
    const playtime = pick(state.playtime, i, (userSeq % 3 === 0) ? null : (4 + (userSeq * 7) % 60));
    const helpful = pick(state.helpful, i, (userSeq * 3) % 14);
    // Вердикт сервер выводит из звёзд (4–5 — за); поле в документе — для совместимости, всегда в тон оценке.
    const recommend = rating >= 4;
    const createdAt = new Date(now - ((userSeq * 11) % 120 + 1) * day);
    db.GameReviews.insertOne({
      gameId: gameId,
      userId: "seed-user-" + userSeq,
      userName: names[(userSeq + i) % names.length],
      avatarUrl: null,
      verifiedPurchase: verified,
      rating: rating,
      playtimeHours: playtime,
      text: text,
      images: [],
      recommend: recommend,
      createdAt: createdAt,
      updatedAt: has(state.edited, i) ? new Date(createdAt.getTime() + 2 * day) : null,
      // Правка автора — витрина пишет «Edited …»; updatedAt один для этого не годится (его трогает модерация).
      editedAt: has(state.edited, i) ? new Date(createdAt.getTime() + 2 * day) : null,
      helpfulCount: helpful,
      // Покупку вернули: отзыв остаётся и считается, витрина ставит пометку «Refunded».
      refunded: has(state.refunded, i),
      status: status
    });

    if (status === "Published") { sum += rating; published++; }
    createdTotal++;
  });

  summary.push({
    title: game.title, n: published, total: state.ratings.length,
    avg: published > 0 ? Math.round((sum / published) * 10) / 10 : 0, note: state.note || ""
  });
});

summary.sort(function (a, b) { return b.avg - a.avg || b.n - a.n; });
summary.forEach(function (s) {
  print((s.n > 0 ? s.avg.toFixed(1) + " ★" : "  — ") + "  " + String(s.n).padStart(2) + "/" + String(s.total).padEnd(2) + "  " + s.title + (s.note ? "   — " + s.note : ""));
});
if (missing.length > 0) {
  print("не найдены в каталоге (пропущены): " + missing.join(", "));
}

print("");
print("отзывов создано: " + createdTotal + ", всего в базе: " + db.GameReviews.countDocuments()
  + " (опубликовано: " + db.GameReviews.countDocuments({ status: "Published" })
  + ", скрыто: " + db.GameReviews.countDocuments({ status: "Hidden" })
  + ", на модерации: " + db.GameReviews.countDocuments({ status: "Pending" }) + ")");
