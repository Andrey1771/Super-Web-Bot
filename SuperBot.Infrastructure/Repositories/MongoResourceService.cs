using Microsoft.Extensions.Configuration;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace SuperBot.Infrastructure.Repositories
{
    /// <summary>
    /// Тексты и клавиши бота в Mongo: правки из админки переживают пересборку контейнера.
    /// При загрузке хранимый документ мержится с файлом-сидом (Properties/resources.json):
    /// файл задаёт актуальный набор ключей, хранимые непустые значения имеют приоритет (правки админа).
    /// Так новые тексты, добавленные в код, появляются автоматически, а старый документ самолечится.
    /// </summary>
    public class MongoResourceService : IResourceService
    {
        private const string DocumentId = "current";

        private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

        private readonly IMongoCollection<BotResourcesDocument> _collection;
        private readonly string _seedFilePath = Path.Combine(AppContext.BaseDirectory, "Properties", "resources.json");
        private readonly object _initLock = new();

        private Resources? _cache;

        public MongoResourceService(IMongoClient mongoClient, IConfiguration configuration)
        {
            var databaseName = configuration.GetSection("ConnectionStrings:Name").Value;
            _collection = mongoClient.GetDatabase(databaseName).GetCollection<BotResourcesDocument>("BotResources");
        }

        public Resources Resources
        {
            get
            {
                if (_cache != null)
                {
                    return _cache;
                }

                lock (_initLock)
                {
                    if (_cache != null)
                    {
                        return _cache;
                    }

                    var fileJson = File.ReadAllText(_seedFilePath);
                    var document = _collection.Find(item => item.Id == DocumentId).FirstOrDefault();

                    if (document?.Resources == null)
                    {
                        var seeded = Deserialize(fileJson);
                        Persist(seeded);
                        _cache = seeded;
                        return _cache;
                    }

                    // Файл — источник актуальной схемы; хранимые непустые значения перекрывают дефолты.
                    var fileNode = JsonNode.Parse(fileJson)!.AsObject();
                    var storedNode = JsonNode.Parse(JsonSerializer.Serialize(document.Resources, JsonOptions))!.AsObject();

                    var changed = false;
                    var mergedNode = MergeFillingMissing(fileNode, storedNode, ref changed);
                    var merged = Deserialize(mergedNode.ToJsonString());

                    // Документу не хватало ключей (или были лишние) — сохраняем вылеченную версию.
                    if (changed)
                    {
                        Persist(merged);
                    }

                    _cache = merged;
                    return _cache;
                }
            }
        }

        public async Task UpdateResourcesAsync(Resources newResources)
        {
            ArgumentNullException.ThrowIfNull(newResources);

            await _collection.ReplaceOneAsync(
                item => item.Id == DocumentId,
                new BotResourcesDocument { Id = DocumentId, Resources = newResources, UpdatedAt = DateTime.UtcNow },
                new ReplaceOptions { IsUpsert = true });

            lock (_initLock)
            {
                _cache = newResources;
            }
        }

        private void Persist(Resources resources) =>
            _collection.ReplaceOne(
                item => item.Id == DocumentId,
                new BotResourcesDocument { Id = DocumentId, Resources = resources, UpdatedAt = DateTime.UtcNow },
                new ReplaceOptions { IsUpsert = true });

        private static Resources Deserialize(string json) =>
            JsonSerializer.Deserialize<Resources>(json, JsonOptions)
            ?? throw new InvalidOperationException("Bot resources JSON is empty or invalid.");

        /// <summary>
        /// Рекурсивный merge: ключи берём из файла (актуальная схема), значения — из stored, если
        /// там непустая строка, иначе дефолт из файла. Лишние ключи stored отбрасываются.
        /// </summary>
        private static JsonObject MergeFillingMissing(JsonObject file, JsonObject stored, ref bool changed)
        {
            var result = new JsonObject();

            foreach (var (key, fileValue) in file)
            {
                var storedValue = stored.TryGetPropertyValue(key, out var value) ? value : null;

                if (fileValue is JsonObject fileObject)
                {
                    var storedObject = storedValue as JsonObject ?? new JsonObject();
                    if (storedValue is not JsonObject)
                    {
                        changed = true;
                    }
                    result[key] = MergeFillingMissing(fileObject, storedObject, ref changed);
                }
                else if (storedValue is JsonValue storedLeaf && storedLeaf.TryGetValue<string>(out var storedString) && !string.IsNullOrEmpty(storedString))
                {
                    result[key] = storedString;
                }
                else
                {
                    result[key] = fileValue?.DeepClone();
                    changed = true;
                }
            }

            foreach (var (key, _) in stored)
            {
                if (!file.ContainsKey(key))
                {
                    changed = true; // stored содержит устаревший ключ — он не попадёт в result
                }
            }

            return result;
        }
    }

    public class BotResourcesDocument
    {
        [BsonId]
        public string Id { get; set; } = "current";
        public Resources Resources { get; set; } = default!;
        public DateTime UpdatedAt { get; set; }
    }
}
