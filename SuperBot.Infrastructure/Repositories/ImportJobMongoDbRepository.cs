using AutoMapper;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class ImportJobMongoDbRepository : IImportJobRepository
    {
        private readonly IMongoCollection<ImportJobDb> _jobs;
        private readonly IMapper _mapper;

        public ImportJobMongoDbRepository(IMongoDatabase database, IMapper mapper)
        {
            _mapper = mapper;
            _jobs = database.GetCollection<ImportJobDb>("ImportJobs");
        }

        public async Task CreateAsync(ImportJob job)
        {
            var db = _mapper.Map<ImportJobDb>(job);
            await _jobs.InsertOneAsync(db);
            job.Id = db.Id;
        }

        public async Task UpdateAsync(ImportJob job)
        {
            var db = _mapper.Map<ImportJobDb>(job);
            await _jobs.ReplaceOneAsync(item => item.Id == job.Id, db, new ReplaceOptions { IsUpsert = true });
        }

        public async Task<ImportJob> GetByIdAsync(string id)
        {
            var db = await _jobs.Find(item => item.Id == id).FirstOrDefaultAsync();
            return _mapper.Map<ImportJob>(db);
        }

        public async Task<IReadOnlyList<ImportJob>> GetRecentAsync(int limit)
        {
            var items = await _jobs.Find(Builders<ImportJobDb>.Filter.Empty)
                .SortByDescending(item => item.StartedAt)
                .Limit(limit)
                .ToListAsync();
            return _mapper.Map<IReadOnlyList<ImportJob>>(items);
        }
    }
}
