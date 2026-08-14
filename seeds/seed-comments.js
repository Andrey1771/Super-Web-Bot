// Демо-комментарии под постами блога. Идемпотентен: удаляет свои по anonId seed-
// и сеет заново. Запуск: mongosh SteamShopDatabase seed-comments.js (на mongo3).

const dbx = db.getSiblingDB("SteamShopDatabase");
const now = new Date();

const removed = dbx.BlogComments.deleteMany({ anonId: /^seed-/ }).deletedCount;
print(`cleanup: removed ${removed} seed comments`);

// Комментарии написаны под содержание конкретных постов — случайный набор фраз
// выглядел бы как спам.
const COMMENTS_BY_SLUG = {
  "sale-up-to-85-off": [
    { name: "Marcus", text: "Grabbed RE4 for $6, absolute steal. Thanks for the heads up!" },
    { name: "Lena", text: "The Witness ends tomorrow?? Ok that decided my evening." },
    { name: "Pavel", text: "Wish the sale included some newer RPGs, but DOOM at $16 is fair." },
    { name: "Kit", text: "The Biggest discount sort is a nice touch, found two games I missed." }
  ],
  "how-game-keys-work": [
    { name: "Dana", text: "Finally a clear explanation of region locks. Sent this to a friend who almost bought a RU-only key elsewhere." },
    { name: "Tom", text: "Good read. Would love a follow-up on gift links vs keys." },
    { name: "Arseniy", text: "The activation walkthrough saved me a support ticket, cheers." }
  ],
  "what-happens-after-you-buy": [
    { name: "Mia", text: "Bought a key yesterday — the email landed in about a minute, exactly as described." },
    { name: "Greg", text: "Useful. The spam-folder tip is real, that's where mine was." }
  ],
  "elden-ring-where-to-start": [
    { name: "Sasha", text: "120 hours in and I still agree with every point here. Vagabond is the way." },
    { name: "Nora", text: "The 'don't rush Margit' advice is so true. Level up in Limgrave first." },
    { name: "Deniz", text: "Great guide, would add: grab the crafting kit early, it's cheap." },
    { name: "Iris", text: "This finally got me to start my first playthrough. No regrets so far." }
  ],
  "new-this-month": [
    { name: "Oleg", text: "Nice to see co-op titles coming back in stock." },
    { name: "Fern", text: "Any chance of getting more horror titles next month?" },
    { name: "Jules", text: "The strategy picks this month are solid, grabbed two." }
  ],
  "co-op-picks-for-two": [
    { name: "Katya", text: "It Takes Two is worth every ruble, finished it with my sister in a weekend." },
    { name: "Ben", text: "Played through half this list with my partner already. Great picks, waiting for more." },
    { name: "Ravi", text: "Deep Rock is criminally underrated for duos. Rock and stone!" },
    { name: "Emma", text: "Bought two keys through the site, both activated instantly. Nice list!" },
    { name: "Léo", text: "Would love a follow-up list for 3-4 player groups." }
  ]
};

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

let totalInserted = 0;
dbx.BlogPosts.find({ status: "PUBLISHED" }).forEach((post) => {
  const id = typeof post._id === "string" ? post._id : post._id.toHexString();
  const slug = post.slug || id;
  const list = COMMENTS_BY_SLUG[slug];
  if (!list) {
    print(`${slug}: no scripted comments, skipped`);
    return;
  }

  const published = post.publishedAt ? new Date(post.publishedAt) : new Date(now.getTime() - 14 * 864e5);
  const spanMs = Math.max(now - published, 864e5);

  const docs = list.map((comment, index) => {
    // Комментарии появляются после публикации, в хронологическом порядке.
    const offset = ((index + 1) / (list.length + 1) + (rand01(hash(slug) + index) - 0.5) * 0.1) * spanMs;
    const at = new Date(published.getTime() + Math.max(offset, 36e5));
    return {
      postId: id,
      userId: "",
      anonId: `seed-comment-${slug}-${index}`,
      authorName: comment.name,
      text: comment.text,
      createdAt: at
    };
  });

  dbx.BlogComments.insertMany(docs);
  totalInserted += docs.length;
  print(`${slug}: ${docs.length} comments`);
});

print(`TOTAL inserted: ${totalInserted}`);
