// Демо-отзывы на игры. Идемпотентно: отзывы с authorId вида "seed-*" на игру
// повторно не создаются.
//
// ВАЖНО: статус здесь "Published" в PascalCase — репозиторий сравнивает его с
// ReviewStatus.Published.ToString(). Это НЕ то же самое, что "PUBLISHED" у постов блога.
// Остальные поля — camelCase.
const db = db.getSiblingDB('SteamShopDatabase');
const now = Date.now();
const day = 86400000;

// Тексты про сам опыт игры, а не про магазин: это отзывы на товар.
// Пара штук про доставку — так пишут в реальности, но их меньшинство.
const bodies = [
  { r: 5, t: "Ate my entire weekend and I am not upset about it. The kind of game where you say one more hour at midnight and mean it." },
  { r: 5, t: "Held up better than I expected on a five-year-old laptop. Dropped the shadows one notch and it never stuttered again." },
  { r: 5, t: "Bought it on a whim during a sale and it turned into the game I recommend to everyone. No notes." },
  { r: 5, t: "The soundtrack alone is worth it. Still catch myself humming the main theme weeks later." },
  { r: 5, t: "Key landed in my inbox before I finished closing the checkout tab. Game is excellent too." },
  { r: 4, t: "Really strong for the first fifteen hours, then it starts repeating itself a bit. Still an easy recommend at this price." },
  { r: 4, t: "Great game, rough menus. You get used to them, but the first hour is more confusing than it needs to be." },
  { r: 4, t: "Co-op is the way to play this. Solo it drags; with a friend it is one of the best evenings I have had this year." },
  { r: 4, t: "Exactly what it says on the box. Nothing revolutionary, everything well made." },
  { r: 4, t: "Runs fine on Steam Deck after tweaking the controls. Battery takes a beating though." },
  { r: 4, t: "Story got me. Combat took a while to click, but once it did I stopped noticing it and just played." },
  { r: 3, t: "Good bones, uneven pacing. The middle third could lose five hours and be better for it." },
  { r: 3, t: "Fun, but I hit two crashes in twenty hours. Autosave saved me both times, still annoying." },
  { r: 3, t: "Worth it on discount, hard to justify at full price. Content runs out faster than the trailers suggest." },
  { r: 2, t: "Wanted to like it. The difficulty spikes out of nowhere around the halfway mark and never really recovers." },
  { r: 5, t: "Third playthrough and still finding things. That basically never happens to me." },
  { r: 4, t: "Bought it for one friend and ended up playing more than they did. Good problem to have." },
  { r: 5, t: "Instant delivery worked exactly as advertised, key activated on Steam first try." },
  { r: 4, t: "Visually gorgeous. Wish the map was less cluttered, but that is a small complaint." },
  { r: 3, t: "Solid single evening of fun, then it repeats. Fine for the price, not something I will come back to." },
  { r: 5, t: "One of those games that respects your time. No filler, no padding, just good design start to finish." },
  { r: 4, t: "Took two hours to get going and then I could not put it down. Push past the slow opening." },
  { r: 5, t: "Played it with my partner passing the controller. Turned into a whole ritual." },
  { r: 4, t: "Does one thing and does it really well. If that thing appeals to you, buy it." }
];

const names = [
  "Marek T.", "Ana P.", "Dmitri K.", "Sofia L.", "Ben H.", "Nadia R.",
  "Tomas V.", "Iris M.", "Lukas B.", "Yara S.", "Oskar N.", "Elena D.",
  "Rafael C.", "Mina J.", "Piotr W.", "Clara F.", "Andrei G.", "Noor A."
];

// Сколько отзывов у каждой игры. Разброс намеренный: у части каталога отзывов
// не будет вовсе — витрина должна уметь показывать и такое состояние.
const plan = [
  { count: 8, offset: 0 }, { count: 6, offset: 5 }, { count: 5, offset: 2 },
  { count: 4, offset: 9 }, { count: 4, offset: 14 }, { count: 3, offset: 6 },
  { count: 3, offset: 11 }, { count: 3, offset: 18 }, { count: 2, offset: 1 },
  { count: 2, offset: 12 }, { count: 2, offset: 20 }, { count: 2, offset: 7 },
  { count: 5, offset: 15 }, { count: 4, offset: 3 }, { count: 3, offset: 21 },
  { count: 2, offset: 16 }, { count: 6, offset: 10 }, { count: 3, offset: 8 }
];

const games = db.Games.find({}, { title: 1 }).sort({ title: 1 }).toArray();
if (games.length === 0) {
  print("В каталоге нет игр — отзывы вешать не на что.");
  quit(1);
}

var createdTotal = 0;
var userSeq = 0;
var summary = [];

plan.forEach(function (spec, gameIndex) {
  // Раскладываем по каталогу с шагом, а не подряд: так отзывы не скапливаются
  // в начале алфавита.
  var game = games[(gameIndex * 3) % games.length];
  if (!game) { return; }

  var gameId = String(game._id);
  if (db.GameReviews.countDocuments({ gameId: gameId, userId: /^seed-/ }) > 0) {
    print("уже есть, пропуск: " + game.title);
    return;
  }

  var sum = 0;
  var created = 0;

  for (var i = 0; i < spec.count; i++) {
    var body = bodies[(spec.offset + i * 5) % bodies.length];
    var name = names[(userSeq + i) % names.length];
    // Один отзыв на каждые несколько — скрытый: модерация должна быть видна
    // в админке, но в среднюю оценку такие не идут.
    var hidden = (userSeq + i) % 11 === 0 && i > 0;

    db.GameReviews.insertOne({
      gameId: gameId,
      userId: "seed-user-" + (++userSeq),
      userName: name,
      avatarUrl: null,
      verifiedPurchase: (userSeq % 7) !== 0,
      rating: body.r,
      playtimeHours: (userSeq % 3 === 0) ? null : (4 + (userSeq * 7) % 60),
      text: body.t,
      images: [],
      recommend: body.r >= 4,
      createdAt: new Date(now - ((userSeq * 11) % 120 + 1) * day),
      updatedAt: null,
      helpfulCount: (userSeq * 3) % 14,
      status: hidden ? "Hidden" : "Published"
    });

    if (!hidden) { sum += body.r; created++; }
    createdTotal++;
  }

  if (created > 0) {
    summary.push({ title: game.title, n: created, avg: Math.round((sum / created) * 10) / 10 });
  }
});

summary.sort(function (a, b) { return b.avg - a.avg || b.n - a.n; });
summary.forEach(function (s) {
  print(String(s.avg.toFixed(1)).padStart(4) + " ★   " + String(s.n).padStart(2) + " отз.   " + s.title);
});

print("");
print("отзывов создано: " + createdTotal + ", всего в базе: " + db.GameReviews.countDocuments()
  + " (опубликовано: " + db.GameReviews.countDocuments({ status: "Published" })
  + ", скрыто: " + db.GameReviews.countDocuments({ status: "Hidden" }) + ")");
