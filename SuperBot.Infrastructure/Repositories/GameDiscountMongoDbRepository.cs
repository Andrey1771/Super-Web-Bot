using SuperBot.Infrastructure.Mapping;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Repositories;

public class GameDiscountMongoDbRepository : IGameDiscountRepository
{
    private readonly IMongoCollection<GameDiscountDb> _discounts;
    /// <summary>Каталог: список скидок в админке строится от игр, а не от скидок — игры без
    /// скидки в нём тоже есть, и именно их чаще всего и ищут.</summary>
    private readonly IMongoCollection<BsonDocument> _games;
    private readonly IMapper _mapper;

    public GameDiscountMongoDbRepository(IMongoDatabase database, IMapper mapper)
    {
        _mapper = mapper;
        _discounts = database.GetCollection<GameDiscountDb>("GameDiscounts");
        _games = database.GetCollection<BsonDocument>("Games");
    }

    public async Task<GameDiscount?> GetByGameIdAsync(string gameId)
    {
        if (string.IsNullOrWhiteSpace(gameId))
        {
            return null;
        }

        var discountDb = await _discounts.Find(discount => discount.GameId == gameId).FirstOrDefaultAsync();
        return _mapper.Map<GameDiscount?>(discountDb);
    }

    public async Task<List<GameDiscount>> GetAllAsync()
    {
        var discountsDb = await _discounts.Find(FilterDefinition<GameDiscountDb>.Empty).ToListAsync();
        return discountsDb.Select(item => _mapper.Map<GameDiscount>(item)).ToList();
    }

    public async Task<List<GameDiscount>> GetByGameIdsAsync(IEnumerable<string> gameIds)
    {
        var ids = gameIds?.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct().ToList() ?? new List<string>();
        if (ids.Count == 0)
        {
            return new List<GameDiscount>();
        }

        var discountsDb = await _discounts.Find(discount => ids.Contains(discount.GameId)).ToListAsync();
        return _mapper.Map<List<GameDiscount>>(discountsDb);
    }


    /// <summary>
    /// Окно строк для админского списка скидок. Join, вычисление статуса и итоговой цены,
    /// фильтр и сортировка — одним конвейером в базе.
    ///
    /// Раньше страница брала ВСЕ скидки в память, строила по ним список идентификаторов и
    /// отдавала его фильтром в запрос игр. Сортировать при этом можно было только по полям
    /// самой игры: скидки, итоговой цены и статуса в том запросе просто не существовало.
    /// </summary>
    public async Task<(List<GameDiscountRow> Items, long Total)> GetCatalogPageAsync(
        string? search,
        string status,
        string sortBy,
        bool descending,
        int skip,
        int take,
        DateTime now)
    {
        var pipeline = new List<BsonDocument>();

        var needle = (search ?? string.Empty).Trim();
        if (needle.Length > 0)
        {
            // Ищем по вхождению в название или во внутреннее имя — так же, как человек
            // помнит игру: «lands» должно находить «Wildlands».
            var regex = new BsonRegularExpression(System.Text.RegularExpressions.Regex.Escape(needle), "i");
            pipeline.Add(new BsonDocument("$match", new BsonDocument("$or", new BsonArray
            {
                new BsonDocument("title", regex),
                new BsonDocument("name", regex)
            })));
        }

        // gameId в скидках — строка, _id игры — ObjectId; сводим их к одному виду перед join.
        pipeline.Add(new BsonDocument("$addFields", new BsonDocument("gameIdString", new BsonDocument("$toString", "$_id"))));
        pipeline.Add(new BsonDocument("$lookup", new BsonDocument
        {
            { "from", "GameDiscounts" },
            { "localField", "gameIdString" },
            { "foreignField", "gameId" },
            { "as", "discountDocs" }
        }));
        pipeline.Add(new BsonDocument("$addFields", new BsonDocument("discount", new BsonDocument("$arrayElemAt", new BsonArray { "$discountDocs", 0 }))));

        var nowValue = new BsonDateTime(now);
        pipeline.Add(new BsonDocument("$addFields", new BsonDocument
        {
            { "discountPercent", "$discount.discountPercent" },
            { "discountStart", "$discount.startDate" },
            { "discountEnd", "$discount.endDate" },
            {
                "discountStatus", new BsonDocument("$switch", new BsonDocument
                {
                    { "branches", new BsonArray
                        {
                            new BsonDocument
                            {
                                { "case", new BsonDocument("$eq", new BsonArray { new BsonDocument("$ifNull", new BsonArray { "$discount", BsonNull.Value }), BsonNull.Value }) },
                                { "then", "no_discount" }
                            },
                            new BsonDocument
                            {
                                { "case", new BsonDocument("$gt", new BsonArray { "$discount.startDate", nowValue }) },
                                { "then", "scheduled" }
                            },
                            new BsonDocument
                            {
                                { "case", new BsonDocument("$lt", new BsonArray { "$discount.endDate", nowValue }) },
                                { "then", "expired" }
                            }
                        }
                    },
                    { "default", "active" }
                })
            },
            {
                // Итоговая цена нужна здесь только для сортировки; на экран идёт та, что
                // считает PriceCalculator, — правило округления должно быть одно на весь код.
                "finalPriceSort", new BsonDocument("$cond", new BsonArray
                {
                    new BsonDocument("$eq", new BsonArray { new BsonDocument("$ifNull", new BsonArray { "$discount", BsonNull.Value }), BsonNull.Value }),
                    "$price",
                    new BsonDocument("$multiply", new BsonArray
                    {
                        "$price",
                        new BsonDocument("$subtract", new BsonArray { 1, new BsonDocument("$divide", new BsonArray { "$discount.discountPercent", 100 }) })
                    })
                })
            }
        }));

        var slice = (status ?? "all").Trim().ToLowerInvariant();
        if (slice is "active" or "scheduled" or "expired" or "no_discount")
        {
            pipeline.Add(new BsonDocument("$match", new BsonDocument("discountStatus", slice)));
        }

        // Порядок статусов — по «живости», а не по алфавиту: сначала то, что действует сейчас,
        // в конце — игры вообще без скидки. По алфавиту expired оказался бы выше scheduled.
        pipeline.Add(new BsonDocument("$addFields", new BsonDocument("statusRank", new BsonDocument("$switch", new BsonDocument
        {
            { "branches", new BsonArray
                {
                    new BsonDocument { { "case", new BsonDocument("$eq", new BsonArray { "$discountStatus", "active" }) }, { "then", 0 } },
                    new BsonDocument { { "case", new BsonDocument("$eq", new BsonArray { "$discountStatus", "scheduled" }) }, { "then", 1 } },
                    new BsonDocument { { "case", new BsonDocument("$eq", new BsonArray { "$discountStatus", "expired" }) }, { "then", 2 } }
                }
            },
            { "default", 3 }
        }))));

        var direction = descending ? -1 : 1;
        var sortField = (sortBy ?? "title").Trim().ToLowerInvariant() switch
        {
            "baseprice" or "price" => "price",
            "discountpercent" or "discount" => "discountPercent",
            "finalprice" => "finalPriceSort",
            "period" or "startdate" => "discountStart",
            "status" => "statusRank",
            _ => "title"
        };

        // Второй ключ — название: без него строки с одинаковым значением (а игр без скидки
        // большинство) перескакивали бы между окнами при прокрутке.
        var sortDoc = new BsonDocument(sortField, direction);
        if (sortField != "title")
        {
            sortDoc.Add("title", 1);
        }
        pipeline.Add(new BsonDocument("$sort", sortDoc));

        var window = skip < 0 ? 0 : skip;
        var limit = take is < 1 or > 200 ? 50 : take;

        pipeline.Add(new BsonDocument("$facet", new BsonDocument
        {
            { "items", new BsonArray
                {
                    new BsonDocument("$skip", window),
                    new BsonDocument("$limit", limit),
                    new BsonDocument("$project", new BsonDocument
                    {
                        { "_id", 1 },
                        { "title", 1 },
                        { "name", 1 },
                        { "imagePath", 1 },
                        { "price", 1 },
                        { "discountPercent", 1 },
                        { "discountStart", 1 },
                        { "discountEnd", 1 },
                        { "discountStatus", 1 }
                    })
                }
            },
            { "total", new BsonArray { new BsonDocument("$count", "value") } }
        }));

        var facet = await _games.Aggregate<BsonDocument>(pipeline).FirstOrDefaultAsync();
        if (facet == null)
        {
            return (new List<GameDiscountRow>(), 0);
        }

        var total = facet["total"].AsBsonArray.Count == 0 ? 0L : facet["total"][0]["value"].ToInt64();
        var items = facet["items"].AsBsonArray.Select(element =>
        {
            var row = element.AsBsonDocument;
            return new GameDiscountRow
            {
                GameId = row["_id"].AsObjectId.ToString(),
                Title = row.GetValue("title", BsonNull.Value).IsBsonNull
                    ? row.GetValue("name", BsonNull.Value).IsBsonNull ? null : row["name"].AsString
                    : row["title"].AsString,
                ImagePath = row.GetValue("imagePath", BsonNull.Value).IsBsonNull ? null : row["imagePath"].AsString,
                BasePrice = row.GetValue("price", BsonNull.Value).IsBsonNull ? 0m : row["price"].ToDecimal(),
                DiscountPercent = row.GetValue("discountPercent", BsonNull.Value).IsBsonNull ? null : row["discountPercent"].ToDecimal(),
                StartDate = row.GetValue("discountStart", BsonNull.Value).IsBsonNull ? null : row["discountStart"].ToUniversalTime(),
                EndDate = row.GetValue("discountEnd", BsonNull.Value).IsBsonNull ? null : row["discountEnd"].ToUniversalTime(),
                Status = row.GetValue("discountStatus", "no_discount").AsString
            };
        }).ToList();

        return (items, total);
    }

    public async Task UpsertAsync(GameDiscount discount)
    {
        var discountDb = _mapper.Map<GameDiscountDb>(discount);

        // Именно Update, а не ReplaceOne: replace-upsert не запускает генератор _id,
        // и вторая вставленная скидка падала бы на дубликате _id: null.
        // При update-upsert сервер сам генерирует _id для нового документа.
        var update = Builders<GameDiscountDb>.Update
            .Set(existing => existing.GameId, discountDb.GameId)
            .Set(existing => existing.DiscountPercent, discountDb.DiscountPercent)
            .Set(existing => existing.StartDate, discountDb.StartDate)
            .Set(existing => existing.EndDate, discountDb.EndDate);

        await _discounts.UpdateOneAsync(
            existing => existing.GameId == discountDb.GameId,
            update,
            new UpdateOptions { IsUpsert = true });
    }

    public async Task DeleteByGameIdAsync(string gameId)
    {
        await _discounts.DeleteOneAsync(discount => discount.GameId == gameId);
    }
}
