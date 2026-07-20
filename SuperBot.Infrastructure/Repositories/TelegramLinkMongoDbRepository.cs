using System.Security.Cryptography;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.Infrastructure.Repositories
{
    public class TelegramLinkMongoDbRepository : ITelegramLinkRepository
    {
        private readonly IMongoCollection<TelegramLinkDb> _links;
        private readonly IMongoCollection<TelegramLinkTokenDb> _tokens;

        public TelegramLinkMongoDbRepository(IMongoDatabase database)
        {
            _links = database.GetCollection<TelegramLinkDb>("TelegramLinks");
            _tokens = database.GetCollection<TelegramLinkTokenDb>("TelegramLinkTokens");
        }

        public async Task<TelegramLinkToken> CreateTokenAsync(string siteUserId, string? email, string? displayName, TimeSpan ttl)
        {
            var token = GenerateToken();
            var document = new TelegramLinkTokenDb
            {
                Token = token,
                SiteUserId = siteUserId,
                Email = email,
                DisplayName = displayName,
                ExpiresAt = DateTime.UtcNow.Add(ttl),
                ConsumedAt = null
            };

            await _tokens.InsertOneAsync(document);
            return ToEntity(document);
        }

        public async Task<TelegramLink?> ConsumeTokenAndLinkAsync(string token, long telegramUserId, long chatId, string? username)
        {
            if (string.IsNullOrWhiteSpace(token))
            {
                return null;
            }

            // Атомарно помечаем токен использованным: только если он ещё жив и не потрачен.
            var now = DateTime.UtcNow;
            var filter = Builders<TelegramLinkTokenDb>.Filter.Eq(item => item.Token, token) &
                         Builders<TelegramLinkTokenDb>.Filter.Eq(item => item.ConsumedAt, null) &
                         Builders<TelegramLinkTokenDb>.Filter.Gt(item => item.ExpiresAt, now);
            var update = Builders<TelegramLinkTokenDb>.Update.Set(item => item.ConsumedAt, now);

            var consumed = await _tokens.FindOneAndUpdateAsync(
                filter, update,
                new FindOneAndUpdateOptions<TelegramLinkTokenDb> { ReturnDocument = ReturnDocument.After });

            if (consumed == null)
            {
                return null;
            }

            // Одна привязка на сайтовый аккаунт: upsert по SiteUserId.
            var link = new TelegramLinkDb
            {
                SiteUserId = consumed.SiteUserId,
                Email = consumed.Email,
                TelegramUserId = telegramUserId,
                ChatId = chatId,
                Username = username,
                LinkedAt = now
            };

            await _links.ReplaceOneAsync(
                item => item.SiteUserId == consumed.SiteUserId,
                link,
                new ReplaceOptions { IsUpsert = true });

            return ToEntity(link);
        }

        public async Task<TelegramLink?> GetForUserAsync(IEnumerable<string> aliases)
        {
            var normalized = Normalize(aliases);
            if (normalized.Count == 0)
            {
                return null;
            }

            var filter = Builders<TelegramLinkDb>.Filter.In(item => item.SiteUserId, normalized) |
                         Builders<TelegramLinkDb>.Filter.In(item => item.Email, normalized);

            var document = await _links.Find(filter).FirstOrDefaultAsync();
            return document == null ? null : ToEntity(document);
        }

        public async Task<bool> RemoveForUserAsync(IEnumerable<string> aliases)
        {
            var normalized = Normalize(aliases);
            if (normalized.Count == 0)
            {
                return false;
            }

            var filter = Builders<TelegramLinkDb>.Filter.In(item => item.SiteUserId, normalized) |
                         Builders<TelegramLinkDb>.Filter.In(item => item.Email, normalized);

            var result = await _links.DeleteManyAsync(filter);
            return result.DeletedCount > 0;
        }

        public async Task<List<TelegramLink>> GetAllAsync()
        {
            var documents = await _links.Find(Builders<TelegramLinkDb>.Filter.Empty).ToListAsync();
            return documents.Select(ToEntity).ToList();
        }

        private static List<string> Normalize(IEnumerable<string> aliases) =>
            (aliases ?? Enumerable.Empty<string>())
                .Where(alias => !string.IsNullOrWhiteSpace(alias))
                .Select(alias => alias.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

        private static string GenerateToken()
        {
            // URL-safe 32-байтовый токен (для deep-link ?start=).
            Span<byte> bytes = stackalloc byte[24];
            RandomNumberGenerator.Fill(bytes);
            return Convert.ToBase64String(bytes).Replace("+", "-").Replace("/", "_").TrimEnd('=');
        }

        private static TelegramLink ToEntity(TelegramLinkDb document) => new()
        {
            SiteUserId = document.SiteUserId,
            Email = document.Email,
            TelegramUserId = document.TelegramUserId,
            ChatId = document.ChatId,
            Username = document.Username,
            LinkedAt = document.LinkedAt
        };

        private static TelegramLinkToken ToEntity(TelegramLinkTokenDb document) => new()
        {
            Token = document.Token,
            SiteUserId = document.SiteUserId,
            Email = document.Email,
            DisplayName = document.DisplayName,
            ExpiresAt = document.ExpiresAt,
            ConsumedAt = document.ConsumedAt
        };

        public class TelegramLinkDb
        {
            [BsonId]
            public string SiteUserId { get; set; } = string.Empty;
            public string? Email { get; set; }
            public long TelegramUserId { get; set; }
            public long ChatId { get; set; }
            public string? Username { get; set; }
            public DateTime LinkedAt { get; set; }
        }

        public class TelegramLinkTokenDb
        {
            [BsonId]
            public string Token { get; set; } = string.Empty;
            public string SiteUserId { get; set; } = string.Empty;
            public string? Email { get; set; }
            public string? DisplayName { get; set; }
            public DateTime ExpiresAt { get; set; }
            public DateTime? ConsumedAt { get; set; }
        }
    }
}
