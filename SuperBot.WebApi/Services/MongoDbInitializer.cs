using MongoDB.Bson;
using MongoDB.Driver;

namespace SuperBot.WebApi.Services
{
    public class MongoDbInitializer
    {
        private readonly IMongoDatabase _database;
        private readonly IWebHostEnvironment _environment;
        private readonly ILogger<MongoDbInitializer> _logger;

        public MongoDbInitializer(
            IMongoDatabase database,
            IWebHostEnvironment environment,
            ILogger<MongoDbInitializer> logger)
        {
            _database = database;
            _environment = environment;
            _logger = logger;
        }

        // Метод для инициализации коллекций
        public async Task InitializeAsync()
        {
            // ПОЛНЫЙ перечень коллекций проекта — единственное место, где видно состав базы целиком.
            // Mongo создала бы их и сама при первой записи; список нужен как карта хранилища,
            // поэтому при появлении новой коллекции её обязательно добавлять сюда.
            var collectionsToEnsure = new[]
            {
                // Каталог и контент товара
                "Games",
                "GameDetails",
                "GameDiscounts",
                // Курсы валют: коллекция только на добавление, актуальным считается последний снимок.
                "FxRates",
                "GameKeys",
                "GameReviews",
                "GameReviewHelpfulVotes",
                "GameTrackingEvents",
                "MediaAssets",

                // Покупатель: аккаунт, корзина, витринные списки
                "Users",
                "Cart",
                "WishlistItems",
                "ViewedGames",
                "BillingProfiles",
                "RecoveryRequests",

                // Заказы и платежи
                "Orders",
                "SteamOrders",
                "PaymentFinalizationStates",
                "PaymentFinalizationFailures",
                "StripeWebhookEvents",
                "CryptoInvoiceStates",
                "PromoCodes",
                "PromoCodeUsages",
                "CashbackEntries",
                "CashbackAccounts",

                // Витрина главной страницы
                "DealOfWeekSettings",
                "TarotSettings",
                "TarotDraws",
                "TarotDrawLocks",

                // Раздел News (бывший блог)
                "BlogPosts",
                "BlogPostVersions",
                "BlogEvents",
                "BlogComments",
                "BlogCommentBans",
                "BlogPostUniqueViews",
                "BlogViewSettings",
                "BlogHomepageSettings",
                "UserBlogProfiles",

                // Рассылка
                "NewsletterSubscribers",
                "NewsletterCampaigns",
                "NewsletterState",

                // Приглашения оставить отзыв: по письму на заказ и явные отказы от них
                "ReviewInvites",
                "ReviewInviteOptOuts",

                // Письма о кэшбэке: по письму на событие и отказы от них
                "CashbackNotices",
                "CashbackNoticeOptOuts",

                // Поддержка: тикеты и живой чат
                "SupportTickets",
                "SupportMessages",
                "SupportAttachments",
                "SupportTicketCounters",
                "SupportChatSessions",
                "SupportChatMessages",
                "SupportKnowledgeArticles",

                // Telegram-бот: привязка аккаунтов, состояние диалогов, исходящие события
                "TelegramLinks",
                "TelegramLinkTokens",
                "BotChatStates",
                "BotResources",
                "BotOutbox",

                // Служебное: настройки сайта, аналитика, импорт данных
                "Settings",
                "AnalyticsSettings",
                "ImportJobs"
            };

            var existingCollections = await _database.ListCollectionNamesAsync();

            // Проверяем наличие каждой коллекции, если нет — создаем
            var existingCollectionsList = await existingCollections.ToListAsync();
            foreach (var collectionName in collectionsToEnsure)
            {
                if (!existingCollectionsList.Contains(collectionName))
                {
                    await _database.CreateCollectionAsync(collectionName);
                }
            }

            var wishlistCollection = _database.GetCollection<SuperBot.Infrastructure.Data.WishlistItemDb>("WishlistItems");
            var wishlistIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.WishlistItemDb>(
                Builders<SuperBot.Infrastructure.Data.WishlistItemDb>.IndexKeys
                    .Ascending(item => item.UserId)
                    .Ascending(item => item.GameId),
                new CreateIndexOptions { Unique = true, Name = "ix_wishlist_user_game" }
            );

            await wishlistCollection.Indexes.CreateOneAsync(wishlistIndex);

            // Подписчики рассылки (см. NewsletterController) — один документ на email.
            var newsletterCollection = _database.GetCollection<MongoDB.Bson.BsonDocument>("NewsletterSubscribers");
            var newsletterEmailIndex = new CreateIndexModel<MongoDB.Bson.BsonDocument>(
                Builders<MongoDB.Bson.BsonDocument>.IndexKeys.Ascending("Email"),
                new CreateIndexOptions { Unique = true, Name = "ix_newsletter_email" }
            );

            await newsletterCollection.Indexes.CreateOneAsync(newsletterEmailIndex);

            // Поиск по токенам подтверждения/отписки — точечные выборки в NewsletterController.
            await newsletterCollection.Indexes.CreateOneAsync(new CreateIndexModel<MongoDB.Bson.BsonDocument>(
                Builders<MongoDB.Bson.BsonDocument>.IndexKeys.Ascending("ConfirmToken"),
                new CreateIndexOptions { Sparse = true, Name = "ix_newsletter_confirm_token" }));
            await newsletterCollection.Indexes.CreateOneAsync(new CreateIndexModel<MongoDB.Bson.BsonDocument>(
                Builders<MongoDB.Bson.BsonDocument>.IndexKeys.Ascending("UnsubscribeToken"),
                new CreateIndexOptions { Sparse = true, Name = "ix_newsletter_unsub_token" }));

            // Приглашение оставить отзыв — ровно одно на заказ. Уникальность здесь не
            // украшение: отметка ставится до отправки, и при нескольких репликах именно
            // индекс не даёт двум задачам написать человеку дважды про один заказ.
            var reviewInvites = _database.GetCollection<MongoDB.Bson.BsonDocument>("ReviewInvites");
            await reviewInvites.Indexes.CreateOneAsync(new CreateIndexModel<MongoDB.Bson.BsonDocument>(
                Builders<MongoDB.Bson.BsonDocument>.IndexKeys.Ascending("OrderId"),
                new CreateIndexOptions { Unique = true, Name = "ix_review_invite_order" }));

            // Отказ от приглашений — один документ на адрес.
            var reviewOptOuts = _database.GetCollection<MongoDB.Bson.BsonDocument>("ReviewInviteOptOuts");
            await reviewOptOuts.Indexes.CreateOneAsync(new CreateIndexModel<MongoDB.Bson.BsonDocument>(
                Builders<MongoDB.Bson.BsonDocument>.IndexKeys.Ascending("Email"),
                new CreateIndexOptions { Unique = true, Name = "ix_review_optout_email" }));

            // Письма о кэшбэке — одно на событие (разблокировку начисления или сгорание). Отметка ставится до
            // отправки, и дубль письма при нескольких репликах не пропускает именно этот индекс.
            var cashbackNotices = _database.GetCollection<MongoDB.Bson.BsonDocument>("CashbackNotices");
            await cashbackNotices.Indexes.CreateOneAsync(new CreateIndexModel<MongoDB.Bson.BsonDocument>(
                Builders<MongoDB.Bson.BsonDocument>.IndexKeys.Ascending("Key"),
                new CreateIndexOptions { Unique = true, Name = "ix_cashback_notice_key" }));
            var cashbackNoticeOptOuts = _database.GetCollection<MongoDB.Bson.BsonDocument>("CashbackNoticeOptOuts");
            await cashbackNoticeOptOuts.Indexes.CreateOneAsync(new CreateIndexModel<MongoDB.Bson.BsonDocument>(
                Builders<MongoDB.Bson.BsonDocument>.IndexKeys.Ascending("Email"),
                new CreateIndexOptions { Unique = true, Name = "ix_cashback_notice_optout_email" }));

            var viewedCollection = _database.GetCollection<SuperBot.Infrastructure.Data.ViewedGameDb>("ViewedGames");
            var viewedUserGameIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.ViewedGameDb>(
                Builders<SuperBot.Infrastructure.Data.ViewedGameDb>.IndexKeys
                    .Ascending(item => item.UserId)
                    .Ascending(item => item.GameId),
                new CreateIndexOptions { Unique = true, Name = "ix_viewed_user_game" }
            );
            var viewedUserDateIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.ViewedGameDb>(
                Builders<SuperBot.Infrastructure.Data.ViewedGameDb>.IndexKeys
                    .Ascending(item => item.UserId)
                    .Descending(item => item.LastViewedAt),
                new CreateIndexOptions { Name = "ix_viewed_user_last_viewed" }
            );

            await viewedCollection.Indexes.CreateOneAsync(viewedUserGameIndex);
            await viewedCollection.Indexes.CreateOneAsync(viewedUserDateIndex);

            var gameDetailsCollection = _database.GetCollection<SuperBot.Infrastructure.Data.GameDetailsDb>("GameDetails");
            var detailsSlugIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.GameDetailsDb>(
                Builders<SuperBot.Infrastructure.Data.GameDetailsDb>.IndexKeys.Ascending(item => item.Slug),
                new CreateIndexOptions { Unique = true, Name = "ix_game_details_slug", Sparse = true }
            );
            var detailsGameIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.GameDetailsDb>(
                Builders<SuperBot.Infrastructure.Data.GameDetailsDb>.IndexKeys.Ascending(item => item.GameId),
                new CreateIndexOptions { Unique = true, Name = "ix_game_details_game" }
            );
            await gameDetailsCollection.Indexes.CreateOneAsync(detailsSlugIndex);
            await gameDetailsCollection.Indexes.CreateOneAsync(detailsGameIndex);

            var reviewCollection = _database.GetCollection<SuperBot.Infrastructure.Data.GameReviewDb>("GameReviews");
            var reviewGameDateIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.GameReviewDb>(
                Builders<SuperBot.Infrastructure.Data.GameReviewDb>.IndexKeys
                    .Ascending(item => item.GameId)
                    .Descending(item => item.CreatedAt),
                new CreateIndexOptions { Name = "ix_game_reviews_game_created" }
            );
            var reviewGameRatingIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.GameReviewDb>(
                Builders<SuperBot.Infrastructure.Data.GameReviewDb>.IndexKeys
                    .Ascending(item => item.GameId)
                    .Descending(item => item.Rating),
                new CreateIndexOptions { Name = "ix_game_reviews_game_rating" }
            );
            var reviewUserGameIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.GameReviewDb>(
                Builders<SuperBot.Infrastructure.Data.GameReviewDb>.IndexKeys
                    .Ascending(item => item.UserId)
                    .Ascending(item => item.GameId),
                new CreateIndexOptions { Name = "ix_game_reviews_user_game", Unique = true, Sparse = true }
            );
            await reviewCollection.Indexes.CreateOneAsync(reviewGameDateIndex);
            await reviewCollection.Indexes.CreateOneAsync(reviewGameRatingIndex);
            await reviewCollection.Indexes.CreateOneAsync(reviewUserGameIndex);

            var reviewHelpfulCollection = _database.GetCollection<SuperBot.Infrastructure.Data.GameReviewHelpfulVoteDb>("GameReviewHelpfulVotes");
            var helpfulIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.GameReviewHelpfulVoteDb>(
                Builders<SuperBot.Infrastructure.Data.GameReviewHelpfulVoteDb>.IndexKeys
                    .Ascending(item => item.ReviewId)
                    .Ascending(item => item.UserId),
                new CreateIndexOptions { Name = "ix_review_helpful_unique", Unique = true }
            );
            await reviewHelpfulCollection.Indexes.CreateOneAsync(helpfulIndex);

            var trackingCollection = _database.GetCollection<SuperBot.Infrastructure.Data.GameTrackingEventDb>("GameTrackingEvents");
            var trackingGameIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.GameTrackingEventDb>(
                Builders<SuperBot.Infrastructure.Data.GameTrackingEventDb>.IndexKeys
                    .Ascending(item => item.GameId)
                    .Descending(item => item.Timestamp),
                new CreateIndexOptions { Name = "ix_game_tracking_game_ts" }
            );
            await trackingCollection.Indexes.CreateOneAsync(trackingGameIndex);

            var blogPostsCollection = _database.GetCollection<SuperBot.Infrastructure.Data.BlogPostDb>("BlogPosts");
            var blogSlugIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.BlogPostDb>(
                Builders<SuperBot.Infrastructure.Data.BlogPostDb>.IndexKeys.Ascending(item => item.Slug),
                new CreateIndexOptions { Unique = true, Name = "ix_blog_posts_slug" }
            );
            var blogPublishedIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.BlogPostDb>(
                Builders<SuperBot.Infrastructure.Data.BlogPostDb>.IndexKeys.Descending(item => item.PublishedAt),
                new CreateIndexOptions { Name = "ix_blog_posts_published_at" }
            );
            var blogTagsIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.BlogPostDb>(
                Builders<SuperBot.Infrastructure.Data.BlogPostDb>.IndexKeys.Ascending(item => item.Tags),
                new CreateIndexOptions { Name = "ix_blog_posts_tags" }
            );
            var blogStatusPublishedIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.BlogPostDb>(
                Builders<SuperBot.Infrastructure.Data.BlogPostDb>.IndexKeys
                    .Ascending(item => item.Status)
                    .Descending(item => item.PublishedAt),
                new CreateIndexOptions { Name = "ix_blog_posts_status_published" }
            );

            await blogPostsCollection.Indexes.CreateOneAsync(blogSlugIndex);
            await blogPostsCollection.Indexes.CreateOneAsync(blogPublishedIndex);
            await blogPostsCollection.Indexes.CreateOneAsync(blogTagsIndex);
            await blogPostsCollection.Indexes.CreateOneAsync(blogStatusPublishedIndex);

            var blogEventsCollection = _database.GetCollection<SuperBot.Infrastructure.Data.BlogEventDb>("BlogEvents");
            var blogEventPostIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.BlogEventDb>(
                Builders<SuperBot.Infrastructure.Data.BlogEventDb>.IndexKeys
                    .Ascending(item => item.PostId)
                    .Descending(item => item.Timestamp),
                new CreateIndexOptions { Name = "ix_blog_events_post_ts" }
            );
            var blogEventUserIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.BlogEventDb>(
                Builders<SuperBot.Infrastructure.Data.BlogEventDb>.IndexKeys
                    .Ascending(item => item.UserId)
                    .Descending(item => item.Timestamp),
                new CreateIndexOptions { Name = "ix_blog_events_user_ts" }
            );
            var blogEventAnonIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.BlogEventDb>(
                Builders<SuperBot.Infrastructure.Data.BlogEventDb>.IndexKeys
                    .Ascending(item => item.AnonId)
                    .Descending(item => item.Timestamp),
                new CreateIndexOptions { Name = "ix_blog_events_anon_ts" }
            );
            var blogEventTypeIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.BlogEventDb>(
                Builders<SuperBot.Infrastructure.Data.BlogEventDb>.IndexKeys
                    .Ascending(item => item.EventType)
                    .Descending(item => item.Timestamp),
                new CreateIndexOptions { Name = "ix_blog_events_type_ts" }
            );

            await blogEventsCollection.Indexes.CreateOneAsync(blogEventPostIndex);
            await blogEventsCollection.Indexes.CreateOneAsync(blogEventUserIndex);
            await blogEventsCollection.Indexes.CreateOneAsync(blogEventAnonIndex);
            await blogEventsCollection.Indexes.CreateOneAsync(blogEventTypeIndex);

            // Комментарии читаются только лентой конкретного поста, новые первыми.
            var blogCommentsCollection = _database.GetCollection<SuperBot.Infrastructure.Data.BlogCommentDb>("BlogComments");
            var blogCommentsPostIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.BlogCommentDb>(
                Builders<SuperBot.Infrastructure.Data.BlogCommentDb>.IndexKeys
                    .Ascending(item => item.PostId)
                    .Descending(item => item.CreatedAt),
                new CreateIndexOptions { Name = "ix_blog_comments_post_created" }
            );
            await blogCommentsCollection.Indexes.CreateOneAsync(blogCommentsPostIndex);

            // Один бан на пользователя; проверка «забанен ли» идёт по userId на каждый POST.
            var blogCommentBansCollection = _database.GetCollection<SuperBot.Infrastructure.Data.BlogCommentBanDb>("BlogCommentBans");
            var blogCommentBansUserIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.BlogCommentBanDb>(
                Builders<SuperBot.Infrastructure.Data.BlogCommentBanDb>.IndexKeys.Ascending(item => item.UserId),
                new CreateIndexOptions { Unique = true, Name = "ix_blog_comment_bans_user" }
            );
            await blogCommentBansCollection.Indexes.CreateOneAsync(blogCommentBansUserIndex);

            var blogUniqueViewsCollection = _database.GetCollection<SuperBot.Infrastructure.Data.BlogPostUniqueViewDb>("BlogPostUniqueViews");
            var uniqueViewerIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.BlogPostUniqueViewDb>(
                Builders<SuperBot.Infrastructure.Data.BlogPostUniqueViewDb>.IndexKeys
                    .Ascending(item => item.PostId)
                    .Ascending(item => item.ViewerKey),
                new CreateIndexOptions { Name = "ix_blog_unique_views_post_viewer", Unique = true }
            );
            var uniqueViewsPostIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.BlogPostUniqueViewDb>(
                Builders<SuperBot.Infrastructure.Data.BlogPostUniqueViewDb>.IndexKeys.Ascending(item => item.PostId),
                new CreateIndexOptions { Name = "ix_blog_unique_views_post" }
            );
            var uniqueViewsGuestIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.BlogPostUniqueViewDb>(
                Builders<SuperBot.Infrastructure.Data.BlogPostUniqueViewDb>.IndexKeys.Ascending(item => item.IsGuest),
                new CreateIndexOptions { Name = "ix_blog_unique_views_guest" }
            );
            var uniqueViewsExcludedIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.BlogPostUniqueViewDb>(
                Builders<SuperBot.Infrastructure.Data.BlogPostUniqueViewDb>.IndexKeys.Ascending(item => item.IsExcludedFromPublicCounts),
                new CreateIndexOptions { Name = "ix_blog_unique_views_excluded" }
            );
            var uniqueViewsCountedIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.BlogPostUniqueViewDb>(
                Builders<SuperBot.Infrastructure.Data.BlogPostUniqueViewDb>.IndexKeys.Ascending(item => item.CountedInPublicCounts),
                new CreateIndexOptions { Name = "ix_blog_unique_views_counted_public" }
            );

            await blogUniqueViewsCollection.Indexes.CreateOneAsync(uniqueViewerIndex);
            await blogUniqueViewsCollection.Indexes.CreateOneAsync(uniqueViewsPostIndex);
            await blogUniqueViewsCollection.Indexes.CreateOneAsync(uniqueViewsGuestIndex);
            await blogUniqueViewsCollection.Indexes.CreateOneAsync(uniqueViewsExcludedIndex);
            await blogUniqueViewsCollection.Indexes.CreateOneAsync(uniqueViewsCountedIndex);

            var blogProfilesCollection = _database.GetCollection<SuperBot.Infrastructure.Data.UserBlogProfileDb>("UserBlogProfiles");

            // Индексы профилей блога: уникальные, но ЧАСТИЧНЫЕ, а не sparse.
            //
            // Раньше здесь стояло Sparse = true, и это не работало. Sparse пропускает документ,
            // только если поля НЕТ вовсе; у анонимного посетителя userId записывается явным
            // null — поле есть, значение null, индекс его учитывает. Первый аноним профиль
            // создавал, второй падал с duplicate key по { userId: null }, и статистика чтения
            // новостей для незалогиненных не работала вообще. Наружу это выглядело как «мало
            // читают», а не как поломка.
            //
            // $type в частичном фильтре решает ровно это: в индекс попадают только документы,
            // где поле — строка. Ни null, ни отсутствующее значение под условие не подходят.
            // ($ne в partialFilterExpression Mongo не принимает, поэтому именно $type.)
            var existingProfileIndexes = await (await blogProfilesCollection.Indexes.ListAsync()).ToListAsync();
            foreach (var legacy in new[] { "ix_blog_profiles_user", "ix_blog_profiles_anon" })
            {
                var current = existingProfileIndexes.FirstOrDefault(i => i.GetValue("name", "").AsString == legacy);
                // Пересоздаём только старую форму: у частичного индекса менять нечего, а
                // лишний drop на каждом старте снимал бы уникальность на доли секунды.
                if (current != null && !current.Contains("partialFilterExpression"))
                {
                    try { await blogProfilesCollection.Indexes.DropOneAsync(legacy); } catch (MongoCommandException) { }
                }
            }

            var blogProfileUserIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.UserBlogProfileDb>(
                Builders<SuperBot.Infrastructure.Data.UserBlogProfileDb>.IndexKeys.Ascending(item => item.UserId),
                new CreateIndexOptions<SuperBot.Infrastructure.Data.UserBlogProfileDb>
                {
                    Name = "ix_blog_profiles_user",
                    Unique = true,
                    PartialFilterExpression = Builders<SuperBot.Infrastructure.Data.UserBlogProfileDb>
                        .Filter.Type(item => item.UserId, MongoDB.Bson.BsonType.String)
                }
            );
            var blogProfileAnonIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.UserBlogProfileDb>(
                Builders<SuperBot.Infrastructure.Data.UserBlogProfileDb>.IndexKeys.Ascending(item => item.AnonId),
                new CreateIndexOptions<SuperBot.Infrastructure.Data.UserBlogProfileDb>
                {
                    Name = "ix_blog_profiles_anon",
                    Unique = true,
                    PartialFilterExpression = Builders<SuperBot.Infrastructure.Data.UserBlogProfileDb>
                        .Filter.Type(item => item.AnonId, MongoDB.Bson.BsonType.String)
                }
            );
            var blogProfileUpdatedIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.UserBlogProfileDb>(
                Builders<SuperBot.Infrastructure.Data.UserBlogProfileDb>.IndexKeys.Descending(item => item.UpdatedAt),
                new CreateIndexOptions { Name = "ix_blog_profiles_updated" }
            );

            await blogProfilesCollection.Indexes.CreateOneAsync(blogProfileUserIndex);
            await blogProfilesCollection.Indexes.CreateOneAsync(blogProfileAnonIndex);
            await blogProfilesCollection.Indexes.CreateOneAsync(blogProfileUpdatedIndex);

            var promoCodeCollection = _database.GetCollection<SuperBot.Infrastructure.Data.PromoCodeDb>("PromoCodes");
            var promoCodeIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.PromoCodeDb>(
                Builders<SuperBot.Infrastructure.Data.PromoCodeDb>.IndexKeys.Ascending(item => item.Code),
                new CreateIndexOptions { Name = "ix_promo_codes_code", Unique = true }
            );
            await promoCodeCollection.Indexes.CreateOneAsync(promoCodeIndex);

            var promoUsageCollection = _database.GetCollection<SuperBot.Infrastructure.Data.PromoCodeUsageDb>("PromoCodeUsages");
            var promoUsageCodeIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.PromoCodeUsageDb>(
                Builders<SuperBot.Infrastructure.Data.PromoCodeUsageDb>.IndexKeys
                    .Ascending(item => item.PromoCodeId)
                    .Ascending(item => item.UserName),
                new CreateIndexOptions { Name = "ix_promo_usages_code_user" }
            );
            await promoUsageCollection.Indexes.CreateOneAsync(promoUsageCodeIndex);

            // Один заказ — одна запись использования кода: финализацию оплаты зовут и confirm, и
            // вебхук, и оба пытаются учесть промокод. Записи без заказа (старые) индекс не трогает.
            try
            {
                await promoUsageCollection.Indexes.CreateOneAsync(new CreateIndexModel<SuperBot.Infrastructure.Data.PromoCodeUsageDb>(
                    Builders<SuperBot.Infrastructure.Data.PromoCodeUsageDb>.IndexKeys
                        .Ascending(item => item.PromoCodeId)
                        .Ascending(item => item.OrderId),
                    new CreateIndexOptions<SuperBot.Infrastructure.Data.PromoCodeUsageDb>
                    {
                        Name = "ix_promo_usages_order_unique",
                        Unique = true,
                        PartialFilterExpression = Builders<SuperBot.Infrastructure.Data.PromoCodeUsageDb>.Filter
                            .Type(item => item.OrderId, BsonType.String)
                    }));
            }
            catch (MongoCommandException ex)
            {
                // Старые дубли не дают построить уникальный индекс. Сайт от этого работать не
                // перестаёт, но повтор финализации сможет записать использование дважды.
                _logger.LogWarning(ex, "Не удалось создать ix_promo_usages_order_unique: в PromoCodeUsages есть дубли по заказу.");
            }

            // Журнал кэшбэка. Ключ идемпотентности уникален: повтор вебхука или confirm не может
            // начислить, забрать или списать второй раз. По покупателю читается весь его журнал.
            var cashbackEntries = _database.GetCollection<SuperBot.Infrastructure.Data.CashbackEntryDb>("CashbackEntries");
            await cashbackEntries.Indexes.CreateManyAsync(new[]
            {
                new CreateIndexModel<SuperBot.Infrastructure.Data.CashbackEntryDb>(
                    Builders<SuperBot.Infrastructure.Data.CashbackEntryDb>.IndexKeys.Ascending(item => item.IdempotencyKey),
                    new CreateIndexOptions { Name = "ux_cashback_entries_idempotency", Unique = true }),
                new CreateIndexModel<SuperBot.Infrastructure.Data.CashbackEntryDb>(
                    Builders<SuperBot.Infrastructure.Data.CashbackEntryDb>.IndexKeys
                        .Ascending(item => item.UserKey)
                        .Ascending(item => item.CreatedAt),
                    new CreateIndexOptions { Name = "ix_cashback_entries_user_created" }),
                new CreateIndexModel<SuperBot.Infrastructure.Data.CashbackEntryDb>(
                    Builders<SuperBot.Infrastructure.Data.CashbackEntryDb>.IndexKeys
                        .Ascending(item => item.Type)
                        .Ascending(item => item.Status)
                        .Ascending(item => item.UpdatedAt),
                    new CreateIndexOptions { Name = "ix_cashback_entries_type_status" })
            });

            var gameKeyCollection = _database.GetCollection<SuperBot.Infrastructure.Data.GameKeyDb>("GameKeys");
            var gameKeyUserIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.GameKeyDb>(
                Builders<SuperBot.Infrastructure.Data.GameKeyDb>.IndexKeys
                    .Ascending(item => item.UserId)
                    .Descending(item => item.IssuedAt),
                new CreateIndexOptions { Name = "ix_game_keys_user_issued" }
            );
            await gameKeyCollection.Indexes.CreateOneAsync(gameKeyUserIndex);

            // Остаток пула по игре: выдача и все складские сводки спрашивают именно «свободные
            // ключи этой игры». Без индекса каждый такой вопрос читает коллекцию целиком, а она
            // растёт вместе с каталогом, а не с числом игр.
            await gameKeyCollection.Indexes.CreateOneAsync(new CreateIndexModel<SuperBot.Infrastructure.Data.GameKeyDb>(
                Builders<SuperBot.Infrastructure.Data.GameKeyDb>.IndexKeys
                    .Ascending(item => item.GameId)
                    .Ascending(item => item.UserId)
                    .Ascending(item => item.Voided),
                new CreateIndexOptions { Name = "ix_game_keys_game_pool" }
            ));

            // Расход за окно: отчёт по складу читает выданные ключи за последние N дней.
            // Существующий (UserId, IssuedAt) для этого не годится — он начинается с покупателя,
            // а нужен диапазон по дате.
            await gameKeyCollection.Indexes.CreateOneAsync(new CreateIndexModel<SuperBot.Infrastructure.Data.GameKeyDb>(
                Builders<SuperBot.Infrastructure.Data.GameKeyDb>.IndexKeys.Descending(item => item.IssuedAt),
                new CreateIndexOptions { Name = "ix_game_keys_issued_at" }
            ));

            await EnsureGameKeyHashUniquenessAsync(gameKeyCollection);

            var ticketsCollection = _database.GetCollection<Support.Models.SupportTicket>("SupportTickets");
            var ticketUserUpdatedIndex = new CreateIndexModel<Support.Models.SupportTicket>(
                Builders<Support.Models.SupportTicket>.IndexKeys
                    .Ascending(ticket => ticket.UserId)
                    .Descending(ticket => ticket.UpdatedAt),
                new CreateIndexOptions { Name = "ix_support_tickets_user_updated" }
            );
            var ticketStatusUpdatedIndex = new CreateIndexModel<Support.Models.SupportTicket>(
                Builders<Support.Models.SupportTicket>.IndexKeys
                    .Ascending(ticket => ticket.Status)
                    .Descending(ticket => ticket.UpdatedAt),
                new CreateIndexOptions { Name = "ix_support_tickets_status_updated" }
            );
            var ticketPublicIdIndex = new CreateIndexModel<Support.Models.SupportTicket>(
                Builders<Support.Models.SupportTicket>.IndexKeys
                    .Ascending(ticket => ticket.PublicId),
                new CreateIndexOptions { Name = "ix_support_tickets_public_id", Unique = true }
            );
            await ticketsCollection.Indexes.CreateOneAsync(ticketUserUpdatedIndex);
            await ticketsCollection.Indexes.CreateOneAsync(ticketStatusUpdatedIndex);
            await ticketsCollection.Indexes.CreateOneAsync(ticketPublicIdIndex);

            var messagesCollection = _database.GetCollection<Support.Models.SupportMessage>("SupportMessages");
            var messageTicketIndex = new CreateIndexModel<Support.Models.SupportMessage>(
                Builders<Support.Models.SupportMessage>.IndexKeys
                    .Ascending(message => message.TicketId)
                    .Descending(message => message.CreatedAt),
                new CreateIndexOptions { Name = "ix_support_messages_ticket_created" }
            );
            await messagesCollection.Indexes.CreateOneAsync(messageTicketIndex);

            var attachmentsCollection = _database.GetCollection<Support.Models.SupportAttachment>("SupportAttachments");
            var attachmentTicketIndex = new CreateIndexModel<Support.Models.SupportAttachment>(
                Builders<Support.Models.SupportAttachment>.IndexKeys
                    .Ascending(attachment => attachment.TicketId)
                    .Descending(attachment => attachment.CreatedAt),
                new CreateIndexOptions { Name = "ix_support_attachments_ticket_created" }
            );
            await attachmentsCollection.Indexes.CreateOneAsync(attachmentTicketIndex);

            var chatSessionsCollection = _database.GetCollection<Support.Chat.Models.ChatSession>("SupportChatSessions");
            var chatSessionStatusIndex = new CreateIndexModel<Support.Chat.Models.ChatSession>(
                Builders<Support.Chat.Models.ChatSession>.IndexKeys
                    .Ascending(session => session.Status)
                    .Descending(session => session.LastMessageAt),
                new CreateIndexOptions { Name = "ix_support_chat_sessions_status_last" }
            );
            var chatSessionUserIndex = new CreateIndexModel<Support.Chat.Models.ChatSession>(
                Builders<Support.Chat.Models.ChatSession>.IndexKeys
                    .Ascending(session => session.UserId)
                    .Descending(session => session.UpdatedAt),
                new CreateIndexOptions { Name = "ix_support_chat_sessions_user_updated" }
            );
            await chatSessionsCollection.Indexes.CreateOneAsync(chatSessionStatusIndex);
            await chatSessionsCollection.Indexes.CreateOneAsync(chatSessionUserIndex);

            var chatMessagesCollection = _database.GetCollection<Support.Chat.Models.ChatMessage>("SupportChatMessages");
            var chatMessageSessionIndex = new CreateIndexModel<Support.Chat.Models.ChatMessage>(
                Builders<Support.Chat.Models.ChatMessage>.IndexKeys
                    .Ascending(message => message.SessionId)
                    .Ascending(message => message.CreatedAt),
                new CreateIndexOptions { Name = "ix_support_chat_messages_session_created" }
            );
            await chatMessagesCollection.Indexes.CreateOneAsync(chatMessageSessionIndex);

            // Сводка в админке считается по окну дат, а не по одной сессии — ей нужен свой индекс.
            var chatSessionCreatedIndex = new CreateIndexModel<Support.Chat.Models.ChatSession>(
                Builders<Support.Chat.Models.ChatSession>.IndexKeys.Descending(session => session.CreatedAt),
                new CreateIndexOptions { Name = "ix_support_chat_sessions_created" }
            );
            await chatSessionsCollection.Indexes.CreateOneAsync(chatSessionCreatedIndex);

            var chatMessageCreatedIndex = new CreateIndexModel<Support.Chat.Models.ChatMessage>(
                Builders<Support.Chat.Models.ChatMessage>.IndexKeys.Descending(message => message.CreatedAt),
                new CreateIndexOptions { Name = "ix_support_chat_messages_created" }
            );
            await chatMessagesCollection.Indexes.CreateOneAsync(chatMessageCreatedIndex);

            // Темы поддержки: slug — стабильный ключ, по нему не должно быть дублей.
            var knowledgeCollection = _database.GetCollection<Support.Chat.Models.SupportKnowledgeArticle>("SupportKnowledgeArticles");
            var knowledgeSlugIndex = new CreateIndexModel<Support.Chat.Models.SupportKnowledgeArticle>(
                Builders<Support.Chat.Models.SupportKnowledgeArticle>.IndexKeys.Ascending(article => article.Slug),
                new CreateIndexOptions { Name = "ix_support_knowledge_slug_unique", Unique = true }
            );
            await knowledgeCollection.Indexes.CreateOneAsync(knowledgeSlugIndex);

            var ordersCollection = _database.GetCollection<SuperBot.Infrastructure.Data.OrderDb>("Orders");
            var ordersPaymentIntentIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.OrderDb>(
                Builders<SuperBot.Infrastructure.Data.OrderDb>.IndexKeys.Ascending(item => item.PaymentIntentId),
                new CreateIndexOptions { Name = "ix_orders_payment_intent_unique", Unique = true, Sparse = true }
            );
            var ordersUserCreatedIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.OrderDb>(
                Builders<SuperBot.Infrastructure.Data.OrderDb>.IndexKeys
                    .Ascending(item => item.UserId)
                    .Descending(item => item.CreatedAt),
                new CreateIndexOptions { Name = "ix_orders_user_created" }
            );
            var ordersStatusIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.OrderDb>(
                Builders<SuperBot.Infrastructure.Data.OrderDb>.IndexKeys.Ascending(item => item.Status),
                new CreateIndexOptions { Name = "ix_orders_status" }
            );
            // Под витринный чарт продаж: выборка «оплаченные за последнюю неделю».
            // Без него выборка по дате продажи сканирует всю коллекцию заказов.
            var ordersPaidAtIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.OrderDb>(
                Builders<SuperBot.Infrastructure.Data.OrderDb>.IndexKeys
                    .Ascending(item => item.IsPaid)
                    .Descending(item => item.PaidAt),
                new CreateIndexOptions { Name = "ix_orders_paid_at" }
            );
            // Заказ ищут по трём идентификаторам (см. BuildOrderIdentityFilter): ObjectId покрыт
            // индексом _id, а OrderNumber и OrderId — обычные поля, и без индексов открытие заказа
            // по номеру (кабинет, письмо, админка) сканировало коллекцию целиком.
            var ordersNumberIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.OrderDb>(
                Builders<SuperBot.Infrastructure.Data.OrderDb>.IndexKeys.Ascending(item => item.OrderNumber),
                new CreateIndexOptions { Name = "ix_orders_number" }
            );
            // Почта покупателя: по ней ищут клиента в поддержке и по ней же идёт постраничный
            // обход списка. Без индекса и то и другое читало коллекцию заказов целиком.
            var ordersUserNameIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.OrderDb>(
                Builders<SuperBot.Infrastructure.Data.OrderDb>.IndexKeys.Ascending(order => order.UserName),
                new CreateIndexOptions { Name = "ix_orders_user_name" }
            );
            var ordersOrderIdIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.OrderDb>(
                Builders<SuperBot.Infrastructure.Data.OrderDb>.IndexKeys.Ascending(item => item.OrderId),
                new CreateIndexOptions { Name = "ix_orders_order_id" }
            );

            await ordersCollection.Indexes.CreateOneAsync(ordersPaymentIntentIndex);
            await ordersCollection.Indexes.CreateOneAsync(ordersUserCreatedIndex);
            await ordersCollection.Indexes.CreateOneAsync(ordersStatusIndex);
            await ordersCollection.Indexes.CreateOneAsync(ordersPaidAtIndex);
            await ordersCollection.Indexes.CreateOneAsync(ordersNumberIndex);
            await ordersCollection.Indexes.CreateOneAsync(ordersOrderIdIndex);
            await ordersCollection.Indexes.CreateOneAsync(ordersUserNameIndex);

            // Локи розыгрыша «карты удачи» живут ровно до конца кулдауна и удаляются сами.
            // ExpireAfter = 0 означает «удалить, когда наступит время в поле ExpiresAt»
            // (Mongo проверяет это фоново, раз в ~минуту — для суточного кулдауна достаточно).
            var tarotLocksCollection = _database.GetCollection<SuperBot.Infrastructure.Data.TarotDrawLockDb>("TarotDrawLocks");
            var tarotLockTtlIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.TarotDrawLockDb>(
                Builders<SuperBot.Infrastructure.Data.TarotDrawLockDb>.IndexKeys.Ascending(item => item.ExpiresAt),
                new CreateIndexOptions { Name = "ix_tarot_locks_ttl", ExpireAfter = TimeSpan.Zero }
            );
            await tarotLocksCollection.Indexes.CreateOneAsync(tarotLockTtlIndex);

            // Розыгрыши: выборка «последний по пользователю» для состояния карты и кулдауна.
            var tarotDrawsCollection = _database.GetCollection<SuperBot.Infrastructure.Data.TarotDrawDb>("TarotDraws");
            var tarotDrawUserIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.TarotDrawDb>(
                Builders<SuperBot.Infrastructure.Data.TarotDrawDb>.IndexKeys
                    .Ascending(item => item.UserId)
                    .Descending(item => item.DrawnAt),
                new CreateIndexOptions { Name = "ix_tarot_draws_user_drawn" }
            );
            await tarotDrawsCollection.Indexes.CreateOneAsync(tarotDrawUserIndex);

            await EnsureCatalogAndLookupIndexesAsync();
            await EnsureRetentionIndexesAsync();
            await BackfillGameCurrencyAsync();
            await SeedSoftwareCategoriesAsync();
            await MigrateGameGenresAsync();
            await DropLegacyOrderItemFieldsAsync();
            await DropReviewAvatarFieldAsync();
            await DropYandexCounterFieldAsync();
            await DropLegacyCashbackAccountIndexesAsync(_database.GetCollection<BsonDocument>("CashbackAccounts"), _logger);

            // Последний курс по валюте ищется постоянно (на старте процесса и при импорте),
            // а история читается редко — индекс покрывает оба случая.
            var fxRates = _database.GetCollection<SuperBot.Infrastructure.Data.FxRateDb>("FxRates");
            await fxRates.Indexes.CreateOneAsync(new CreateIndexModel<SuperBot.Infrastructure.Data.FxRateDb>(
                Builders<SuperBot.Infrastructure.Data.FxRateDb>.IndexKeys
                    .Ascending(rate => rate.From)
                    .Ascending(rate => rate.To)
                    .Descending(rate => rate.CapturedAtUtc),
                new CreateIndexOptions { Name = "ix_fx_rates_pair_captured" }));

            var paymentStateCollection = _database.GetCollection<SuperBot.Infrastructure.Data.PaymentFinalizationStateDb>("PaymentFinalizationStates");
            var paymentStateIntentIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.PaymentFinalizationStateDb>(
                Builders<SuperBot.Infrastructure.Data.PaymentFinalizationStateDb>.IndexKeys
                    .Ascending(item => item.PaymentIntentId),
                new CreateIndexOptions { Name = "ix_payment_state_intent", Unique = true }
            );
            var paymentStateUserIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.PaymentFinalizationStateDb>(
                Builders<SuperBot.Infrastructure.Data.PaymentFinalizationStateDb>.IndexKeys
                    .Ascending(item => item.UserId)
                    .Descending(item => item.UpdatedAt),
                new CreateIndexOptions { Name = "ix_payment_state_user_updated" }
            );

            // Сроки хранения состояний оплаты. Запись заводится на каждую попытку заплатить,
            // и без уборки коллекция растёт бесконечно — к этому моменту в ней набралось
            // двадцать три тысячи записей о платежах, которых не случилось.
            //
            // Сроки разные, потому что назначение записей разное:
            //
            //  • незавершённые (Created/Processing/Failed) — две недели. Платёжное намерение
            //    Stripe живёт около суток, после этого запись нужна только для разбора
            //    «почему у покупателя не прошло»;
            //  • успешные — три месяца. На них держится защита от повторного создания заказа
            //    по тому же намерению, и снимать её раньше, чем Stripe перестанет слать
            //    повторы вебхука, нельзя.
            //
            // Отсчёт от UpdatedAt: у зависших записей он равен времени создания, а у успешных —
            // моменту, когда заказ был создан.
            var paymentStateUnfinishedTtlIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.PaymentFinalizationStateDb>(
                Builders<SuperBot.Infrastructure.Data.PaymentFinalizationStateDb>.IndexKeys.Ascending(item => item.UpdatedAt),
                new CreateIndexOptions<SuperBot.Infrastructure.Data.PaymentFinalizationStateDb>
                {
                    Name = "ix_payment_state_ttl_unfinished",
                    ExpireAfter = TimeSpan.FromDays(14),
                    PartialFilterExpression = Builders<SuperBot.Infrastructure.Data.PaymentFinalizationStateDb>.Filter.In(
                        item => item.Status,
                        new[] { "Created", "Processing", "Failed" })
                }
            );
            var paymentStateSucceededTtlIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.PaymentFinalizationStateDb>(
                Builders<SuperBot.Infrastructure.Data.PaymentFinalizationStateDb>.IndexKeys.Ascending(item => item.UpdatedAt),
                new CreateIndexOptions<SuperBot.Infrastructure.Data.PaymentFinalizationStateDb>
                {
                    Name = "ix_payment_state_ttl_succeeded",
                    ExpireAfter = TimeSpan.FromDays(90),
                    PartialFilterExpression = Builders<SuperBot.Infrastructure.Data.PaymentFinalizationStateDb>.Filter.Eq(item => item.Status, "Succeeded")
                }
            );

            await paymentStateCollection.Indexes.CreateOneAsync(paymentStateIntentIndex);
            await paymentStateCollection.Indexes.CreateOneAsync(paymentStateUserIndex);
            await paymentStateCollection.Indexes.CreateOneAsync(paymentStateUnfinishedTtlIndex);
            await paymentStateCollection.Indexes.CreateOneAsync(paymentStateSucceededTtlIndex);

            // Журнал обработанных вебхуков Stripe: уникальность по EventId = защита от повторной
            // обработки; TTL чистит записи, хранить их вечно незачем.
            var stripeEventsCollection = _database.GetCollection<SuperBot.Infrastructure.Data.StripeWebhookEventDb>("StripeWebhookEvents");
            var stripeEventIdIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.StripeWebhookEventDb>(
                Builders<SuperBot.Infrastructure.Data.StripeWebhookEventDb>.IndexKeys.Ascending(item => item.EventId),
                new CreateIndexOptions { Name = "ix_stripe_events_event_id_unique", Unique = true }
            );
            var stripeEventTtlIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.StripeWebhookEventDb>(
                Builders<SuperBot.Infrastructure.Data.StripeWebhookEventDb>.IndexKeys.Ascending(item => item.ProcessedAt),
                new CreateIndexOptions { Name = "ix_stripe_events_ttl", ExpireAfter = TimeSpan.FromDays(30) }
            );
            await stripeEventsCollection.Indexes.CreateOneAsync(stripeEventIdIndex);
            await stripeEventsCollection.Indexes.CreateOneAsync(stripeEventTtlIndex);

            var paymentFailureCollection = _database.GetCollection<SuperBot.Infrastructure.Data.PaymentFinalizationFailureDb>("PaymentFinalizationFailures");
            var paymentFailureIntentIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.PaymentFinalizationFailureDb>(
                Builders<SuperBot.Infrastructure.Data.PaymentFinalizationFailureDb>.IndexKeys
                    .Ascending(item => item.PaymentIntentId),
                new CreateIndexOptions { Name = "ix_payment_failure_intent", Unique = true }
            );
            var paymentFailureStatusDateIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.PaymentFinalizationFailureDb>(
                Builders<SuperBot.Infrastructure.Data.PaymentFinalizationFailureDb>.IndexKeys
                    .Ascending(item => item.Status)
                    .Descending(item => item.LastSeenAt),
                new CreateIndexOptions { Name = "ix_payment_failure_status_last_seen" }
            );
            await paymentFailureCollection.Indexes.CreateOneAsync(paymentFailureIntentIndex);
            await paymentFailureCollection.Indexes.CreateOneAsync(paymentFailureStatusDateIndex);

            if (_environment.IsDevelopment())
            {
                await SeedSupportTicketsAsync(ticketsCollection, messagesCollection);
            }

            await SeedGameDetailsAsync(gameDetailsCollection);
        }

        /// <summary>
        /// TTL-индексы: сроки хранения для коллекций, которые иначе растут бесконечно.
        /// Mongo удаляет просроченные документы фоново (проверка примерно раз в минуту) —
        /// ни планировщика, ни кода чистки не требуется.
        ///
        /// ВАЖНО: TTL стирает данные безвозвратно, поэтому сроки выбраны с запасом,
        /// а коллекции, нужные для разбора инцидентов и отчётности, сюда не входят.
        /// </summary>
        /// <summary>
        /// Проставляет валюту играм, заведённым до мультивалютности. Каталог фактически вёлся
        /// в долларах (рубли в админке были багом форматтера), поэтому USD — не выбор, а фиксация
        /// того, что уже есть. Записи с валютой не трогаем: миграция идемпотентна и переживает
        /// перезапуски. Цены не пересчитываются — меняется только подпись к ним.
        /// </summary>
        /// <summary>
        /// Старые заказы хранят каждое поле позиции дважды: актуальное имя и его legacy-дубль
        /// (Title/TitleSnapshot, Quantity/Qty, UnitPrice/UnitPriceSnapshot …). Дубли давно не пишутся
        /// и не читаются, а до появления [BsonIgnoreExtraElements] на OrderDb валили десериализацию
        /// всей страницы заказов. Убираем их из документов, чтобы форма в базе совпадала с классом.
        ///
        /// Переносить нечего: в проверенной базе значения дублей совпадают с актуальными полями во всех
        /// документах. Если где-то актуальное поле окажется пустым, а дубль — нет, вмешиваться вручную
        /// безопаснее, чем угадывать: такие документы просто пересчитываются в лог.
        /// </summary>
        /// <summary>
        /// Убирает из отзывов поле avatarUrl. Оно было в документах с самого начала и всегда
        /// лежало пустым: записывать его было некому — создание отзыва его не выставляло.
        /// Аватар автора витрина берёт из профиля в момент показа (см. Services/UserAvatars),
        /// поэтому хранить его в отзыве не нужно и вредно: снимок заморозил бы и картинку,
        /// и метку версии.
        ///
        /// Идемпотентно: повторный запуск не находит документов с полем и ничего не делает.
        /// </summary>
        private async Task DropReviewAvatarFieldAsync()
        {
            var reviews = _database.GetCollection<BsonDocument>("GameReviews");
            var hasField = Builders<BsonDocument>.Filter.Exists("avatarUrl");

            // Непустое значение — неожиданность: его никто не писал. Такие документы не трогаем
            // и называем в логе, чтобы разобраться руками, а не потерять данные молча.
            var filled = await reviews
                .Find(Builders<BsonDocument>.Filter.And(
                    hasField,
                    Builders<BsonDocument>.Filter.Ne("avatarUrl", BsonNull.Value),
                    Builders<BsonDocument>.Filter.Ne("avatarUrl", "")))
                .Project(Builders<BsonDocument>.Projection.Include("_id").Include("avatarUrl"))
                .ToListAsync();

            if (filled.Count > 0)
            {
                _logger.LogWarning(
                    "Отзывов с непустым avatarUrl: {Count}. Поле у них оставлено, разберите вручную: {Ids}",
                    filled.Count,
                    string.Join(", ", filled.Select(doc => doc["_id"].ToString())));
            }

            var empty = Builders<BsonDocument>.Filter.And(
                hasField,
                Builders<BsonDocument>.Filter.Or(
                    Builders<BsonDocument>.Filter.Eq("avatarUrl", BsonNull.Value),
                    Builders<BsonDocument>.Filter.Eq("avatarUrl", "")));

            var result = await reviews.UpdateManyAsync(
                empty,
                Builders<BsonDocument>.Update.Unset("avatarUrl"));

            if (result.ModifiedCount > 0)
            {
                _logger.LogInformation("Убрано пустое поле avatarUrl у отзывов: {Count}.", result.ModifiedCount);
            }
        }

        /// <summary>
        /// Убирает YandexCounterId из настроек аналитики: поле ушло из класса вместе с Метрикой, а документ,
        /// сохранённый прежним кодом, его хранил (пусть и пустым). Класс теперь терпит лишние поля, так что
        /// чтение не падает и без этого шага; миграция нужна, чтобы форма документа совпадала с классом.
        /// Идемпотентно.
        /// </summary>
        private async Task DropYandexCounterFieldAsync()
        {
            var result = await _database.GetCollection<BsonDocument>("AnalyticsSettings").UpdateManyAsync(
                Builders<BsonDocument>.Filter.Exists("YandexCounterId"),
                Builders<BsonDocument>.Update.Unset("YandexCounterId"));
            if (result.ModifiedCount > 0)
            {
                _logger.LogInformation("Убрано поле YandexCounterId из настроек аналитики: {Count}.", result.ModifiedCount);
            }
        }

        /// <summary>
        /// Убирает индексы первой версии кэшбэка (уровни Bronze/Silver/Gold, коммит e52af69) с CashbackAccounts.
        /// Тогда счёт хранил поле UserId с уникальным индексом ix_cashback_accounts_user. Нынешний журнал держит
        /// покупателя в _id, а UserId не пишет вовсе — и уникальный индекс видит у каждого нового счёта UserId = null.
        /// Первый счёт создаётся, второй падает на дубликате: оплата кэшбэком у всех остальных покупателей
        /// отвечала 500, а снимки балансов для админки молча не записывались.
        ///
        /// Удаляется любой индекс по UserId: в нынешней схеме такого поля нет, и индекс по нему — только помеха.
        /// Идемпотентно.
        /// </summary>
        public static async Task DropLegacyCashbackAccountIndexesAsync(IMongoCollection<BsonDocument> accounts, Microsoft.Extensions.Logging.ILogger logger)
        {
            var indexes = await (await accounts.Indexes.ListAsync()).ToListAsync();
            foreach (var index in indexes)
            {
                var name = index.GetValue("name", BsonNull.Value);
                var key = index.GetValue("key", BsonNull.Value);
                if (!name.IsString || !key.IsBsonDocument || !key.AsBsonDocument.Contains("UserId"))
                {
                    continue;
                }

                await accounts.Indexes.DropOneAsync(name.AsString);
                logger.LogInformation("Удалён устаревший индекс кэшбэка {Index} на CashbackAccounts.", name.AsString);
            }
        }

        private async Task DropLegacyOrderItemFieldsAsync()
        {
            var orders = _database.GetCollection<BsonDocument>("Orders");

            string[] legacyFields =
            {
                "TitleSnapshot", "CoverUrlSnapshot", "PlatformSnapshot", "RegionSnapshot", "Qty",
                "UnitPriceSnapshot", "UnitPriceCurrency", "DiscountSnapshot", "FinalUnitPriceSnapshot",
                "LineTotalSnapshot", "DeliveryType"
            };

            var hasLegacy = Builders<BsonDocument>.Filter.Or(
                legacyFields.Select(field => Builders<BsonDocument>.Filter.Exists($"Items.{field}")));

            // Документы, где актуальное поле пустое, а legacy-дубль нет: их не трогаем и называем в логе.
            var actualEmptyButLegacyFilled = Builders<BsonDocument>.Filter.ElemMatch("Items",
                Builders<BsonDocument>.Filter.And(
                    Builders<BsonDocument>.Filter.In("Title", new BsonValue[] { BsonNull.Value, "" }),
                    Builders<BsonDocument>.Filter.Exists("TitleSnapshot"),
                    Builders<BsonDocument>.Filter.Nin("TitleSnapshot", new BsonValue[] { BsonNull.Value, "" })));

            var suspicious = await orders.Find(actualEmptyButLegacyFilled)
                .Project(Builders<BsonDocument>.Projection.Include("OrderNumber"))
                .ToListAsync();
            if (suspicious.Count > 0)
            {
                _logger.LogWarning(
                    "Заказы: у {Count} документов актуальное поле позиции пустое, а legacy-дубль заполнен — " +
                    "legacy-поля в них оставлены, разберитесь вручную: {Orders}",
                    suspicious.Count,
                    string.Join(", ", suspicious.Select(d => d.GetValue("OrderNumber", "?").ToString())));
            }

            // Позиции — массив: снимаем поле с каждого элемента через all-positional оператор $[].
            var unset = Builders<BsonDocument>.Update.Combine(
                legacyFields.Select(field => Builders<BsonDocument>.Update.Unset($"Items.$[].{field}")));

            var result = await orders.UpdateManyAsync(
                Builders<BsonDocument>.Filter.And(hasLegacy, Builders<BsonDocument>.Filter.Not(actualEmptyButLegacyFilled)),
                unset);

            if (result.ModifiedCount > 0)
            {
                _logger.LogInformation("Заказы: legacy-дубли полей позиций убраны у {Count} документов.", result.ModifiedCount);
            }
        }

        private async Task BackfillGameCurrencyAsync()
        {
            var games = _database.GetCollection<SuperBot.Infrastructure.Data.GameDb>("Games");

            var withoutCurrency = Builders<SuperBot.Infrastructure.Data.GameDb>.Filter.Or(
                Builders<SuperBot.Infrastructure.Data.GameDb>.Filter.Exists(game => game.Currency, false),
                Builders<SuperBot.Infrastructure.Data.GameDb>.Filter.In(game => game.Currency, new[] { null, string.Empty }));

            var result = await games.UpdateManyAsync(
                withoutCurrency,
                Builders<SuperBot.Infrastructure.Data.GameDb>.Update.Set(
                    game => game.Currency, SuperBot.Core.Payments.GamePricing.LegacyCurrency));

            if (result.ModifiedCount > 0)
            {
                _logger.LogInformation(
                    "Мультивалютность: валюта {Currency} проставлена {Count} играм без валюты.",
                    SuperBot.Core.Payments.GamePricing.LegacyCurrency,
                    result.ModifiedCount);
            }
        }

        /// <summary>
        /// Категории софта: у настроек, заведённых до появления ПО, их нет — засеваем значениями по умолчанию.
        /// Только пустые: уже переименованные в админке категории не трогаем.
        /// </summary>
        private async Task SeedSoftwareCategoriesAsync()
        {
            var settings = _database.GetCollection<SuperBot.Infrastructure.Data.SettingsDb>("Settings");
            var empty = Builders<SuperBot.Infrastructure.Data.SettingsDb>.Filter.Or(
                Builders<SuperBot.Infrastructure.Data.SettingsDb>.Filter.Exists(item => item.SoftwareCategories, false),
                Builders<SuperBot.Infrastructure.Data.SettingsDb>.Filter.Size(item => item.SoftwareCategories, 0));
            var defaults = SuperBot.Core.Entities.SoftwareCatalog.DefaultCategories
                .Select(category => new SuperBot.Infrastructure.Data.GameCategoryDb { Tag = category.Tag, Title = category.Title })
                .ToArray();

            var result = await settings.UpdateManyAsync(empty, Builders<SuperBot.Infrastructure.Data.SettingsDb>.Update.Set(item => item.SoftwareCategories, defaults));
            if (result.ModifiedCount > 0)
            {
                _logger.LogInformation("Software: засеяны категории по умолчанию ({Count}).", defaults.Length);
            }
        }

        /// <summary>
        /// Переезд жанров с перечисления на список в настройках.
        ///
        /// 1. Настройки: коды жанров были именами перечисления («RolePlayingGames»), а адрес страницы жанра строился из
        ///    названия. Код становится slug названия («role-playing-games-rpgs») — ровно тем адресом, что уже был в ссылках.
        /// 2. Игры без поля genre получают код жанра по своему номеру. Пока настройки были в старом виде, номер — это
        ///    позиция в их списке (так их читала витрина), поэтому берём код оттуда: переименованный когда-то жанр
        ///    сохранится у своих игр.
        ///
        /// Повторный запуск ничего не меняет: коды уже в новом виде, у игр поле есть.
        /// </summary>
        private async Task MigrateGameGenresAsync()
        {
            var settingsCollection = _database.GetCollection<SuperBot.Infrastructure.Data.SettingsDb>("Settings");
            var settings = await settingsCollection.Find(FilterDefinition<SuperBot.Infrastructure.Data.SettingsDb>.Empty).FirstOrDefaultAsync();
            var tagPattern = new System.Text.RegularExpressions.Regex("^[a-z0-9]+(-[a-z0-9]+)*$");

            var byLegacyIndex = new Dictionary<int, string>();
            if (settings is not null)
            {
                var stored = settings.GameCategories ?? Array.Empty<SuperBot.Infrastructure.Data.GameCategoryDb>();
                var legacy = stored.Length == 0 || stored.Any(genre => genre is null || string.IsNullOrWhiteSpace(genre.Tag) || !tagPattern.IsMatch(genre.Tag));
                if (legacy)
                {
                    var migrated = stored.Length == 0
                        ? SuperBot.Core.Entities.GameGenres.Defaults
                            .Select(genre => new SuperBot.Infrastructure.Data.GameCategoryDb { Tag = genre.Tag, Title = genre.Title })
                            .ToArray()
                        : stored.Select((genre, index) =>
                        {
                            var title = string.IsNullOrWhiteSpace(genre?.Title)
                                ? SuperBot.Core.Entities.GameTypeMapper.DescriptionsCategories.GetValueOrDefault((SuperBot.Core.Entities.GameType)index, genre?.Tag ?? $"genre-{index + 1}")
                                : genre!.Title;
                            var tag = genre?.Tag is { } current && tagPattern.IsMatch(current)
                                ? current
                                : SuperBot.Core.Entities.GameGenres.Slug(title);
                            return new SuperBot.Infrastructure.Data.GameCategoryDb { Tag = string.IsNullOrEmpty(tag) ? $"genre-{index + 1}" : tag, Title = title };
                        }).ToArray();

                    for (var index = 0; index < migrated.Length; index++)
                    {
                        byLegacyIndex[index] = migrated[index].Tag;
                    }
                    await settingsCollection.UpdateOneAsync(
                        item => item.Id == settings.Id,
                        Builders<SuperBot.Infrastructure.Data.SettingsDb>.Update.Set(item => item.GameCategories, migrated));
                    _logger.LogInformation("Жанры: список в настройках переведён на коды-адреса ({Count}).", migrated.Length);
                }
            }

            var games = _database.GetCollection<SuperBot.Infrastructure.Data.GameDb>("Games");
            var total = 0L;
            foreach (var type in Enum.GetValues<SuperBot.Core.Entities.GameType>())
            {
                var tag = byLegacyIndex.TryGetValue((int)type, out var fromSettings)
                    ? fromSettings
                    : SuperBot.Core.Entities.GameGenres.LegacyTag(type);
                var filter = Builders<SuperBot.Infrastructure.Data.GameDb>.Filter.And(
                    Builders<SuperBot.Infrastructure.Data.GameDb>.Filter.Eq(game => game.GameType, type),
                    Builders<SuperBot.Infrastructure.Data.GameDb>.Filter.Or(
                        Builders<SuperBot.Infrastructure.Data.GameDb>.Filter.Exists(game => game.Genre, false),
                        Builders<SuperBot.Infrastructure.Data.GameDb>.Filter.Eq(game => game.Genre, null)),
                    Builders<SuperBot.Infrastructure.Data.GameDb>.Filter.Ne(game => game.Kind, SuperBot.Core.Entities.ProductKind.Software));
                var result = await games.UpdateManyAsync(filter, Builders<SuperBot.Infrastructure.Data.GameDb>.Update.Set(game => game.Genre, tag));
                total += result.ModifiedCount;
            }
            if (total > 0)
            {
                _logger.LogInformation("Жанры: {Count} играм проставлен код жанра по старому номеру.", total);
            }
        }

        private async Task EnsureRetentionIndexesAsync()
        {
            // События просмотра игр — самая быстрорастущая коллекция (запись на каждый просмотр).
            // Трёх месяцев хватает и рекомендациям, и аналитике; более старое никем не читается.
            var tracking = _database.GetCollection<SuperBot.Infrastructure.Data.GameTrackingEventDb>("GameTrackingEvents");
            await CreateIndexSafelyAsync(tracking, new CreateIndexModel<SuperBot.Infrastructure.Data.GameTrackingEventDb>(
                Builders<SuperBot.Infrastructure.Data.GameTrackingEventDb>.IndexKeys.Ascending(item => item.Timestamp),
                new CreateIndexOptions { Name = "ix_game_tracking_ttl", ExpireAfter = TimeSpan.FromDays(90) }));

            // События блога — полгода: на них строятся «популярное за период» и статистика постов.
            var blogEvents = _database.GetCollection<SuperBot.Infrastructure.Data.BlogEventDb>("BlogEvents");
            await CreateIndexSafelyAsync(blogEvents, new CreateIndexModel<SuperBot.Infrastructure.Data.BlogEventDb>(
                Builders<SuperBot.Infrastructure.Data.BlogEventDb>.IndexKeys.Ascending(item => item.Timestamp),
                new CreateIndexOptions { Name = "ix_blog_events_ttl", ExpireAfter = TimeSpan.FromDays(180) }));

            // Отметки уникальных просмотров: нужны, чтобы не считать один и тот же просмотр дважды.
            // Через полгода отметка теряет смысл — вернувшийся читатель по сути новый визит.
            // Счётчики просмотров в самих постах хранятся отдельно и от чистки не страдают.
            var uniqueViews = _database.GetCollection<SuperBot.Infrastructure.Data.BlogPostUniqueViewDb>("BlogPostUniqueViews");
            await CreateIndexSafelyAsync(uniqueViews, new CreateIndexModel<SuperBot.Infrastructure.Data.BlogPostUniqueViewDb>(
                Builders<SuperBot.Infrastructure.Data.BlogPostUniqueViewDb>.IndexKeys.Ascending(item => item.LastViewedAt),
                new CreateIndexOptions { Name = "ix_blog_unique_views_ttl", ExpireAfter = TimeSpan.FromDays(180) }));

            // Одноразовые токены привязки Telegram: живут считанные минуты, но лежали вечно.
            // Сутки после истечения — запас на разбор «почему ссылка не сработала».
            // Через BsonDocument: тип токена объявлен внутри репозитория.
            var linkTokens = _database.GetCollection<MongoDB.Bson.BsonDocument>("TelegramLinkTokens");
            await CreateIndexSafelyAsync(linkTokens, new CreateIndexModel<MongoDB.Bson.BsonDocument>(
                Builders<MongoDB.Bson.BsonDocument>.IndexKeys.Ascending("ExpiresAt"),
                new CreateIndexOptions { Name = "ix_telegram_link_tokens_ttl", ExpireAfter = TimeSpan.FromDays(1) }));

            // RecoveryRequests TTL сознательно НЕ получают: это заявки на восстановление доступа,
            // то есть след действий с чужим аккаунтом. Их держим как аудит безопасности —
            // объём небольшой, а автоудаление стёрло бы историю подозрительных попыток.
        }

        /// <summary>
        /// Индексы под точечные выборки каталога, пользователей, медиа и одноразовых токенов.
        /// Эти коллекции запрашиваются по конкретным полям на горячих путях (открытие каталога,
        /// страницы игры, авторизованный запрос, приём вебхука), но исторически остались без индексов —
        /// каждый такой запрос сканировал коллекцию целиком.
        ///
        /// Все индексы НЕуникальные: цель — скорость выборки, а не защита инвариантов.
        /// Уникальные потребовали бы чистки существующих дублей и могли бы уронить старт.
        /// </summary>
        private async Task EnsureCatalogAndLookupIndexesAsync()
        {
            // Скидки: дёргаются на каждой загрузке каталога, карточки игры, чарта и баннера недели.
            var discounts = _database.GetCollection<SuperBot.Infrastructure.Data.GameDiscountDb>("GameDiscounts");
            await CreateIndexSafelyAsync(discounts, new CreateIndexModel<SuperBot.Infrastructure.Data.GameDiscountDb>(
                Builders<SuperBot.Infrastructure.Data.GameDiscountDb>.IndexKeys.Ascending(item => item.GameId),
                new CreateIndexOptions { Name = "ix_game_discounts_game" }));

            // Каталог: Slug — открытие карточки товара, ExternalId — импорт, CoverMediaId — медиатека.
            var games = _database.GetCollection<SuperBot.Infrastructure.Data.GameDb>("Games");
            await CreateIndexSafelyAsync(games, new CreateIndexModel<SuperBot.Infrastructure.Data.GameDb>(
                Builders<SuperBot.Infrastructure.Data.GameDb>.IndexKeys.Ascending(item => item.Slug),
                new CreateIndexOptions { Name = "ix_games_slug" }));
            // Название: по нему админские списки ищут и по нему же сортируют страницами.
            // Без индекса сортировка каталога заставляла Mongo держать в памяти весь набор.
            await CreateIndexSafelyAsync(games, new CreateIndexModel<SuperBot.Infrastructure.Data.GameDb>(
                Builders<SuperBot.Infrastructure.Data.GameDb>.IndexKeys.Ascending(item => item.Title),
                new CreateIndexOptions { Name = "ix_games_title" }));
            await CreateIndexSafelyAsync(games, new CreateIndexModel<SuperBot.Infrastructure.Data.GameDb>(
                Builders<SuperBot.Infrastructure.Data.GameDb>.IndexKeys.Ascending(item => item.ExternalId),
                new CreateIndexOptions { Name = "ix_games_external_id", Sparse = true }));
            await CreateIndexSafelyAsync(games, new CreateIndexModel<SuperBot.Infrastructure.Data.GameDb>(
                Builders<SuperBot.Infrastructure.Data.GameDb>.IndexKeys.Ascending(item => item.CoverMediaId),
                new CreateIndexOptions { Name = "ix_games_cover_media", Sparse = true }));

            // Пользователи: поиск идёт на каждом авторизованном запросе.
            var users = _database.GetCollection<SuperBot.Infrastructure.Data.UserDb>("Users");
            await CreateIndexSafelyAsync(users, new CreateIndexModel<SuperBot.Infrastructure.Data.UserDb>(
                Builders<SuperBot.Infrastructure.Data.UserDb>.IndexKeys.Ascending(item => item.UserId),
                new CreateIndexOptions { Name = "ix_users_user_id" }));
            await CreateIndexSafelyAsync(users, new CreateIndexModel<SuperBot.Infrastructure.Data.UserDb>(
                Builders<SuperBot.Infrastructure.Data.UserDb>.IndexKeys.Ascending(item => item.Username),
                new CreateIndexOptions { Name = "ix_users_username" }));

            // Медиа: дедупликация при загрузке ищет по хешу и размеру, библиотека фильтрует по типу.
            var media = _database.GetCollection<SuperBot.Infrastructure.Data.MediaAssetDb>("MediaAssets");
            await CreateIndexSafelyAsync(media, new CreateIndexModel<SuperBot.Infrastructure.Data.MediaAssetDb>(
                Builders<SuperBot.Infrastructure.Data.MediaAssetDb>.IndexKeys
                    .Ascending(item => item.HashSha256)
                    .Ascending(item => item.SizeBytes),
                new CreateIndexOptions { Name = "ix_media_hash_size" }));
            await CreateIndexSafelyAsync(media, new CreateIndexModel<SuperBot.Infrastructure.Data.MediaAssetDb>(
                Builders<SuperBot.Infrastructure.Data.MediaAssetDb>.IndexKeys.Ascending(item => item.Type),
                new CreateIndexOptions { Name = "ix_media_type" }));

            // TelegramLinkTokens индекса НЕ требуют: сам токен объявлен как [BsonId],
            // то есть поиск идёт по _id, у которого индекс есть всегда.

            // Заявки на восстановление: поиск по почте (активная заявка) и по токену отмены из письма.
            var recovery = _database.GetCollection<SuperBot.WebApi.Recovery.Models.RecoveryRequest>("RecoveryRequests");
            await CreateIndexSafelyAsync(recovery, new CreateIndexModel<SuperBot.WebApi.Recovery.Models.RecoveryRequest>(
                Builders<SuperBot.WebApi.Recovery.Models.RecoveryRequest>.IndexKeys.Ascending(item => item.AccountEmail),
                new CreateIndexOptions { Name = "ix_recovery_account_email" }));
            await CreateIndexSafelyAsync(recovery, new CreateIndexModel<SuperBot.WebApi.Recovery.Models.RecoveryRequest>(
                Builders<SuperBot.WebApi.Recovery.Models.RecoveryRequest>.IndexKeys.Ascending(item => item.CancelToken),
                new CreateIndexOptions { Name = "ix_recovery_cancel_token", Sparse = true }));

            // Крипто-инвойсы: по InvoiceId приходит вебхук платёжного шлюза.
            // Через BsonDocument — тип состояния объявлен внутри контроллера, тащить его сюда незачем.
            var cryptoInvoices = _database.GetCollection<MongoDB.Bson.BsonDocument>("CryptoInvoiceStates");
            await CreateIndexSafelyAsync(cryptoInvoices, new CreateIndexModel<MongoDB.Bson.BsonDocument>(
                Builders<MongoDB.Bson.BsonDocument>.IndexKeys.Ascending("InvoiceId"),
                new CreateIndexOptions { Name = "ix_crypto_invoices_invoice_id" }));
        }

        /// <summary>
        /// Создаёт индекс, не роняя старт приложения: проблема с одним индексом не должна
        /// оставлять сайт лежать — она логируется, остальные индексы создаются дальше.
        /// </summary>
        private static async Task CreateIndexSafelyAsync<TDocument>(
            IMongoCollection<TDocument> collection,
            CreateIndexModel<TDocument> index)
        {
            try
            {
                await collection.Indexes.CreateOneAsync(index);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine(
                    $"[MongoInit] Не удалось создать индекс {index.Options?.Name} в {collection.CollectionNamespace}: {ex.Message}");
            }
        }

        /// <summary>
        /// Уникальность ключа в рамках игры (по хешу) среди АКТИВНЫХ (Voided=false): защита от дублей/опечаток.
        /// Индекс ЧАСТИЧНЫЙ — изъятые (Voided=true) в него не входят, поэтому изъятое значение можно залить заново.
        /// Идемпотентно и безопасно к «грязным» данным:
        ///   1) если частичный индекс уже есть — выходим (дешёвый no-op);
        ///   2) добиваем KeyHash и Voided=false там, где их нет (старые записи);
        ///   3) схлопываем дубли только среди ПУЛОВЫХ (невыданных) — мусор, клиента не затрагивает;
        ///   4) сносим старый ПОЛНЫЙ уникальный индекс (из ранней версии), если он есть;
        ///   5) создаём частичный уникальный индекс. Неустранимые конфликты (один ключ выдан нескольким) —
        ///      логируем, старт не роняем.
        /// </summary>
        private async Task EnsureGameKeyHashUniquenessAsync(IMongoCollection<SuperBot.Infrastructure.Data.GameKeyDb> collection)
        {
            const string partialIndexName = "ix_game_keys_game_hash_active_unique";
            const string legacyIndexName = "ix_game_keys_game_hash_unique";

            var existingIndexes = await (await collection.Indexes.ListAsync()).ToListAsync();
            var indexNames = existingIndexes
                .Where(ix => ix.Contains("name"))
                .Select(ix => ix["name"].AsString)
                .ToHashSet();

            if (indexNames.Contains(partialIndexName))
            {
                return;
            }

            // (2) Бэкфилл KeyHash и Voided для старых записей.
            var missingHash = Builders<SuperBot.Infrastructure.Data.GameKeyDb>.Filter.Or(
                Builders<SuperBot.Infrastructure.Data.GameKeyDb>.Filter.Exists(k => k.KeyHash, false),
                Builders<SuperBot.Infrastructure.Data.GameKeyDb>.Filter.In(k => k.KeyHash, new[] { null, string.Empty }));
            var needHash = await collection.Find(missingHash).ToListAsync();
            foreach (var doc in needHash)
            {
                await collection.UpdateOneAsync(
                    k => k.Id == doc.Id,
                    Builders<SuperBot.Infrastructure.Data.GameKeyDb>.Update.Set(k => k.KeyHash, SuperBot.Core.Services.GameKeyHash.Compute(doc.Key)));
            }
            await collection.UpdateManyAsync(
                Builders<SuperBot.Infrastructure.Data.GameKeyDb>.Filter.Exists(k => k.Voided, false),
                Builders<SuperBot.Infrastructure.Data.GameKeyDb>.Update.Set(k => k.Voided, false));

            // (3) Схлопываем дубли (GameId, KeyHash) среди АКТИВНЫХ пуловых записей; выданные/изъятые не трогаем.
            var all = await collection.Find(Builders<SuperBot.Infrastructure.Data.GameKeyDb>.Filter.Empty).ToListAsync();
            var toDelete = new List<string>();
            foreach (var group in all.Where(d => !d.Voided).GroupBy(d => new { d.GameId, d.KeyHash }))
            {
                if (group.Count() <= 1)
                {
                    continue;
                }

                var assigned = group.Where(d => !string.IsNullOrEmpty(d.UserId)).ToList();
                var pool = group.Where(d => string.IsNullOrEmpty(d.UserId)).ToList();

                if (assigned.Count >= 1)
                {
                    toDelete.AddRange(pool.Select(d => d.Id));
                }
                else
                {
                    toDelete.AddRange(pool.Skip(1).Select(d => d.Id));
                }
            }
            if (toDelete.Count > 0)
            {
                await collection.DeleteManyAsync(Builders<SuperBot.Infrastructure.Data.GameKeyDb>.Filter.In(k => k.Id, toDelete));
            }

            // (4) Сносим старый полный уникальный индекс — он бы блокировал повторную заливку изъятого значения.
            if (indexNames.Contains(legacyIndexName))
            {
                try { await collection.Indexes.DropOneAsync(legacyIndexName); } catch (MongoCommandException) { }
            }

            // (5) Частичный уникальный индекс — только по активным (Voided=false).
            try
            {
                await collection.Indexes.CreateOneAsync(new CreateIndexModel<SuperBot.Infrastructure.Data.GameKeyDb>(
                    Builders<SuperBot.Infrastructure.Data.GameKeyDb>.IndexKeys
                        .Ascending(k => k.GameId)
                        .Ascending(k => k.KeyHash),
                    new CreateIndexOptions<SuperBot.Infrastructure.Data.GameKeyDb>
                    {
                        Name = partialIndexName,
                        Unique = true,
                        PartialFilterExpression = Builders<SuperBot.Infrastructure.Data.GameKeyDb>.Filter.Eq(k => k.Voided, false)
                    }));
            }
            catch (MongoCommandException ex)
            {
                Console.Error.WriteLine(
                    $"[GameKeys] Не удалось создать уникальный индекс {partialIndexName}: возможно, один ключ выдан нескольким. " +
                    $"Требуется ручная разборка дублей. {ex.Message}");
            }
        }

        private async Task SeedGameDetailsAsync(IMongoCollection<SuperBot.Infrastructure.Data.GameDetailsDb> gameDetailsCollection)
        {
            var gamesCollection = _database.GetCollection<SuperBot.Infrastructure.Data.GameDb>("Games");
            var games = await gamesCollection.Find(game => true).ToListAsync();
            if (games.Count == 0)
            {
                return;
            }

            foreach (var game in games)
            {
                if (string.IsNullOrWhiteSpace(game.Id))
                {
                    continue;
                }

                var existing = await gameDetailsCollection.Find(item => item.GameId == game.Id).FirstOrDefaultAsync();
                if (existing != null)
                {
                    if (string.IsNullOrWhiteSpace(existing.Slug) && !string.IsNullOrWhiteSpace(game.Slug))
                    {
                        var update = Builders<SuperBot.Infrastructure.Data.GameDetailsDb>.Update.Set(item => item.Slug, game.Slug);
                        await gameDetailsCollection.UpdateOneAsync(item => item.GameId == game.Id, update);
                    }
                    continue;
                }

                var details = new SuperBot.Infrastructure.Data.GameDetailsDb
                {
                    GameId = game.Id,
                    Slug = string.IsNullOrWhiteSpace(game.Slug) ? game.Name?.ToLowerInvariant().Replace(' ', '-') : game.Slug,
                    Title = string.IsNullOrWhiteSpace(game.Title) ? game.Name : game.Title,
                    Tagline = string.Empty,
                    DescriptionMarkdown = string.Empty,
                    Cover = string.IsNullOrWhiteSpace(game.ImagePath) ? null : new SuperBot.Infrastructure.Data.GameCoverDb { Url = game.ImagePath, Alt = game.Title ?? game.Name },
                    BasePrice = game.Price,
                    Currency = "USD",
                    FinalPrice = game.Price,
                    IsActive = true,
                    IsNew = false,
                    IsTopRated = false,
                    ControllerSupport = "Full",
                    Platforms = new SuperBot.Infrastructure.Data.GamePlatformsDb { Windows = true, Mac = false, Linux = false },
                    ReleaseDate = game.ReleaseDate
                };

                await gameDetailsCollection.InsertOneAsync(details);
            }
        }

        private async Task SeedSupportTicketsAsync(
            IMongoCollection<Support.Models.SupportTicket> tickets,
            IMongoCollection<Support.Models.SupportMessage> messages)
        {
            var count = await tickets.CountDocumentsAsync(Builders<Support.Models.SupportTicket>.Filter.Empty);
            if (count > 0)
            {
                return;
            }

            var now = DateTime.UtcNow;
            var ticketOne = new Support.Models.SupportTicket
            {
                PublicId = "TKT-10001",
                UserId = "dev-user-1",
                UserEmail = "alex@example.com",
                Subject = "Payment failed on checkout",
                Category = "Payment & checkout",
                Status = Support.Models.SupportTicketStatus.WaitingForSupport,
                CreatedAt = now.AddDays(-2),
                UpdatedAt = now.AddHours(-5),
                LastMessageAt = now.AddHours(-5),
                LastMessageBy = Support.Models.SupportAuthorType.User,
                MessagesCount = 2
            };

            var ticketTwo = new Support.Models.SupportTicket
            {
                PublicId = "TKT-10002",
                UserId = "dev-user-1",
                UserEmail = "alex@example.com",
                Subject = "Key delivery is delayed",
                Category = "Key delivery / activation",
                Status = Support.Models.SupportTicketStatus.WaitingForUser,
                CreatedAt = now.AddDays(-1),
                UpdatedAt = now.AddHours(-2),
                LastMessageAt = now.AddHours(-2),
                LastMessageBy = Support.Models.SupportAuthorType.Support,
                MessagesCount = 2
            };

            await tickets.InsertManyAsync(new[] { ticketOne, ticketTwo });

            var seedMessages = new List<Support.Models.SupportMessage>
            {
                new()
                {
                    TicketId = ticketOne.Id,
                    AuthorType = Support.Models.SupportAuthorType.User,
                    AuthorId = ticketOne.UserId,
                    AuthorName = "Alex",
                    Body = "I was charged but the order failed. Please help.",
                    CreatedAt = now.AddDays(-2)
                },
                new()
                {
                    TicketId = ticketOne.Id,
                    AuthorType = Support.Models.SupportAuthorType.Support,
                    AuthorId = "support-agent",
                    AuthorName = "Tale Shop Support",
                    Body = "Thanks for the report! Could you share the payment reference?",
                    CreatedAt = now.AddHours(-5)
                },
                new()
                {
                    TicketId = ticketTwo.Id,
                    AuthorType = Support.Models.SupportAuthorType.User,
                    AuthorId = ticketTwo.UserId,
                    AuthorName = "Alex",
                    Body = "Still waiting for my key after 45 minutes.",
                    CreatedAt = now.AddDays(-1)
                },
                new()
                {
                    TicketId = ticketTwo.Id,
                    AuthorType = Support.Models.SupportAuthorType.Support,
                    AuthorId = "support-agent",
                    AuthorName = "Tale Shop Support",
                    Body = "We are checking with the vendor. We'll update you shortly.",
                    CreatedAt = now.AddHours(-2)
                }
            };

            await messages.InsertManyAsync(seedMessages);
        }
    }
}
