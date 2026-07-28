using System.Text;
using MongoDB.Bson;
using MongoDB.Driver;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Services
{
    /// <summary>
    /// Наполняет сайт демонстрационным каталогом, чтобы заказчик открыл витрину и увидел
    /// настоящий магазин, а не три тестовые заглушки. Гейтнут конфигом (Seed:Enabled) и
    /// идемпотентен: помечает прогон версией в коллекции DemoSeedState и повторно не льёт,
    /// пока версия не вырастет или не выставлен Seed:Force. Запускается на старте после
    /// MongoDbInitializer, поэтому переживает деплой без ручных шагов.
    ///
    /// ВАЖНО: это ДЕМО-данные. Прогон полностью пересобирает каталог (Games/GameDetails/
    /// GameDiscounts/GameKeys) — на портфельном стенде реальных покупателей нет, терять нечего.
    /// </summary>
    public class DemoDataSeeder
    {
        // Растёт при изменении набора — тогда на следующем старте каталог пересоберётся.
        // v2: убрали ImagePath (обложки рисует фронт), поэтому нужен ре-сид старого v1-каталога.
        private const int CatalogSeedVersion = 2;
        private const string SeedStateCollection = "DemoSeedState";
        private const string CatalogMarkerId = "catalog";
        private const string PoolKeyType = "Steam Key";

        private readonly IGameRepository _games;
        private readonly IGameDetailsRepository _details;
        private readonly IGameKeyRepository _keys;
        private readonly IGameDiscountRepository _discounts;
        private readonly IMongoDatabase _database;
        private readonly IConfiguration _configuration;
        private readonly ILogger<DemoDataSeeder> _logger;

        public DemoDataSeeder(
            IGameRepository games,
            IGameDetailsRepository details,
            IGameKeyRepository keys,
            IGameDiscountRepository discounts,
            IMongoDatabase database,
            IConfiguration configuration,
            ILogger<DemoDataSeeder> logger)
        {
            _games = games;
            _details = details;
            _keys = keys;
            _discounts = discounts;
            _database = database;
            _configuration = configuration;
            _logger = logger;
        }

        public async Task SeedAsync()
        {
            if (!_configuration.GetValue("Seed:Enabled", true))
            {
                _logger.LogInformation("Demo seed disabled (Seed:Enabled=false).");
                return;
            }

            var force = _configuration.GetValue("Seed:Force", false);
            var state = _database.GetCollection<BsonDocument>(SeedStateCollection);
            var marker = await state.Find(d => d["_id"] == CatalogMarkerId).FirstOrDefaultAsync();
            var seededVersion = marker != null && marker.Contains("version") ? marker["version"].ToInt32() : 0;

            if (!force && seededVersion >= CatalogSeedVersion)
            {
                _logger.LogInformation("Demo catalog already seeded (v{Version}); skipping.", seededVersion);
                return;
            }

            _logger.LogInformation("Seeding demo catalog v{Version} (force={Force})...", CatalogSeedVersion, force);

            // Полный ресет каталожных коллекций — демо пересобираем с нуля.
            await ClearAsync("Games", "GameDetails", "GameDiscounts", "GameKeys");

            var now = DateTime.UtcNow;
            var seededGames = 0;
            var seededKeys = 0;
            var seededDiscounts = 0;

            foreach (var seed in Catalog)
            {
                var gameId = ObjectId.GenerateNewId().ToString();
                var slug = Slugify(seed.Title);
                var releaseDate = new DateTime(seed.Year, 1, 1, 0, 0, 0, DateTimeKind.Utc)
                    .AddDays(HashInt(seed.Title, 330));
                var finalPrice = seed.Discount is > 0
                    ? Math.Round(seed.Price * (100 - seed.Discount.Value) / 100m, 2)
                    : seed.Price;

                // Лёгкая карточка каталога.
                await _games.CreateAsync(new Game
                {
                    Id = gameId,
                    Slug = slug,
                    Name = seed.Title,
                    Title = seed.Title,
                    Price = seed.Price,
                    Description = seed.Tagline,
                    GameType = seed.Genre,
                    // Обложку не задаём — фронт (SafeGameImage/GameCoverPlaceholder) сам рисует
                    // градиент + название. Так демо не тащит ни внешних картинок, ни бэкенд-контроллера.
                    ImagePath = string.Empty,
                    ReleaseDate = releaseDate
                });

                // Тяжёлая страница игры.
                var genreLabel = GameTypeMapper.DescriptionsCategories[seed.Genre];
                await _details.CreateAsync(new GameDetails
                {
                    GameId = gameId,
                    Slug = slug,
                    Title = seed.Title,
                    Tagline = seed.Tagline,
                    DescriptionMarkdown = $"## {seed.Title}\n\n{seed.Tagline}\n\nInstant Steam key delivery. Region-free unless noted.",
                    Cover = null, // фронт рисует плейсхолдер по названию — см. ImagePath выше

                    Genres = new List<string> { genreLabel },
                    Tags = new List<string> { genreLabel, seed.Developer },
                    Developer = new GameStudioInfo { Name = seed.Developer },
                    Publisher = new GameStudioInfo { Name = seed.Developer },
                    ReleaseDate = releaseDate,
                    Platforms = new GamePlatforms { Windows = true, Mac = seed.Genre is GameType.Puzzle or GameType.CasualGames, Linux = false },
                    Languages = new GameLanguageSupport { Audio = new() { "English" }, Text = new() { "English", "Russian" } },
                    ControllerSupport = ControllerSupport.Full,
                    CloudSavesSupported = true,
                    BasePrice = seed.Price,
                    DiscountPercent = seed.Discount,
                    Currency = "USD",
                    FinalPrice = finalPrice,
                    IsActive = true,
                    IsNew = seed.New,
                    IsTopRated = seed.TopRated,
                    ShowInFeaturedStorefront = seed.Featured,
                    FeaturedStorefrontPriority = seed.Featured ? HashInt(seed.Title, 100) : 0,
                    KeyType = GameKeyType.SteamKey,
                    KeyFeatures = new List<string> { "Instant delivery", "Official Steam key", "Region-free" },
                    RatingAvg = Math.Round(3.9 + HashInt(seed.Title, 10) / 10.0, 1), // 3.9..4.8
                    ReviewsCount = 40 + HashInt(seed.Title, 1800)
                });

                // Пул ключей: часть игр специально оставляем без стока (out of stock) для реализма.
                if (seed.Stock > 0)
                {
                    var pool = GenerateKeys(seed.Stock);
                    var result = await _keys.AddPoolKeysAsync(gameId, PoolKeyType, pool);
                    seededKeys += result.Added;
                }

                if (seed.Discount is > 0)
                {
                    await _discounts.UpsertAsync(new GameDiscount
                    {
                        GameId = gameId,
                        DiscountPercent = seed.Discount.Value,
                        StartDate = now.AddDays(-3),
                        EndDate = now.AddDays(11)
                    });
                    seededDiscounts++;
                }

                seededGames++;
            }

            await state.ReplaceOneAsync(
                d => d["_id"] == CatalogMarkerId,
                new BsonDocument { { "_id", CatalogMarkerId }, { "version", CatalogSeedVersion }, { "seededAt", now } },
                new ReplaceOptions { IsUpsert = true });

            _logger.LogInformation("Demo catalog seeded: {Games} games, {Keys} keys, {Discounts} discounts.",
                seededGames, seededKeys, seededDiscounts);
        }

        private async Task ClearAsync(params string[] collections)
        {
            foreach (var name in collections)
            {
                await _database.GetCollection<BsonDocument>(name)
                    .DeleteManyAsync(FilterDefinition<BsonDocument>.Empty);
            }
        }

        private static List<string> GenerateKeys(int count)
        {
            var keys = new HashSet<string>();
            while (keys.Count < count)
            {
                keys.Add($"TALE-{Segment()}-{Segment()}-{Segment()}");
            }
            return keys.ToList();

            static string Segment() => Guid.NewGuid().ToString("N")[..5].ToUpperInvariant();
        }

        private static string Slugify(string title)
        {
            var sb = new StringBuilder(title.Length);
            var prevDash = false;
            foreach (var ch in title.ToLowerInvariant())
            {
                if (char.IsLetterOrDigit(ch))
                {
                    sb.Append(ch);
                    prevDash = false;
                }
                else if (!prevDash)
                {
                    sb.Append('-');
                    prevDash = true;
                }
            }
            return sb.ToString().Trim('-');
        }

        /// <summary>Детерминированное число 0..max-1 из названия — чтобы рейтинги/приоритеты были стабильны.</summary>
        private static int HashInt(string value, int max)
        {
            var hash = System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(value));
            var n = BitConverter.ToUInt32(hash, 0);
            return (int)(n % (uint)max);
        }

        private sealed record GameSeed(
            string Title,
            GameType Genre,
            decimal Price,
            int Stock,
            string Developer,
            string Tagline,
            int? Discount = null,
            bool Featured = false,
            bool TopRated = false,
            bool New = false,
            int Year = 2021);

        // ~48 реальных тайтлов с разбросом по жанрам, ценам, скидкам и стоку (в т.ч. out-of-stock).
        private static readonly GameSeed[] Catalog =
        {
            new("Elden Ring", GameType.RolePlayingGames, 59.99m, 18, "FromSoftware", "Rise, Tarnished, and be guided by grace.", Discount: 35, Featured: true, TopRated: true, Year: 2022),
            new("The Witcher 3: Wild Hunt", GameType.RolePlayingGames, 39.99m, 25, "CD Projekt Red", "A story-driven open-world RPG masterpiece.", Discount: 70, TopRated: true, Year: 2015),
            new("Cyberpunk 2077", GameType.RolePlayingGames, 49.99m, 20, "CD Projekt Red", "Become a mercenary outlaw in Night City.", Discount: 50, Featured: true, Year: 2020),
            new("Baldur's Gate 3", GameType.RolePlayingGames, 59.99m, 14, "Larian Studios", "Gather your party and return to the Forgotten Realms.", TopRated: true, New: true, Year: 2023),
            new("Disco Elysium", GameType.RolePlayingGames, 39.99m, 9, "ZA/UM", "A groundbreaking detective RPG.", Discount: 60, TopRated: true, Year: 2019),
            new("Persona 5 Royal", GameType.RolePlayingGames, 59.99m, 7, "Atlus", "Don the mask and stage a grand heist.", Discount: 25, Year: 2022),

            new("DOOM Eternal", GameType.Action, 39.99m, 22, "id Software", "Rip and tear through the forces of Hell.", Discount: 67, Year: 2020),
            new("Sekiro: Shadows Die Twice", GameType.Action, 59.99m, 12, "FromSoftware", "Sculpt your revenge in feudal Japan.", Discount: 40, TopRated: true, Year: 2019),
            new("Devil May Cry 5", GameType.Action, 29.99m, 16, "Capcom", "Stylish demon-slaying action.", Discount: 55, Year: 2019),
            new("Hades", GameType.Action, 24.99m, 30, "Supergiant Games", "Defy the god of the dead in this rogue-like.", TopRated: true, Year: 2020),
            new("Ghostrunner", GameType.Action, 29.99m, 0, "One More Level", "A brutal, lightning-fast cyberpunk katana slasher.", Discount: 75, Year: 2020),
            new("Metal Gear Rising: Revengeance", GameType.Action, 19.99m, 11, "PlatinumGames", "High-octane cyborg swordplay.", Discount: 80, Year: 2014),

            new("Red Dead Redemption 2", GameType.Adventure, 59.99m, 15, "Rockstar Games", "An epic tale of life in America's unforgiving heartland.", Discount: 56, Featured: true, TopRated: true, Year: 2019),
            new("Ghost of Tsushima", GameType.Adventure, 49.99m, 13, "Sucker Punch", "Forge a new path and wage war for Tsushima.", Discount: 30, New: true, Year: 2024),
            new("A Plague Tale: Requiem", GameType.Adventure, 49.99m, 8, "Asobo Studio", "A gripping tale of survival.", Discount: 45, Year: 2022),
            new("Firewatch", GameType.Adventure, 19.99m, 21, "Campo Santo", "A mystery set in the Wyoming wilderness.", Discount: 65, Year: 2016),
            new("Life is Strange", GameType.Adventure, 19.99m, 17, "Dontnod", "A choice-driven story about friendship and time.", Discount: 80, Year: 2015),

            new("Stardew Valley", GameType.Simulation, 14.99m, 40, "ConcernedApe", "Build the farm of your dreams.", TopRated: true, Year: 2016),
            new("Cities: Skylines II", GameType.Simulation, 49.99m, 10, "Colossal Order", "Raise a city from the ground up.", Discount: 20, New: true, Year: 2023),
            new("Euro Truck Simulator 2", GameType.Simulation, 19.99m, 26, "SCS Software", "Travel across Europe as a truck driver.", Discount: 70, Year: 2013),
            new("Microsoft Flight Simulator", GameType.Simulation, 59.99m, 0, "Asobo Studio", "The sky is calling.", Discount: 40, Year: 2020),
            new("House Flipper", GameType.Simulation, 19.99m, 14, "Empyrean", "Buy, repair and remodel houses.", Discount: 60, Year: 2018),

            new("Sid Meier's Civilization VI", GameType.Strategy, 29.99m, 19, "Firaxis Games", "Build an empire to stand the test of time.", Discount: 80, Year: 2016),
            new("Total War: Warhammer III", GameType.Strategy, 59.99m, 9, "Creative Assembly", "Command the mortal races against daemonic legions.", Discount: 50, Year: 2022),
            new("XCOM 2", GameType.Strategy, 29.99m, 15, "Firaxis Games", "Lead the resistance against alien occupation.", Discount: 75, Year: 2016),
            new("Frostpunk", GameType.Strategy, 29.99m, 12, "11 bit studios", "The city must survive.", Discount: 65, TopRated: true, Year: 2018),
            new("Age of Empires IV", GameType.Strategy, 39.99m, 0, "Relic Entertainment", "One life is not enough to make history.", Discount: 35, Year: 2021),

            new("Portal 2", GameType.Puzzle, 9.99m, 33, "Valve", "Now you're thinking with portals.", Discount: 75, TopRated: true, Year: 2011),
            new("The Witness", GameType.Puzzle, 39.99m, 8, "Thekla Inc.", "Explore a mysterious island of puzzles.", Discount: 70, Year: 2016),
            new("Baba Is You", GameType.Puzzle, 14.99m, 22, "Hempuli", "Rewrite the rules to solve the puzzle.", Discount: 30, Year: 2019),
            new("Tetris Effect: Connected", GameType.Puzzle, 39.99m, 16, "Monstars", "Tetris like you've never experienced it.", Discount: 40, New: true, Year: 2021),

            new("EA Sports FC 25", GameType.Sports, 69.99m, 20, "EA Vancouver", "The world's game, redefined.", Discount: 37, Featured: true, New: true, Year: 2024),
            new("Forza Horizon 5", GameType.Sports, 59.99m, 17, "Playground Games", "Explore the vibrant open world of Mexico.", Discount: 50, TopRated: true, Year: 2021),
            new("Rocket League", GameType.Sports, 19.99m, 28, "Psyonix", "Soccer, but with rocket-powered cars.", Discount: 60, Year: 2015),

            new("Slay the Spire", GameType.CardAndBoardGames, 24.99m, 24, "Mega Crit", "A deck-building rogue-like.", Discount: 40, TopRated: true, Year: 2019),
            new("Inscryption", GameType.CardAndBoardGames, 19.99m, 13, "Daniel Mullins", "A dark card-based odyssey.", Discount: 30, New: true, Year: 2021),
            new("Gwent: Rogue Mage", GameType.CardAndBoardGames, 9.99m, 18, "CD Projekt Red", "A single-player card adventure.", Year: 2022),

            new("Final Fantasy XIV Online", GameType.MassivelyMultiplayerOnline, 19.99m, 21, "Square Enix", "Begin your adventure in Eorzea.", Discount: 50, Year: 2013),
            new("Guild Wars 2", GameType.MassivelyMultiplayerOnline, 29.99m, 16, "ArenaNet", "A living, breathing online world.", Discount: 60, Year: 2012),
            new("Black Desert", GameType.MassivelyMultiplayerOnline, 9.99m, 0, "Pearl Abyss", "Stunning action-combat MMO.", Discount: 80, Year: 2017),

            new("Resident Evil 4", GameType.Horror, 39.99m, 14, "Capcom", "Survival horror, reborn.", Discount: 79, Featured: true, TopRated: true, New: true, Year: 2023),
            new("Dead by Daylight", GameType.Horror, 19.99m, 23, "Behaviour Interactive", "A 4v1 multiplayer horror.", Discount: 65, Year: 2016),
            new("Phasmophobia", GameType.Horror, 13.99m, 27, "Kinetic Games", "Co-op ghost hunting.", New: true, Year: 2020),
            new("Amnesia: The Bunker", GameType.Horror, 24.99m, 0, "Frictional Games", "Survive the horrors of the Great War.", Discount: 40, Year: 2023),
            new("Outlast", GameType.Horror, 19.99m, 15, "Red Barrels", "A first-person survival horror.", Discount: 85, Year: 2013),

            new("Stray", GameType.CasualGames, 29.99m, 19, "BlueTwelve Studio", "Roam a cyber-city as a stray cat.", Discount: 40, TopRated: true, New: true, Year: 2022),
            new("Cult of the Lamb", GameType.CasualGames, 24.99m, 22, "Massive Monster", "Build a devoted following.", Discount: 35, Year: 2022),
            new("Vampire Survivors", GameType.CasualGames, 4.99m, 35, "poncle", "Mow down thousands of night creatures.", TopRated: true, Year: 2022),
            new("Unpacking", GameType.CasualGames, 19.99m, 18, "Witch Beam", "A zen puzzle about unpacking a life.", Discount: 30, Year: 2021),

            new("Kerbal Space Program", GameType.EducationalGames, 39.99m, 12, "Squad", "Build rockets and explore the solar system.", Discount: 75, Year: 2015),
        };
    }
}
