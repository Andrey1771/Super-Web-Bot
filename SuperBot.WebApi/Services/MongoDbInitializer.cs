using MongoDB.Driver;

namespace SuperBot.WebApi.Services
{
    public class MongoDbInitializer
    {
        private readonly IMongoDatabase _database;
        private readonly IWebHostEnvironment _environment;

        public MongoDbInitializer(IMongoDatabase database, IWebHostEnvironment environment)
        {
            _database = database;
            _environment = environment;
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
                "GameKeys",
                "GameReviews",
                "GameReviewHelpfulVotes",
                "GameQuestions",
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

                // Поддержка: тикеты и живой чат
                "SupportTickets",
                "SupportMessages",
                "SupportAttachments",
                "SupportTicketCounters",
                "SupportChatSessions",
                "SupportChatMessages",

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

            var questionsCollection = _database.GetCollection<SuperBot.Infrastructure.Data.GameQuestionDb>("GameQuestions");
            var questionsIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.GameQuestionDb>(
                Builders<SuperBot.Infrastructure.Data.GameQuestionDb>.IndexKeys
                    .Ascending(item => item.GameId)
                    .Descending(item => item.CreatedAt),
                new CreateIndexOptions { Name = "ix_game_questions_game_created" }
            );
            await questionsCollection.Indexes.CreateOneAsync(questionsIndex);

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
            var blogProfileUserIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.UserBlogProfileDb>(
                Builders<SuperBot.Infrastructure.Data.UserBlogProfileDb>.IndexKeys.Ascending(item => item.UserId),
                new CreateIndexOptions { Name = "ix_blog_profiles_user", Unique = true, Sparse = true }
            );
            var blogProfileAnonIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.UserBlogProfileDb>(
                Builders<SuperBot.Infrastructure.Data.UserBlogProfileDb>.IndexKeys.Ascending(item => item.AnonId),
                new CreateIndexOptions { Name = "ix_blog_profiles_anon", Unique = true, Sparse = true }
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

            var gameKeyCollection = _database.GetCollection<SuperBot.Infrastructure.Data.GameKeyDb>("GameKeys");
            var gameKeyUserIndex = new CreateIndexModel<SuperBot.Infrastructure.Data.GameKeyDb>(
                Builders<SuperBot.Infrastructure.Data.GameKeyDb>.IndexKeys
                    .Ascending(item => item.UserId)
                    .Descending(item => item.IssuedAt),
                new CreateIndexOptions { Name = "ix_game_keys_user_issued" }
            );
            await gameKeyCollection.Indexes.CreateOneAsync(gameKeyUserIndex);
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
            await paymentStateCollection.Indexes.CreateOneAsync(paymentStateIntentIndex);
            await paymentStateCollection.Indexes.CreateOneAsync(paymentStateUserIndex);

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
