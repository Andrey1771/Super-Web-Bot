using AutoMapper;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class MediaAssetMongoDbRepository : IMediaAssetRepository
    {
        private readonly IMongoCollection<MediaAssetDb> _mediaAssets;
        private readonly IMapper _mapper;

        public MediaAssetMongoDbRepository(IMongoDatabase database, IMapper mapper)
        {
            _mapper = mapper;
            _mediaAssets = database.GetCollection<MediaAssetDb>("MediaAssets");
        }

        public async Task<MediaAsset> GetByIdAsync(string id)
        {
            var asset = await _mediaAssets.Find(item => item.Id == id).FirstOrDefaultAsync();
            return _mapper.Map<MediaAsset>(asset);
        }

        public async Task<(IReadOnlyList<MediaAsset> Items, long Total)> ListAsync(string search, int page, int pageSize)
        {
            var filter = Builders<MediaAssetDb>.Filter.Empty;
            if (!string.IsNullOrWhiteSpace(search))
            {
                filter = Builders<MediaAssetDb>.Filter.Regex(
                    item => item.Filename,
                    new MongoDB.Bson.BsonRegularExpression(search, "i"));
            }

            var total = await _mediaAssets.CountDocumentsAsync(filter);
            var items = await _mediaAssets
                .Find(filter)
                .SortByDescending(item => item.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Limit(pageSize)
                .ToListAsync();

            return (_mapper.Map<IReadOnlyList<MediaAsset>>(items), total);
        }

        public async Task CreateAsync(MediaAsset asset)
        {
            var assetDb = _mapper.Map<MediaAssetDb>(asset);
            await _mediaAssets.InsertOneAsync(assetDb);
            asset.Id = assetDb.Id;
        }

        public async Task DeleteAsync(string id)
        {
            await _mediaAssets.DeleteOneAsync(asset => asset.Id == id);
        }
    }
}
