// mongosh: публикует статьи из массива NEWS (его подставляет deploy/import-news.sh перед этим файлом).
// Повторный запуск пропускает адреса, которые уже есть, — правки статей делаются в админке.
let created = 0;
for (const p of NEWS) {
  if (db.BlogPosts.countDocuments({ slug: p.slug }) > 0) {
    print("exists  " + p.slug);
    continue;
  }
  const postId = new ObjectId();
  const versionId = new ObjectId();
  const published = new Date(p.publishedAt);
  db.BlogPosts.insertOne({
    _id: postId,
    slug: p.slug,
    externalId: p.externalId,
    title: p.title,
    excerpt: p.excerpt,
    titleI18n: p.titleI18n,
    excerptI18n: p.excerptI18n,
    coverAssetId: null,
    coverUrl: p.coverUrl,
    status: "PUBLISHED",
    publishedAt: published,
    scheduledAt: null,
    createdAt: published,
    updatedAt: published,
    authorId: "editorial",
    authorName: "Tale Shop editorial",
    tags: p.tags,
    topics: p.topics,
    readingTime: p.readingTime,
    currentVersionId: versionId.toString(),
    viewCount: 0,
    editorScore: 70,
    is_featured: p.featured,
    is_blog_home_featured: p.homeFeatured,
  });
  db.BlogPostVersions.insertOne({
    _id: versionId,
    postId: postId.toString(),
    versionNumber: 1,
    title: p.title,
    excerpt: p.excerpt,
    titleI18n: p.titleI18n,
    excerptI18n: p.excerptI18n,
    contentMarkdown: p.contentMarkdown,
    contentHtml: p.contentHtml,
    contentMarkdownI18n: p.contentMarkdownI18n,
    contentHtmlI18n: p.contentHtmlI18n,
    coverAssetId: null,
    createdAt: published,
    createdBy: "editorial",
    changeNote: "Published",
  });
  created++;
  print("created " + p.slug);
}
print("created: " + created + ", total posts: " + db.BlogPosts.countDocuments());
