using AutoMapper;
using System.Collections.Generic;
using System.Linq;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories
{
    public class GameMongoDbRepository : IGameRepository
    {
        private readonly IMongoCollection<GameDb> _games;
        private readonly IMapper _mapper;

        public GameMongoDbRepository(IMongoDatabase database, IMapper mapper)
        {
            _mapper = mapper;
            _games = database.GetCollection<GameDb>("Games");
        }

        public async Task<List<Game>> GetAllAsync()
        {
            var gamesDb = await _games.Find(game => true).ToListAsync();
            if (gamesDb == null) {
                throw new Exception("Коллекция не найдена");
            }
                
            return _mapper.Map<List<Game>>(gamesDb);
        }

        public async Task<Game> GetByIdAsync(string id)
        {
            var gamesDb = await _games.Find(game => game.Id == id).ToListAsync();
            if (gamesDb == null)
            {
                throw new Exception("Коллекция не найдена");
            }
            return _mapper.Map<Game>(gamesDb.FirstOrDefault());
        }

        public async Task<Game> GetByExternalIdAsync(string externalId)
        {
            if (string.IsNullOrWhiteSpace(externalId))
            {
                return null;
            }

            var gameDb = await _games.Find(game => game.ExternalId == externalId).FirstOrDefaultAsync();
            return _mapper.Map<Game>(gameDb);
        }

        public async Task<Game> GetBySlugAsync(string slug)
        {
            if (string.IsNullOrWhiteSpace(slug))
            {
                return null;
            }

            var gameDb = await _games.Find(game => game.Slug == slug).FirstOrDefaultAsync();
            return _mapper.Map<Game>(gameDb);
        }

        public async Task<List<Game>> GetByIdsAsync(IEnumerable<string> ids)
        {
            var idList = ids?.ToList() ?? new List<string>();
            if (!idList.Any())
            {
                return new List<Game>();
            }

            // Id хранится как ObjectId: непарсящийся идентификатор роняет запрос ещё на сериализации
            // фильтра. Для вызывающего это должно выглядеть как «игра не найдена», а не как 500.
            var validIds = idList.Where(id => ObjectId.TryParse(id, out _)).ToList();
            if (validIds.Count == 0)
            {
                return new List<Game>();
            }

            var gamesDb = await _games.Find(game => validIds.Contains(game.Id)).ToListAsync();
            return _mapper.Map<List<Game>>(gamesDb);
        }

        public async Task<List<Game>> GetWithRegionSettingsAsync()
        {
            // Игр с региональными настройками единицы: у остальных ключи глобальные и настраивать
            // нечего. Складскому отчёту нужны только они — весь каталог он раньше грузил зря.
            var filter = Builders<GameDb>.Filter.Or(
                Builders<GameDb>.Filter.Ne(game => game.RegionPolicy, null),
                Builders<GameDb>.Filter.Ne(game => game.RegionPrices, null));

            var gamesDb = await _games.Find(filter).ToListAsync();
            return _mapper.Map<List<Game>>(gamesDb);
        }

        /// <summary>
        /// Страница каталога для админских списков. Поиск, сортировка и окно строк — в базе:
        /// раньше страница скидок забирала каталог целиком и фильтровала его в браузере, что
        /// на тридцати тысячах игр означало мегабайты на каждое открытие экрана.
        /// </summary>
        public async Task<(List<Game> Items, long Total)> GetPageAsync(
            string? search,
            IReadOnlyCollection<string>? onlyIds,
            IReadOnlyCollection<string>? excludeIds,
            string sortBy,
            bool descending,
            int skip,
            int take,
            bool onlyWithManualPrices = false)
        {
            var builder = Builders<GameDb>.Filter;
            var filter = builder.Empty;

            var needle = (search ?? string.Empty).Trim();
            if (needle.Length > 0)
            {
                // Ищем по вхождению в название или во внутреннее имя — так же, как человек
                // помнит игру: «lands» должно находить «Wildlands».
                var regex = new MongoDB.Bson.BsonRegularExpression(System.Text.RegularExpressions.Regex.Escape(needle), "i");
                filter &= builder.Or(
                    builder.Regex(game => game.Title, regex),
                    builder.Regex(game => game.Name, regex));
            }

            if (onlyIds != null)
            {
                // Пустой набор означает «подходящих игр нет» — фильтр по пустому списку
                // и даёт ровно этот ответ, без отдельной ветки в вызывающем коде.
                filter &= builder.In(game => game.Id, onlyIds);
            }

            if (excludeIds != null && excludeIds.Count > 0)
            {
                filter &= builder.Nin(game => game.Id, excludeIds);
            }

            if (onlyWithManualPrices)
            {
                // «Есть хоть одна ручная цена»: поле существует и это не пустой объект.
                // Пустой словарь остаётся в базе после снятия последней ручной цены, поэтому
                // одной проверки на существование мало.
                filter &= builder.And(
                    builder.Exists(game => game.Prices),
                    builder.Ne(game => game.Prices, null),
                    builder.Ne(game => game.Prices, new Dictionary<string, decimal>()));
            }

            var sort = (sortBy ?? "title").Trim().ToLowerInvariant() switch
            {
                "price" => descending
                    ? Builders<GameDb>.Sort.Descending(game => game.Price)
                    : Builders<GameDb>.Sort.Ascending(game => game.Price),
                _ => descending
                    ? Builders<GameDb>.Sort.Descending(game => game.Title)
                    : Builders<GameDb>.Sort.Ascending(game => game.Title),
            };

            var total = await _games.CountDocumentsAsync(filter);
            var page = await _games
                .Find(filter)
                .Sort(sort)
                .Skip(Math.Max(0, skip))
                .Limit(Math.Clamp(take, 1, 200))
                .ToListAsync();

            return (page.Select(item => _mapper.Map<Game>(item)).ToList(), total);
        }

        public async Task<List<Game>> GetByCoverMediaIdAsync(string mediaId)
        {
            if (string.IsNullOrWhiteSpace(mediaId))
            {
                return new List<Game>();
            }

            var gamesDb = await _games.Find(game => game.CoverMediaId == mediaId).ToListAsync();
            return _mapper.Map<List<Game>>(gamesDb);
        }

        public async Task CreateAsync(Game game)
        {
            var gameDb = _mapper.Map<GameDb>(game);
            await _games.InsertOneAsync(gameDb);
        }

        public async Task UpdateAsync(string id, Game updatedGame)
        {
            var game = _mapper.Map<GameDb>(updatedGame);
            await _games.ReplaceOneAsync(g => g.Id == id, game);
        }

        public async Task DeleteAsync(string id)
        {
            await _games.DeleteOneAsync(game => game.Id == id);
        }
    }
}
