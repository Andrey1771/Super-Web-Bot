using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.Infrastructure.Repositories
{
    public class CoverImageMetaMongoDbRepository : ICoverImageMetaRepository
    {
        private readonly IMongoCollection<CoverImageMetaDb> _collection;

        public CoverImageMetaMongoDbRepository(IMongoDatabase database)
        {
            _collection = database.GetCollection<CoverImageMetaDb>("CoverImageMeta");
        }

        public async Task<CoverImageMeta?> GetAsync(string path, CancellationToken ct = default)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                return null;
            }
            var db = await _collection.Find(item => item.Path == path).FirstOrDefaultAsync(ct);
            return db == null ? null : Map(db);
        }

        public async Task UpsertAsync(CoverImageMeta meta, CancellationToken ct = default)
        {
            if (meta == null || string.IsNullOrWhiteSpace(meta.Path))
            {
                return;
            }
            await _collection.ReplaceOneAsync(item => item.Path == meta.Path, Map(meta), new ReplaceOptions { IsUpsert = true }, ct);
        }

        public async Task<IReadOnlyDictionary<string, string>> GetColorsAsync(IEnumerable<string> paths, CancellationToken ct = default)
        {
            var list = paths.Where(path => !string.IsNullOrWhiteSpace(path)).Distinct().ToList();
            if (list.Count == 0)
            {
                return new Dictionary<string, string>();
            }
            var found = await _collection
                .Find(Builders<CoverImageMetaDb>.Filter.In(item => item.Path, list) & Builders<CoverImageMetaDb>.Filter.Ne(item => item.DominantColor, null))
                .Project(item => new { item.Path, item.DominantColor })
                .ToListAsync(ct);
            return found.ToDictionary(item => item.Path, item => item.DominantColor!, StringComparer.OrdinalIgnoreCase);
        }

        private static CoverImageMeta Map(CoverImageMetaDb db) => new()
        {
            Path = db.Path,
            FocusX = db.FocusX,
            FocusY = db.FocusY,
            Width = db.Width,
            Height = db.Height,
            DominantColor = db.DominantColor,
            UpdatedAt = db.UpdatedAt
        };

        private static CoverImageMetaDb Map(CoverImageMeta meta) => new()
        {
            Path = meta.Path,
            FocusX = meta.FocusX,
            FocusY = meta.FocusY,
            Width = meta.Width,
            Height = meta.Height,
            DominantColor = meta.DominantColor,
            UpdatedAt = meta.UpdatedAt
        };

        public class CoverImageMetaDb
        {
            [BsonId]
            public string Path { get; set; } = string.Empty;
            public double FocusX { get; set; }
            public double FocusY { get; set; }
            public int? Width { get; set; }
            public int? Height { get; set; }
            public string? DominantColor { get; set; }
            public DateTime UpdatedAt { get; set; }
        }
    }
}
