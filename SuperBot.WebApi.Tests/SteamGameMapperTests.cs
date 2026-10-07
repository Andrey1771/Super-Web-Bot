using SkiaSharp;
using SuperBot.Core.Entities;
using SuperBot.WebApi.Controllers;
using SuperBot.WebApi.Services.SteamImport;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>Карточка Steam → товар магазина: что берём, что пропускаем и как раскладываем поля.</summary>
public class SteamGameMapperTests
{
    private static readonly DateTime Now = new(2026, 10, 1, 12, 0, 0, DateTimeKind.Utc);

    private static SteamApp App(Action<SteamAppBuilder>? tweak = null)
    {
        var b = new SteamAppBuilder();
        tweak?.Invoke(b);
        return b.Build();
    }

    [Fact]
    public void Maps_a_regular_paid_game()
    {
        var ru = App(b => { b.Short = "Ролевая игра в открытом мире."; b.About = "<p>Найт-Сити.</p>"; b.Genres = ["Ролевые игры"]; });
        var result = SteamGameMapper.Map(App(), new Dictionary<string, SteamApp> { ["ru"] = ru }, ["Cyberpunk", "Open World", "RPG"], "/uploads/images/c.webp", Now);

        Assert.Null(result.SkipReason);
        var game = result.Game!;
        var details = result.Details!;
        Assert.Equal("steam-1091500", game.ExternalId);
        Assert.Equal("Cyberpunk 2077", game.Name);
        Assert.Equal("cyberpunk-2077", game.Slug);
        Assert.Equal(59.99m, game.Price);
        Assert.Equal(GameType.RolePlayingGames, game.GameType);
        Assert.Equal("role-playing-games-rpgs", game.Genre);
        Assert.Equal(new DateTime(2020, 12, 9, 0, 0, 0, DateTimeKind.Utc), game.ReleaseDate);
        Assert.Equal("/uploads/images/c.webp", game.ImagePath);
        Assert.Equal("Ролевая игра в открытом мире.", game.DescriptionI18n!["ru"]);

        Assert.Equal("Night City.", details.DescriptionMarkdown);
        Assert.Equal("Найт-Сити.", details.DescriptionMarkdownI18n!["ru"]);
        Assert.Equal(["Ролевые игры"], details.GenresI18n!["ru"]);
        Assert.Equal(["Cyberpunk", "Open World", "RPG"], details.Tags);
        Assert.Equal("CD PROJEKT RED", details.Developer!.Name);
        Assert.Equal(["English", "Polish"], details.Languages.Audio);
        Assert.Equal(["English", "Polish", "Ukrainian"], details.Languages.Text);
        Assert.Equal("PEGI", details.AgeRating!.System);
        Assert.Equal("18", details.AgeRating.Label);
        Assert.Equal(["Single-player", "Cloud saves"], details.OnlineFeatures);
        Assert.True(details.CloudSavesSupported);
        Assert.Equal(ControllerSupport.Full, details.ControllerSupport);
        Assert.Equal("64-bit Windows 10", details.SystemRequirements.Windows!.Minimum.Os);
        Assert.Equal("12 GB RAM", details.SystemRequirements.Windows.Minimum.Ram);
        Assert.Equal("DirectX: Version 12", details.SystemRequirements.Windows.Minimum.Notes);
        Assert.False(details.IsDraft);
        Assert.True(details.IsActive);
        Assert.True(details.IsTopRated);

        // Трейлер — первым, потом скриншоты; поток HLS, постер — кадр Steam.
        Assert.Equal("video", details.Gallery[0].Type);
        Assert.Equal("https://video.example/hls.m3u8", details.Gallery[0].Url);
        Assert.True(details.Gallery[0].IsTrailer);
        Assert.Equal("image", details.Gallery[1].Type);
        Assert.Equal("https://cdn.example/ss.1920x1080.jpg", details.Gallery[1].Url);
        Assert.Equal([0, 1], details.Gallery.Select(g => g.Order));
    }

    [Fact]
    public void Untranslated_text_is_not_stored_as_a_translation()
    {
        // Без перевода Steam отдаёт английский текст — такой «перевод» не сохраняем.
        var result = SteamGameMapper.Map(App(), new Dictionary<string, SteamApp> { ["pl"] = App() }, [], null, Now);

        Assert.Null(result.Game!.DescriptionI18n);
        Assert.Null(result.Details!.DescriptionMarkdownI18n);
        Assert.Null(result.Details.GenresI18n);
    }

    [Theory]
    [InlineData("dlc", false, 0, 5999, "Dec 9, 2020", "not a game")]
    [InlineData("game", true, 0, 5999, "Dec 9, 2020", "free to play")]
    [InlineData("game", false, 3, 5999, "Dec 9, 2020", "adult-only")]
    [InlineData("game", false, 0, 0, "Dec 9, 2020", "no USD price")]
    [InlineData("game", false, 0, 5999, "Q1 2027", "not exact")]
    [InlineData("game", false, 0, 5999, "Coming soon", "not exact")]
    public void Skips_what_the_store_cannot_sell(string type, bool free, int descriptor, int cents, string date, string reason)
    {
        var app = App(b =>
        {
            b.Type = type;
            b.Free = free;
            b.Descriptors = descriptor == 0 ? [] : [descriptor];
            b.Cents = cents == 0 ? null : cents;
            b.Date = date;
        });

        var result = SteamGameMapper.Map(app, new Dictionary<string, SteamApp>(), [], null, Now);

        Assert.Null(result.Game);
        Assert.Contains(reason, result.SkipReason);
    }

    [Fact]
    public void Description_made_only_of_images_starts_with_the_short_text()
    {
        var app = App(b => b.About = "<p><span class=\"bb_img_ctn\"><video poster=\"https://cdn.example/p.avif\"></video></span></p>");

        var details = SteamGameMapper.Map(app, new Dictionary<string, SteamApp>(), ["Open World", "Nudity", "RPG"], null, Now).Details!;

        Assert.Equal("An open-world RPG.\n\n![](https://cdn.example/p.avif)", details.DescriptionMarkdown);
        Assert.Equal(["Open World", "RPG"], details.Tags);
    }

    [Fact]
    public void Dlc_is_taken_only_when_imported_for_its_game()
    {
        var dlc = App(b => b.Type = "dlc");

        Assert.Contains("not a game", SteamGameMapper.Map(dlc, new Dictionary<string, SteamApp>(), [], null, Now).SkipReason);
        Assert.NotNull(SteamGameMapper.Map(dlc, new Dictionary<string, SteamApp>(), [], null, Now, asDlc: true).Game);
        // К игре импортируется только DLC, не сама игра и не саундтрек.
        Assert.Contains("not a DLC", SteamGameMapper.Map(App(), new Dictionary<string, SteamApp>(), [], null, Now, asDlc: true).SkipReason);
        // Бесплатное DLC ключом не продают — те же правила, что у игр.
        Assert.Contains("free", SteamGameMapper.Map(App(b => { b.Type = "dlc"; b.Free = true; }), new Dictionary<string, SteamApp>(), [], null, Now, asDlc: true).SkipReason);
    }

    [Fact]
    public void Software_marked_as_a_game_is_skipped()
    {
        var result = SteamGameMapper.Map(App(b => b.Genres = ["Casual", "Utilities"]), new Dictionary<string, SteamApp>(), [], null, Now);

        Assert.Null(result.Game);
        Assert.Contains("software", result.SkipReason);
    }

    [Theory]
    [InlineData(new[] { "Casual", "Animation & Modeling", "Design & Illustration", "Utilities" }, "utilities")]
    [InlineData(new[] { "Animation & Modeling", "Design & Illustration", "Game Development" }, "design")]
    [InlineData(new[] { "Accounting" }, "office")]
    public void Software_import_maps_programs_to_software_categories(string[] genres, string category)
    {
        var result = SteamGameMapper.Map(App(b => b.Genres = genres), new Dictionary<string, SteamApp>(), [], null, Now, asSoftware: true);

        Assert.Null(result.SkipReason);
        Assert.Equal(ProductKind.Software, result.Game!.Kind);
        Assert.Equal(category, result.Game.SoftwareCategory);
        Assert.Null(result.Game.Genre);
    }

    [Fact]
    public void Software_import_skips_games()
    {
        var result = SteamGameMapper.Map(App(b => b.Genres = ["Action", "RPG"]), new Dictionary<string, SteamApp>(), [], null, Now, asSoftware: true);

        Assert.Null(result.Game);
        Assert.Contains("not software", result.SkipReason);
    }

    [Fact]
    public void Upcoming_game_with_exact_date_and_price_is_a_preorder()
    {
        var result = SteamGameMapper.Map(App(b => b.Date = "Feb 4, 2027"), new Dictionary<string, SteamApp>(), [], null, Now);

        Assert.Equal(new DateTime(2027, 2, 4, 0, 0, 0, DateTimeKind.Utc), result.Game!.ReleaseDate);
        Assert.False(result.Details!.IsNew);
    }

    [Theory]
    [InlineData(new[] { "Action", "Adventure" }, new[] { "Horror", "Survival" }, GameType.Horror)]
    [InlineData(new[] { "Action", "RPG" }, new[] { "Souls-like" }, GameType.RolePlayingGames)]
    [InlineData(new[] { "Simulation", "Sports" }, new string[0], GameType.Sports)]
    [InlineData(new[] { "Racing" }, new string[0], GameType.Sports)]
    [InlineData(new[] { "Indie", "Strategy" }, new[] { "Deckbuilding", "Roguelike" }, GameType.CardAndBoardGames)]
    [InlineData(new[] { "Action", "Massively Multiplayer" }, new string[0], GameType.MassivelyMultiplayerOnline)]
    [InlineData(new[] { "Indie" }, new string[0], GameType.Action)]
    public void Picks_one_store_genre(string[] genres, string[] tags, GameType expected)
    {
        Assert.Equal(expected, SteamGameMapper.PickType(genres, tags));
    }

    [Theory]
    [InlineData("Dec 9, 2020", 2020, 12, 9)]
    [InlineData("9 Dec, 2020", 2020, 12, 9)]
    [InlineData("February 4, 2027", 2027, 2, 4)]
    public void Parses_exact_release_dates(string text, int y, int m, int d)
    {
        Assert.Equal(new DateTime(y, m, d, 0, 0, 0, DateTimeKind.Utc), SteamGameMapper.ParseReleaseDate(text));
    }

    [Fact]
    public void Trademark_signs_are_dropped_from_names()
    {
        Assert.Equal("EA SPORTS FC 27", SteamGameMapper.CleanName("EA SPORTS FC™ 27"));
        Assert.Equal("Tom Clancy's Rainbow Six Siege", SteamGameMapper.CleanName("Tom Clancy&#39;s Rainbow Six® Siege"));
    }

    [Fact]
    public void Update_keeps_shop_owned_fields()
    {
        var existing = new Game { Id = "g1", Price = 39.99m, Currency = "USD", LowStockThreshold = 3 };
        var existingDetails = new GameDetails { IsDraft = true, ShowInFeaturedStorefront = true, BasePrice = 39.99m, FinalPrice = 39.99m, ReviewsCount = 7, RatingAvg = 4.5 };
        var mapped = SteamGameMapper.Map(App(), new Dictionary<string, SteamApp>(), [], null, Now);

        SteamCatalogImporter.MergeShopOwnedFields(existing, existingDetails, mapped.Game!, mapped.Details!, new SteamImportOptions { UpdateExisting = true });

        Assert.Equal(39.99m, mapped.Game!.Price);
        Assert.Equal(3, mapped.Game.LowStockThreshold);
        Assert.True(mapped.Details!.IsDraft);
        Assert.True(mapped.Details.ShowInFeaturedStorefront);
        Assert.Equal(39.99m, mapped.Details.FinalPrice);
        Assert.Equal(7, mapped.Details.ReviewsCount);

        var refreshed = SteamGameMapper.Map(App(), new Dictionary<string, SteamApp>(), [], null, Now);
        SteamCatalogImporter.MergeShopOwnedFields(existing, existingDetails, refreshed.Game!, refreshed.Details!, new SteamImportOptions { UpdateExisting = true, RefreshPrices = true });
        Assert.Equal(59.99m, refreshed.Game!.Price);
        Assert.Equal(59.99m, refreshed.Details!.FinalPrice);
    }

    [Fact]
    public void App_ids_are_read_from_ids_links_and_comments()
    {
        const string text = """
            # starter list
            1091500   # Cyberpunk 2077
            https://store.steampowered.com/app/292030/The_Witcher_3_Wild_Hunt/
            620, 1091500
            not-a-number 12abc
            """;

        Assert.Equal(["1091500", "292030", "620"], AdminSteamImportController.ParseAppIds(text));
    }

    [Fact]
    public void Composed_cover_is_4x3_and_keeps_the_logo_in_the_centre()
    {
        static byte[] Png(int w, int h, SKColor color)
        {
            using var bitmap = new SKBitmap(w, h);
            bitmap.Erase(color);
            using var image = SKImage.FromBitmap(bitmap);
            using var data = image.Encode(SKEncodedImageFormat.Png, 100);
            return data.ToArray();
        }

        var bytes = SteamCoverBuilder.Compose(Png(3840, 1240, SKColors.DarkBlue), Png(640, 360, SKColors.Yellow));

        using var result = SKBitmap.Decode(bytes);
        Assert.Equal(SteamCoverBuilder.Width, result.Width);
        Assert.Equal(SteamCoverBuilder.Height, result.Height);
        var centre = result.GetPixel(result.Width / 2, result.Height / 2);
        Assert.True(centre.Red > 200 && centre.Green > 200 && centre.Blue < 80, $"centre pixel {centre}");
        var corner = result.GetPixel(10, 10);
        Assert.True(corner.Blue > corner.Red, $"corner pixel {corner}");
    }

    [Fact]
    public void Blank_gradient_art_is_recognised_and_real_art_is_not()
    {
        using var gradient = new SKBitmap(1920, 620);
        using (var canvas = new SKCanvas(gradient))
        using (var paint = new SKPaint())
        {
            paint.Shader = SKShader.CreateLinearGradient(new SKPoint(0, 0), new SKPoint(0, 620),
                [new SKColor(0, 16, 48), new SKColor(40, 140, 170)], SKShaderTileMode.Clamp);
            canvas.DrawRect(0, 0, 1920, 620, paint);
        }
        using var art = new SKBitmap(1920, 620);
        using (var canvas = new SKCanvas(art))
        using (var paint = new SKPaint { Color = SKColors.Orange })
        {
            canvas.Clear(SKColors.Navy);
            for (var i = 0; i < 40; i++)
            {
                canvas.DrawRect(i * 48, (i * 37) % 500, 24, 120, paint);
            }
        }
        static byte[] Jpeg(SKBitmap bitmap) => SKImage.FromBitmap(bitmap).Encode(SKEncodedImageFormat.Jpeg, 90).ToArray();

        Assert.True(SteamCoverBuilder.IsBlank(Jpeg(gradient)));
        Assert.False(SteamCoverBuilder.IsBlank(Jpeg(art)));
    }

    [Fact]
    public void Art_without_a_logo_fills_the_whole_frame()
    {
        using var source = new SKBitmap(3840, 1240);
        source.Erase(SKColors.Red);
        using var encoded = SKImage.FromBitmap(source).Encode(SKEncodedImageFormat.Png, 100);

        using var result = SKBitmap.Decode(SteamCoverBuilder.Fill(encoded.ToArray()));

        Assert.Equal(SteamCoverBuilder.Width, result.Width);
        Assert.Equal(SteamCoverBuilder.Height, result.Height);
        // Ни полей, ни размытого фона: угол кадра — та же картинка.
        var corner = result.GetPixel(5, 5);
        Assert.True(corner.Red > 200 && corner.Green < 60, $"corner {corner}");
    }

    private sealed class SteamAppBuilder
    {
        public string Type = "game";
        public bool Free;
        public int? Cents = 5999;
        public string Date = "Dec 9, 2020";
        public IReadOnlyList<int> Descriptors = [];
        public string Short = "An open-world RPG.";
        public string About = "<p>Night City.</p>";
        public IReadOnlyList<string> Genres = ["RPG"];

        public SteamApp Build() => new()
        {
            AppId = "1091500",
            Type = Type,
            Name = "Cyberpunk 2077",
            IsFree = Free,
            RequiredAge = 17,
            ControllerSupport = "full",
            ShortDescription = Short,
            AboutTheGameHtml = About,
            SupportedLanguagesHtml = "English<strong>*</strong>, Polish<strong>*</strong>, Ukrainian<br><strong>*</strong>languages with full audio support",
            PcRequirementsMinimumHtml = "<strong>Minimum:</strong><br><ul class=\"bb_ul\"><li><strong>OS:</strong> 64-bit Windows 10<br></li><li><strong>Memory:</strong> 12 GB RAM<br></li><li><strong>DirectX:</strong> Version 12</li></ul>",
            Developers = ["CD PROJEKT RED"],
            Publishers = ["CD PROJEKT RED"],
            PriceInitialCents = Cents,
            PriceCurrency = Cents is null ? null : "USD",
            Windows = true,
            MetacriticScore = 86,
            Categories = ["Single-player", "Steam Cloud"],
            Genres = Genres,
            GenreIds = ["3"],
            Screenshots = [new SteamScreenshot("https://cdn.example/ss.600x338.jpg", "https://cdn.example/ss.1920x1080.jpg")],
            Movies = [new SteamMovie("1", "Trailer", "https://cdn.example/movie.jpg", "https://video.example/hls.m3u8", null, true)],
            ReleaseDateText = Date,
            ContentDescriptorIds = Descriptors,
            PegiRating = "18",
        };
    }
}
