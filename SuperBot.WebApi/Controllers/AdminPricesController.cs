using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Payments;
using SuperBot.Infrastructure.Services;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Прайс-лист магазина одной таблицей: игра × валюта. Для каждой ячейки — действующая цена и
/// откуда она: ручная (из прайс-листа игры), по курсу (пересчёт от базовой с наценкой и
/// округлением) или «не продаётся». Правка в ячейке — ручная цена; пустая ячейка — снять
/// ручную и вернуться к курсу (или к «не продаётся», если курса нет).
///
/// Раньше цены по валютам правились только в форме игры в Catalog, по одной, без обзора —
/// «в какой валюте что почём» было не увидеть.
/// </summary>
[ApiController]
[Route("api/admin/prices")]
[Authorize(Roles = "admin")]
public class AdminPricesController : ControllerBase
{
    private readonly IGameRepository _games;
    private readonly IFxRateService _fxRates;
    private readonly StorefrontCurrencyOptions _currencies;
    private readonly FxOptions _fx;

    public AdminPricesController(
        IGameRepository games,
        IFxRateService fxRates,
        IOptions<StorefrontCurrencyOptions> currencies,
        IOptionsSnapshot<FxOptions> fx)
    {
        _games = games;
        _fxRates = fxRates;
        _currencies = currencies.Value;
        _fx = fx.Value;
    }

    /// <summary>
    /// Окно строк прайс-листа. Каталог растёт, а таблица тянет строки по мере прокрутки —
    /// поэтому отдаём кусок, отсортированный и отфильтрованный базой, плюс общее число строк
    /// (по нему таблица знает длину полосы прокрутки).
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery] string? q = null,
        [FromQuery] int skip = 0,
        [FromQuery] int take = 50,
        [FromQuery] bool onlyManual = false)
    {
        var book = _fxRates.Current();
        var currencies = _currencies.Supported();
        var baseCurrency = _currencies.Base;

        var (games, total) = await _games.GetPageAsync(
            string.IsNullOrWhiteSpace(q) ? null : q.Trim(),
            onlyIds: null,
            excludeIds: null,
            sortBy: "title",
            descending: false,
            skip: skip < 0 ? 0 : skip,
            take: take,
            onlyWithManualPrices: onlyManual);

        var rows = games
            .Where(g => !string.IsNullOrWhiteSpace(g.Id))
            .Select(g => new
            {
                gameId = g.Id,
                title = string.IsNullOrWhiteSpace(g.Title) ? g.Name : g.Title,
                baseCurrency = GamePricing.BaseCurrency(g),
                basePrice = g.Price,
                cells = currencies.ToDictionary(code => code, code => Cell(g, code, book), StringComparer.OrdinalIgnoreCase)
            })
            .ToList();

        return Ok(new
        {
            baseCurrency,
            currencies,
            markupPercent = _fx.MarkupPercent,
            rates = currencies
                .Where(c => !string.Equals(c, baseCurrency, StringComparison.OrdinalIgnoreCase))
                .ToDictionary(c => c, c => book.For(c)?.Rate, StringComparer.OrdinalIgnoreCase),
            games = rows,
            total,
            summary = skip == 0 ? await SummaryAsync(currencies, book) : null
        });
    }

    /// <summary>
    /// Ручные цены одной игры. Нужны форме каталога: она правит игру целиком, и без этих
    /// значений слала бы пустой прайс-лист, затирая цены, выставленные здесь.
    /// </summary>
    [HttpGet("{gameId}")]
    public async Task<IActionResult> GetForGame(string gameId)
    {
        var game = await _games.GetByIdAsync(gameId);
        if (game is null)
        {
            return NotFound();
        }

        return Ok(new
        {
            gameId = game.Id,
            baseCurrency = GamePricing.BaseCurrency(game),
            basePrice = game.Price,
            // Всегда объект, пусть и пустой: null заставил бы каждого клиента городить проверку.
            prices = game.Prices ?? new Dictionary<string, decimal>()
        });
    }

    /// <summary>Ручная цена игры в валюте. price = null — снять ручную (вернуться к курсу).</summary>
    [HttpPut("{gameId}/{currency}")]
    public async Task<IActionResult> Put(string gameId, string currency, [FromBody] SetPriceRequest request)
    {
        var code = (currency ?? string.Empty).Trim().ToUpperInvariant();
        if (!_currencies.Supported().Contains(code, StringComparer.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = $"{code} is not a storefront currency." });
        }
        if (request?.Price is < 0)
        {
            return BadRequest(new { message = "Price cannot be negative." });
        }

        var game = await _games.GetByIdAsync(gameId);
        if (game is null)
        {
            return NotFound();
        }

        if (string.Equals(code, GamePricing.BaseCurrency(game), StringComparison.OrdinalIgnoreCase))
        {
            // Базовая цена — поле Price, а не прайс-лист; null здесь смысла не имеет.
            if (request?.Price is null)
            {
                return BadRequest(new { message = "Base price cannot be cleared — set a number." });
            }
            game.Price = request.Price.Value;
        }
        else
        {
            var prices = new Dictionary<string, decimal>(game.Prices ?? new Dictionary<string, decimal>(), StringComparer.OrdinalIgnoreCase);
            if (request?.Price is null)
            {
                prices.Remove(code);
            }
            else
            {
                prices[code] = request.Price.Value;
            }
            game.Prices = prices.Count == 0 ? null : prices;
        }

        await _games.UpdateAsync(gameId, game);
        return Ok(new { gameId, currency = code, cell = Cell(game, code, _fxRates.Current()) });
    }

    /// <summary>
    /// Сводка по всему каталогу: в скольких играх валюта продаётся, где цена выставлена рукой,
    /// а где её нет вовсе. Считается по всем играм, а не по видимому окну — иначе «5 без цены»
    /// означало бы «пять в этих пятидесяти строках», что хуже, чем не показывать ничего.
    /// Считаем только для первого окна: при прокрутке цифры не меняются.
    /// </summary>
    private async Task<object> SummaryAsync(IReadOnlyList<string> currencies, FxRateBook book)
    {
        var all = (await _games.GetAllAsync()).Where(g => !string.IsNullOrWhiteSpace(g.Id)).ToList();

        return new
        {
            total = all.Count,
            perCurrency = currencies.Select(code =>
            {
                var sold = 0;
                var manual = 0;
                foreach (var game in all)
                {
                    var (price, source) = CellOf(game, code, book);
                    if (price is not null)
                    {
                        sold++;
                    }
                    if (source == "manual")
                    {
                        manual++;
                    }
                }

                return new { currency = code, sold, manual, missing = all.Count - sold };
            }).ToList()
        };
    }

    /// <summary>Действующая цена игры в валюте и откуда она взялась.</summary>
    private (decimal? Price, string Source) CellOf(SuperBot.Core.Entities.Game game, string currency, FxRateBook book)
    {
        var baseCurrency = GamePricing.BaseCurrency(game);
        if (string.Equals(currency, baseCurrency, StringComparison.OrdinalIgnoreCase))
        {
            return (game.Price, "base");
        }

        var manual = GamePricing.TryGetPrice(game, currency);
        if (manual is not null)
        {
            return (manual, "manual");
        }

        var byRate = GamePricing.TryGetPrice(game, currency, book, _fx);
        return byRate is null ? (null, "none") : (byRate, "rate");
    }

    private object Cell(SuperBot.Core.Entities.Game game, string currency, FxRateBook book)
    {
        var baseCurrency = GamePricing.BaseCurrency(game);
        if (string.Equals(currency, baseCurrency, StringComparison.OrdinalIgnoreCase))
        {
            return new { price = game.Price, source = "base", manual = game.Price };
        }

        var manual = GamePricing.TryGetPrice(game, currency);
        if (manual is not null)
        {
            return new { price = manual, source = "manual", manual };
        }

        var byRate = GamePricing.TryGetPrice(game, currency, book, _fx);
        return byRate is null
            ? new { price = (decimal?)null, source = "none", manual = (decimal?)null }
            : new { price = byRate, source = "rate", manual = (decimal?)null };
    }
}

public class SetPriceRequest
{
    public decimal? Price { get; set; }
}
