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
            // Список коллекций, которые нужно проверить/создать
            var collectionsToEnsure = new[]
            {
                "Users",
                "Games",
                "GameDetails",
                "GameReviews",
                "GameReviewHelpfulVotes",
                "GameQuestions",
                "GameTrackingEvents",
                "Orders",
                "WishlistItems",
                "ViewedGames",
                "GameKeys",
                "BlogPosts",
                "BlogPostVersions",
                "BlogEvents",
                "BlogPostUniqueViews",
                "BlogViewSettings",
                "UserBlogProfiles",
                "SupportTickets",
                "SupportMessages",
                "SupportAttachments",
                "SupportTicketCounters",
                "SupportChatSessions",
                "SupportChatMessages",
                "PromoCodes",
                "PromoCodeUsages",
                "PaymentFinalizationStates",
                "PaymentFinalizationFailures"
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

            await blogUniqueViewsCollection.Indexes.CreateOneAsync(uniqueViewerIndex);
            await blogUniqueViewsCollection.Indexes.CreateOneAsync(uniqueViewsPostIndex);
            await blogUniqueViewsCollection.Indexes.CreateOneAsync(uniqueViewsGuestIndex);
            await blogUniqueViewsCollection.Indexes.CreateOneAsync(uniqueViewsExcludedIndex);

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
            await ordersCollection.Indexes.CreateOneAsync(ordersPaymentIntentIndex);
            await ordersCollection.Indexes.CreateOneAsync(ordersUserCreatedIndex);
            await ordersCollection.Indexes.CreateOneAsync(ordersStatusIndex);

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
