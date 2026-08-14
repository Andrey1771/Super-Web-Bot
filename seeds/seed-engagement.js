// Демо-вовлечённость для постов блога: уникальные просмотры, реакции, дочитывания.
// Идемпотентен: свои прошлые данные удаляет по префиксу seed- и сеет заново.
// Запуск: mongosh SteamShopDatabase seed-engagement.js (на праймари mongo3).

const dbx = db.getSiblingDB("SteamShopDatabase");
const now = new Date();

const removedViews = dbx.BlogPostUniqueViews.deleteMany({ viewerKey: /^seed-/ }).deletedCount;
const removedEvents = dbx.BlogEvents.deleteMany({ anonId: /^seed-/ }).deletedCount;
print(`cleanup: removed ${removedViews} seed views, ${removedEvents} seed events`);

// Детерминированный псевдослучай от строки — сид повторяем, цифры не скачут.
function hash(s) {
  let h = 7;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}
function rand01(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Веса реакций: как обычно в блогах — палец вверх чаще всего.
const REACTIONS = [
  { emoji: "👍", weight: 0.40 },
  { emoji: "❤️", weight: 0.25 },
  { emoji: "🔥", weight: 0.20 },
  { emoji: "🎮", weight: 0.10 },
  { emoji: "👀", weight: 0.05 }
];
function pickReaction(r) {
  let acc = 0;
  for (const item of REACTIONS) {
    acc += item.weight;
    if (r <= acc) {
      return item.emoji;
    }
  }
  return REACTIONS[0].emoji;
}

const posts = dbx.BlogPosts.find({ status: "PUBLISHED" }).toArray();
let grandViews = 0;
let grandReactions = 0;
let grandReads = 0;

posts.forEach((post) => {
  const id = typeof post._id === "string" ? post._id : post._id.toHexString();
  const slug = post.slug || id;
  const published = post.publishedAt ? new Date(post.publishedAt) : new Date(now.getTime() - 14 * 864e5);
  const spanMs = Math.max(now - published, 864e5);
  const days = spanMs / 864e5;

  // 18–45 просмотров в день в зависимости от поста: старые посты накапливают больше.
  const dailyRate = 18 + (hash(slug) % 28);
  const viewTarget = Math.round(days * dailyRate + 25);

  const viewDocs = [];
  for (let i = 0; i < viewTarget; i++) {
    const at = new Date(published.getTime() + rand01(hash(slug) + i) * spanMs);
    viewDocs.push({
      postId: id,
      viewerKey: `seed-view-${slug}-${i}`,
      userId: null,
      anonId: `seed-anon-${slug}-${i}`,
      isGuest: true,
      firstViewedAt: at,
      lastViewedAt: at,
      firstSessionId: `seed-sess-${slug}-${i}`,
      lastSessionId: `seed-sess-${slug}-${i}`,
      userAgentHash: null,
      ipHash: null,
      countedInPublicCounts: true,
      isExcludedFromPublicCounts: false,
      source: "seed",
      createdAt: at,
      updatedAt: at
    });
  }
  if (viewDocs.length > 0) {
    dbx.BlogPostUniqueViews.insertMany(viewDocs);
  }

  // Реакции: 4–9% от просмотров, дочитывания: 25–45%.
  const reactCount = Math.max(4, Math.round(viewTarget * (0.04 + rand01(hash(slug) + 1) * 0.05)));
  const readCount = Math.round(viewTarget * (0.25 + rand01(hash(slug) + 2) * 0.2));

  const eventDocs = [];
  for (let i = 0; i < reactCount; i++) {
    const at = new Date(published.getTime() + rand01(hash(slug) + 100 + i) * spanMs);
    eventDocs.push({
      userId: null,
      anonId: `seed-react-${slug}-${i}`,
      sessionId: `seed-sess-${slug}-r${i}`,
      postId: id,
      eventType: "POST_REACTION_SET",
      ts: at,
      dwellMs: null,
      scrollDepth: null,
      referrer: null,
      meta: { reaction: pickReaction(rand01(hash(slug) + 200 + i)) }
    });
  }
  for (let i = 0; i < readCount; i++) {
    const at = new Date(published.getTime() + rand01(hash(slug) + 300 + i) * spanMs);
    eventDocs.push({
      userId: null,
      anonId: `seed-read-${slug}-${i}`,
      sessionId: `seed-sess-${slug}-c${i}`,
      postId: id,
      eventType: "POST_READ_COMPLETE",
      ts: at,
      dwellMs: 20000 + Math.round(rand01(hash(slug) + 400 + i) * 90000),
      scrollDepth: 0.8 + rand01(hash(slug) + 500 + i) * 0.2,
      referrer: null,
      meta: {}
    });
  }
  if (eventDocs.length > 0) {
    dbx.BlogEvents.insertMany(eventDocs);
  }

  grandViews += viewDocs.length;
  grandReactions += reactCount;
  grandReads += readCount;
  print(`${slug}: views=${viewDocs.length}, reactions=${reactCount}, reads=${readCount}`);
});

print(`TOTAL: posts=${posts.length}, views=${grandViews}, reactions=${grandReactions}, reads=${grandReads}`);
