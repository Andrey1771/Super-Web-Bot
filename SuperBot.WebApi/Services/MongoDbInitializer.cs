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
                "Orders",
                "WishlistItems",
                "ViewedGames",
                "GameKeys",
                "BlogPosts",
                "BlogPostVersions",
                "BlogEvents",
                "UserBlogProfiles",
                "SupportTickets",
                "SupportMessages",
                "SupportAttachments",
                "SupportTicketCounters"
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

            if (_environment.IsDevelopment())
            {
                await SeedSupportTicketsAsync(ticketsCollection, messagesCollection);
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
