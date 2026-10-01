using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.WebApi.Tests.Infrastructure;
using Xunit;

namespace SuperBot.WebApi.Tests;

/// <summary>
/// Список желаний не держит игры, которых нет в каталоге. Раньше удалённая игра оставалась в
/// списках навсегда: счётчик «Saved items» в кабинете показывал 7, а страница — 4 игры.
/// </summary>
[Collection(IntegrationTestCollection.Name)]
public class WishlistTests
{
    private readonly TaleShopApiFactory _factory;

    public WishlistTests(TaleShopApiFactory factory) => _factory = factory;

    private HttpClient Buyer(string email)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, email);
        return client;
    }

    private HttpClient Admin()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.EmailHeader, $"admin-{Guid.NewGuid():N}@taleshop.test");
        client.DefaultRequestHeaders.Add(TestAuthHandler.RolesHeader, "admin");
        return client;
    }

    private static string NewBuyer() => $"wish-{Guid.NewGuid():N}@example.com";

    private async Task<string> SeedGameAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var games = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var id = ObjectId.GenerateNewId().ToString();
        var name = $"Wish {Guid.NewGuid():N}"[..16];
        await games.CreateAsync(new Game { Id = id, Name = name, Title = name, Price = 10m, ImagePath = "c.png", ReleaseDate = DateTime.UtcNow.AddYears(-1) });
        return id;
    }

    private static async Task<List<string>> IdsAsync(HttpClient client) =>
        await client.GetFromJsonAsync<List<string>>("/api/wishlist") ?? new List<string>();

    [Fact]
    public async Task Deleting_a_game_removes_it_from_every_wishlist()
    {
        var gameId = await SeedGameAsync();
        var first = Buyer(NewBuyer());
        var second = Buyer(NewBuyer());
        (await first.PostAsJsonAsync("/api/wishlist/items", new { gameId })).EnsureSuccessStatusCode();
        (await second.PostAsJsonAsync("/api/wishlist/items", new { gameId })).EnsureSuccessStatusCode();

        (await Admin().DeleteAsync($"/api/game/{gameId}")).EnsureSuccessStatusCode();

        using var scope = _factory.Services.CreateScope();
        var wishlists = scope.ServiceProvider.GetRequiredService<IWishlistRepository>();
        Assert.Empty(await wishlists.GetUserIdsByGameAsync(gameId));
    }

    [Fact]
    public async Task A_leftover_entry_for_a_missing_game_is_not_returned_and_gets_cleaned_up()
    {
        var buyer = NewBuyer();
        var kept = await SeedGameAsync();
        var ghost = ObjectId.GenerateNewId().ToString();
        using (var scope = _factory.Services.CreateScope())
        {
            // Так выглядели записи, оставшиеся от игр, удалённых до исправления.
            var wishlists = scope.ServiceProvider.GetRequiredService<IWishlistRepository>();
            await wishlists.AddAsync(buyer, kept);
            await wishlists.AddAsync(buyer, ghost);
        }

        Assert.Equal(new[] { kept }, await IdsAsync(Buyer(buyer)));

        using (var scope = _factory.Services.CreateScope())
        {
            var wishlists = scope.ServiceProvider.GetRequiredService<IWishlistRepository>();
            Assert.Equal(new[] { kept }, (await wishlists.GetGameIdsAsync(buyer)).ToArray());
        }
    }

    [Fact]
    public async Task A_missing_game_cannot_be_added()
    {
        var response = await Buyer(NewBuyer()).PostAsJsonAsync("/api/wishlist/items", new { gameId = ObjectId.GenerateNewId().ToString() });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Merging_a_guest_list_drops_games_that_no_longer_exist()
    {
        var kept = await SeedGameAsync();
        var ghost = ObjectId.GenerateNewId().ToString();
        var response = await Buyer(NewBuyer()).PostAsJsonAsync("/api/wishlist/merge", new { gameIds = new[] { kept, ghost } });
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<MergeResponse>();
        Assert.Equal(new[] { kept }, body!.GameIds);
    }

    private sealed record MergeResponse(List<string> GameIds);
}
