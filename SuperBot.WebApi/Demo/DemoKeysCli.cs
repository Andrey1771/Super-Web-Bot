using System.Security.Cryptography;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Demo;

/// <summary>
/// Демо-ключи для шаблона демо-сайта: каждому товару и каждому его изданию — пачка ключей вида
/// DEMO-XXXXX-XXXXX-XXXXX, чтобы любая покупка в демо выдавала ключ. Закупочная цена — 62% цены товара,
/// поставщик «Demo supplier»: так в админке оживают маржа, стоимость склада и отчёты по закупкам.
///
///   docker compose run --rm --no-deps -e ConnectionStrings__Name=TaleShopDemo backend demo-keys [на товар, 25]
///
/// Повторный запуск доливает до нужного числа, лишнего не заводит.
/// </summary>
public static class DemoKeysCli
{
    public const string Command = "demo-keys";

    private const string KeyType = "Steam Key";
    private const decimal CostShare = 0.62m;
    private const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    public static async Task<int> RunAsync(IServiceProvider services, string[] args)
    {
        var perProduct = args.Length > 0 && int.TryParse(args[0], out var n) && n > 0 ? n : 25;
        using var scope = services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var details = scope.ServiceProvider.GetRequiredService<IGameDetailsRepository>();
        var keys = scope.ServiceProvider.GetRequiredService<IGameKeyRepository>();

        var added = 0;
        var products = await games.GetAllAsync();
        foreach (var game in products)
        {
            var card = await details.GetByGameIdAsync(game.Id!);
            var editions = card?.Editions?.Where(e => !string.IsNullOrWhiteSpace(e.Code)).ToList() ?? [];
            var targets = editions.Count > 0
                ? editions.Select(e => (Code: e.Code, Price: e.Price > 0 ? e.Price : game.Price)).ToList()
                : [(Code: (string?)null, Price: game.Price)];

            foreach (var (code, price) in targets)
            {
                var need = perProduct - await keys.CountAvailableByGameAsync(game.Id!, code);
                if (need <= 0)
                {
                    continue;
                }
                var cost = new KeyBatchCost(Math.Round(price * CostShare, 2), "USD", "Demo supplier", $"demo-{game.Slug}-{code ?? "base"}");
                var result = await keys.AddPoolKeysAsync(game.Id!, KeyType, Enumerable.Range(0, need).Select(_ => NewKey()), "demo", code, null, cost);
                added += result.Added;
            }
        }
        Console.WriteLine($"Demo keys: {added} added across {products.Count} products ({perProduct} per product and edition).");
        return 0;
    }

    private static string NewKey() =>
        "DEMO-" + string.Join("-", Enumerable.Range(0, 3).Select(_ =>
            new string(Enumerable.Range(0, 5).Select(_ => Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)]).ToArray())));
}
