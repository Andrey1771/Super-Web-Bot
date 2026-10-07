using System.Text.Json;
using SuperBot.WebApi.Services.SteamImport;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Разбор ответов Steam Store: карточка (appdetails), описание в markdown, требования, языки.
/// Фрагменты — из настоящих ответов Steam, сокращённые.
/// </summary>
public class SteamImportParsingTests
{
    private const string AppJson = """
    {"1091500":{"success":true,"data":{
      "type":"game","name":"Cyberpunk 2077","steam_appid":1091500,"required_age":"17","is_free":false,
      "controller_support":"full","dlc":[2138330,"2786000"],
      "about_the_game":"<h1>About</h1><p class=\"bb_paragraph\">Night City.</p>",
      "short_description":"An open-world RPG.",
      "supported_languages":"English<strong>*</strong>, Polish<strong>*</strong>, Ukrainian<br><strong>*</strong>languages with full audio support",
      "header_image":"https://cdn.example/header.jpg",
      "pc_requirements":{"minimum":"<strong>Minimum:</strong><br><ul class=\"bb_ul\"><li><strong>OS:</strong> 64-bit Windows 10<br></li><li><strong>Memory:</strong> 12 GB RAM<br></li></ul>"},
      "mac_requirements":[],
      "developers":["CD PROJEKT RED"],"publishers":["CD PROJEKT RED"],
      "price_overview":{"currency":"USD","initial":5999,"final":2999,"discount_percent":50},
      "platforms":{"windows":true,"mac":false,"linux":false},
      "metacritic":{"score":86},
      "categories":[{"id":2,"description":"Single-player"},{"id":23,"description":"Steam Cloud"}],
      "genres":[{"id":"3","description":"RPG"}],
      "screenshots":[{"id":0,"path_thumbnail":"https://cdn.example/ss.600x338.jpg","path_full":"https://cdn.example/ss.1920x1080.jpg"}],
      "movies":[{"id":257082775,"name":"Trailer","thumbnail":"https://cdn.example/movie.jpg","hls_h264":"https://video.example/hls.m3u8","dash_h264":"https://video.example/dash.mpd","highlight":true},
                {"id":1,"name":"Broken","thumbnail":"https://cdn.example/x.jpg"}],
      "recommendations":{"total":812345},
      "release_date":{"coming_soon":false,"date":"Dec 9, 2020"},
      "content_descriptors":{"ids":[1,5],"notes":"Violence"},
      "ratings":{"pegi":{"rating":"18"},"esrb":{"rating":"m"}}
    }}}
    """;

    [Fact]
    public void Parses_app_details()
    {
        using var doc = JsonDocument.Parse(AppJson);
        var app = SteamStoreClient.Parse("1091500", doc.RootElement);

        Assert.NotNull(app);
        Assert.Equal("game", app.Type);
        Assert.Equal("Cyberpunk 2077", app.Name);
        Assert.Equal(17, app.RequiredAge);
        Assert.Equal(5999, app.PriceInitialCents);
        Assert.Equal("USD", app.PriceCurrency);
        Assert.True(app.Windows);
        Assert.False(app.Mac);
        Assert.Equal(86, app.MetacriticScore);
        Assert.Equal(["Single-player", "Steam Cloud"], app.Categories);
        Assert.Equal(["RPG"], app.Genres);
        Assert.Single(app.Screenshots);
        // Трейлер без потока (ни HLS, ни DASH) проигрывать нечем — не берём.
        var movie = Assert.Single(app.Movies);
        Assert.Equal("https://video.example/hls.m3u8", movie.HlsUrl);
        Assert.Equal("Dec 9, 2020", app.ReleaseDateText);
        Assert.False(app.ComingSoon);
        Assert.Equal([1, 5], app.ContentDescriptorIds);
        Assert.Equal("18", app.PegiRating);
        Assert.Equal(["2138330", "2786000"], app.DlcAppIds);
        Assert.Contains("12 GB RAM", app.PcRequirementsMinimumHtml);
        Assert.Null(app.PcRequirementsRecommendedHtml);
        Assert.Null(app.FullGameAppId);
    }

    [Fact]
    public void Dlc_knows_its_game()
    {
        using var doc = JsonDocument.Parse("""{"593380":{"success":true,"data":{"type":"dlc","name":"XCOM 2: War of the Chosen","fullgame":{"appid":"268500","name":"XCOM 2"}}}}""");
        Assert.Equal("268500", SteamStoreClient.Parse("593380", doc.RootElement)!.FullGameAppId);
    }

    [Fact]
    public void Dlc_list_has_prices_in_dollars_and_free_ones_without_price()
    {
        using var doc = JsonDocument.Parse("""
            {"status":1,"appid":268500,"name":"XCOM 2","dlc":[
              {"id":593380,"name":"War of the Chosen","price_overview":{"currency":"USD","initial":3999,"final":799,"discount_percent":80}},
              {"id":1,"name":"Free skin"},
              {"name":"broken"}]}
            """);

        var list = SteamStoreClient.ParseDlcList(doc.RootElement)!;

        Assert.Equal(2, list.Count);
        Assert.Equal(new SteamDlcListing("593380", "War of the Chosen", 3999, "USD"), list[0]);
        Assert.Null(list[1].PriceInitialCents);
        Assert.Null(SteamStoreClient.ParseDlcList(JsonDocument.Parse("""{"status":2}""").RootElement));
    }

    [Fact]
    public void Dlc_import_takes_paid_ones_above_the_threshold_most_expensive_first()
    {
        var listing = new[]
        {
            new SteamDlcListing("1", "Skin", 199, "USD"),
            new SteamDlcListing("2", "Expansion", 3999, "USD"),
            new SteamDlcListing("3", "Free", null, null),
            new SteamDlcListing("4", "Season pass", 4999, "USD"),
            new SteamDlcListing("5", "Euro only", 2999, "EUR"),
        };

        Assert.Equal(["4", "2", "1"], SteamDlcCli.Pick(listing, 1).Select(d => d.AppId));
        Assert.Equal(["4", "2"], SteamDlcCli.Pick(listing, 1000).Select(d => d.AppId));
    }

    [Fact]
    public void Unavailable_app_is_null()
    {
        using var doc = JsonDocument.Parse("""{"42":{"success":false}}""");
        Assert.Null(SteamStoreClient.Parse("42", doc.RootElement));
    }

    [Fact]
    public void Description_becomes_markdown()
    {
        const string html = """
            <h1>Story</h1><p class="bb_paragraph">Become a <strong>cyberpunk</strong>, an <i>urban</i> mercenary.<br>Second line.</p>
            <ul class="bb_ul"><li>Open world</li><li><b>Choices</b> matter</li></ul>
            <p class="bb_paragraph"><span class="bb_img_ctn"><img class="bb_img" src="https://cdn.example/a.gif"></span></p>
            <p class="bb_paragraph"><span class="bb_img_ctn"><video class="bb_img" autoplay poster="https://cdn.example/a.poster.avif"><source src="https://cdn.example/a.webm"></video></span></p>
            <p>See <a href="https://steamcommunity.com/linkfilter/?u=https%3A%2F%2Fexample.com%2Fpage">the site</a> &amp; more.</p>
            """;

        var md = SteamHtml.ToMarkdown(html);

        Assert.Contains("## Story", md);
        Assert.Contains("Become a **cyberpunk**, an *urban* mercenary.\nSecond line.", md);
        Assert.Contains("- Open world\n- **Choices** matter", md);
        Assert.Contains("![](https://cdn.example/a.gif)", md);
        Assert.Contains("![](https://cdn.example/a.poster.avif)", md);
        Assert.DoesNotContain("webm", md);
        // Вместо видео-вставки — её постер (если он есть).
        Assert.Contains("See [the site](https://example.com/page) & more.", md);
        Assert.DoesNotContain("\n\n\n", md);
    }

    [Fact]
    public void Requirements_become_label_value_pairs()
    {
        const string html = "<strong>Minimum:</strong><br><ul class=\"bb_ul\"><li>Requires a 64-bit processor and operating system<br></li><li><strong>OS:</strong> 64-bit Windows 10<br></li><li><strong>Processor:</strong> Core i7-6700 or Ryzen 5 1600<br></li><li><strong>Additional Notes:</strong> SSD required.</li></ul>";

        var req = SteamHtml.ParseRequirements(html);

        Assert.Equal(new KeyValuePair<string, string>("", "Requires a 64-bit processor and operating system"), req[0]);
        Assert.Equal(new KeyValuePair<string, string>("OS", "64-bit Windows 10"), req[1]);
        Assert.Equal(new KeyValuePair<string, string>("Processor", "Core i7-6700 or Ryzen 5 1600"), req[2]);
        Assert.Equal(new KeyValuePair<string, string>("Additional Notes", "SSD required."), req[3]);
    }

    [Fact]
    public void Old_requirements_without_list_are_parsed_by_lines()
    {
        var req = SteamHtml.ParseRequirements("<strong>Minimum:</strong><br>OS: Windows XP<br>Memory: 512 MB RAM");

        Assert.Equal(new KeyValuePair<string, string>("OS", "Windows XP"), req[0]);
        Assert.Equal(new KeyValuePair<string, string>("Memory", "512 MB RAM"), req[1]);
    }

    [Fact]
    public void Languages_with_full_audio_marker()
    {
        var langs = SteamHtml.ParseLanguages("English<strong>*</strong>, Spanish - Spain, Russian<strong>*</strong><br><strong>*</strong>languages with full audio support");

        Assert.Equal(
            [new SteamLanguage("English", true), new SteamLanguage("Spanish - Spain", false), new SteamLanguage("Russian", true)],
            langs);
    }

    [Fact]
    public void Asset_urls_include_hashed_folders()
    {
        using var doc = JsonDocument.Parse("""
            {"response":{"store_items":[{"appid":3669870,"assets":{
              "asset_url_format":"steam/apps/3669870/${FILENAME}?t=1790673363",
              "main_capsule_2x":"d2c7/capsule_616x353_2x.jpg","library_hero":"6800/library_hero.jpg",
              "community_icon":"f9f541b67c42","page_background_path":"app/3669870?t=1"}}]}}
            """);

        var assets = SteamStoreClient.ParseAssets(doc.RootElement);

        Assert.NotNull(assets);
        Assert.Equal("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3669870/6800/library_hero.jpg?t=1790673363", assets.Get("library_hero"));
        Assert.NotNull(assets.Get("main_capsule_2x"));
        // Иконка сообщества — хеш без файла, не адрес.
        Assert.Null(assets.Get("community_icon"));
        Assert.Null(assets.Get("page_background_path"));
    }
}
