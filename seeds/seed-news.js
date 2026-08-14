// Демо-наполнение раздела новостей. Идемпотентно: пост с существующим slug пропускается.
//
// ВАЖНО про имена полей: BlogPostDb хранит всё в camelCase, КРОМЕ двух флагов —
// is_featured и is_blog_home_featured. Ошибка здесь даёт документы, которые
// приложение прочитает частично и молча.
const db = db.getSiblingDB('SteamShopDatabase');
const now = Date.now();
const day = 86400000;

const posts = [
  {
    slug: "how-game-keys-work",
    title: "How game keys work — and why ours are region-free",
    excerpt: "A key is not a copy of the game. Here is what you actually buy, where it gets activated, and why a region lock can quietly ruin the purchase.",
    tags: ["Guides"], topics: ["Buying"], readingTime: 4, ago: 2,
    featured: true, home: true, views: 412,
    md: "## What a key actually is\n\nA game key is a one-time code that adds the game to **your** library on a store like Steam. The download comes from the store, not from us — we never host the game itself.\n\nThat has one practical consequence: once a key is activated, it belongs to that account forever. It cannot be moved, resold or split between two people.\n\n## Where region locks come from\n\nPublishers sometimes sell the same game cheaper in one country than another, and stop the cheap key from working elsewhere. A buyer in Berlin ends up with a code that only activates on a Turkish account.\n\nWe do not sell those. Every key in the catalog activates anywhere — that is why you will not find a region switch on this site.\n\n## Before you buy\n\n- Check which store the key is for. A Steam key will not work on Epic.\n- Make sure you do not already own the game — an activated key cannot be refunded.\n- Activate it soon. Keys do not expire, but problems are easier to sort out while the order is fresh."
  },
  {
    slug: "sale-up-to-85-off",
    title: "Sale: 12 games at up to 85% off",
    excerpt: "Resident Evil 4 at six dollars, DOOM Eternal at sixteen, and ten more. Two of them end within a day and a half.",
    tags: ["News", "Deals"], topics: ["Deals"], readingTime: 2, ago: 1,
    featured: true, home: false, views: 938,
    md: "## The short list\n\nTwelve titles are discounted right now, from 15% to 85% off. The biggest cuts:\n\n- **Resident Evil 4** — 85% off, down to $6\n- **Metal Gear Rising: Revengeance** — 80% off, down to $4\n- **EA Sports FC 25** — 70% off, down to $21\n- **DOOM Eternal** — 60% off, down to $16\n- **Persona 5 Royal** — 50% off, down to $30\n\n## Ending soonest\n\n**The Witness** and **Red Dead Redemption 2** come off sale within about a day and a half. The rest run for a week or longer.\n\nYou can see everything currently discounted with the *On sale* filter in the catalog, or sort by *Biggest discount* to put the deepest cuts first."
  },
  {
    slug: "what-happens-after-you-buy",
    title: "What actually happens after you buy a key",
    excerpt: "Delivery is instant, but instant is not magic. Here is the sequence, and what to do at each step if something looks wrong.",
    tags: ["Guides", "Support"], topics: ["Buying"], readingTime: 3, ago: 5,
    featured: false, home: false, views: 205,
    md: "## The sequence\n\n1. Payment is confirmed by the provider — usually a few seconds.\n2. A key is taken out of our stock and assigned to your account. Nobody else can receive it after that.\n3. The key appears in your orders and goes out by email.\n\n## If the key is not there\n\nCheck your orders page first — email is the slower of the two channels and can land in spam.\n\nIf the order says the key is on the way, it means stock ran out between your payment and delivery. That is on us, not you: write to support and we either restock or refund in full.\n\n## If the key does not activate\n\nDo not try it repeatedly — stores temporarily block accounts after several failed codes. Send us the exact error text instead. Nine times out of ten it is the wrong store, not a bad key."
  },
  {
    slug: "elden-ring-where-to-start",
    title: "Elden Ring: where to start if you bounced off it",
    excerpt: "Most people quit in the first two hours, and almost always for the same reason: they walked straight into the boss the game expected them to avoid.",
    tags: ["Guides"], topics: ["RPG"], readingTime: 6, ago: 9,
    featured: false, home: false, views: 671,
    md: "## The first mistake\n\nThe mounted knight near the starting gate is not a tutorial boss. He is a signpost saying *go around*. The game never says so, and a lot of players read that wall as their own failure.\n\nRide past him. The map is open in every direction.\n\n## Where to go instead\n\nHead east along the road. The early fort there gives you a map fragment, a few upgrade materials and a much gentler difficulty curve.\n\n## Two settings that change everything\n\n- Turn on **item pickup notifications** in the HUD options. The game hides most of its guidance in item descriptions.\n- Bind your summon to a key you will actually press. Spirit ashes are not cheating — they are the difficulty slider.\n\n## When it clicks\n\nAround hour six, when you stop treating every enemy as a wall and start treating the map as a menu. If you are not there yet, you have not seen the game the reviews were about."
  },
  {
    slug: "new-this-month",
    title: "New in the catalog this month",
    excerpt: "Fresh arrivals across strategy, horror and co-op — plus a few older titles that finally came back in stock.",
    tags: ["News"], topics: ["Catalog"], readingTime: 2, ago: 14,
    featured: false, home: false, views: 148,
    md: "## Arrivals\n\nThe catalog grew across three shelves this month — strategy, horror and things you can play with one other person.\n\n## Back in stock\n\nSeveral titles that had been sold out for weeks have keys again. Stock on those is thin, so the catalog says how many are left once it drops to three or fewer.\n\n## What is coming\n\nUnreleased games live in the catalog too, with their release date instead of a buy button. You can find them with the *Coming soon* filter and add them to your wishlist — we will tell you when they land."
  },
  {
    slug: "co-op-picks-for-two",
    title: "Six co-op picks for exactly two players",
    excerpt: "Not four, not a raid group. Two people on a sofa or a voice call, and games that were actually built for that number.",
    tags: ["Lists"], topics: ["Co-op"], readingTime: 5, ago: 21,
    featured: false, home: false, views: 523,
    md: "## Why two is its own category\n\nMost co-op lists quietly assume you have three friends free on a Tuesday. Games designed for exactly two are a different shape: they lean on conversation instead of coordination.\n\n## The picks\n\n- Something to argue over a blueprint with\n- Something where one of you reads and the other runs\n- Something short enough to finish in one evening\n- Something long enough to become a habit\n- Something you can play badly and still enjoy\n- Something to end the night on\n\n## One rule\n\nBuy two copies only when the game actually needs them. Several of these ship with a friend pass — the store page says so, and we do not charge you twice for what the publisher gives away."
  }
];

// Разметка простая нарочно: витрина строит оглавление по h2, а всё остальное —
// абзацы и списки. Ничего, что пришлось бы чистить санитайзером.
function toHtml(md) {
  return md.split("\n\n").map(function (block) {
    if (block.indexOf("## ") === 0) {
      return "<h2>" + block.slice(3) + "</h2>";
    }
    if (block.indexOf("- ") === 0) {
      return "<ul>" + block.split("\n").map(function (l) { return "<li>" + l.slice(2) + "</li>"; }).join("") + "</ul>";
    }
    if (/^\d\./.test(block)) {
      return "<ol>" + block.split("\n").map(function (l) { return "<li>" + l.replace(/^\d\.\s*/, "") + "</li>"; }).join("") + "</ol>";
    }
    return "<p>" + block.replace(/\n/g, " ") + "</p>";
  }).join("")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

var created = 0;
posts.forEach(function (p) {
  if (db.BlogPosts.countDocuments({ slug: p.slug }) > 0) {
    print("уже есть, пропуск: " + p.slug);
    return;
  }

  var published = new Date(now - p.ago * day);
  var postId = new ObjectId();
  var versionId = new ObjectId();

  db.BlogPosts.insertOne({
    _id: postId,
    slug: p.slug,
    externalId: "seed-" + p.slug,
    title: p.title,
    excerpt: p.excerpt,
    coverAssetId: null,
    coverUrl: null,
    status: "PUBLISHED",
    publishedAt: published,
    scheduledAt: null,
    createdAt: published,
    updatedAt: published,
    authorId: "seed-editor",
    authorName: "Tale Shop editorial",
    tags: p.tags,
    topics: p.topics,
    readingTime: p.readingTime,
    currentVersionId: versionId.toString(),
    viewCount: p.views,
    editorScore: 70,
    is_featured: p.featured,
    is_blog_home_featured: p.home
  });

  db.BlogPostVersions.insertOne({
    _id: versionId,
    postId: postId.toString(),
    versionNumber: 1,
    title: p.title,
    excerpt: p.excerpt,
    contentMarkdown: p.md,
    contentHtml: toHtml(p.md),
    coverAssetId: null,
    createdAt: published,
    createdBy: "seed-editor",
    changeNote: "Seeded demo content"
  });

  created++;
  print("создан  " + published.toISOString().slice(0, 10) + "  " + p.title);
});

print("");
print("постов: " + db.BlogPosts.countDocuments() + " (создано сейчас: " + created + "), версий: " + db.BlogPostVersions.countDocuments());
