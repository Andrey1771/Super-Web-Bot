using Microsoft.Extensions.Logging;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using Telegram.Bot;
using Telegram.Bot.Types.Enums;
using Telegram.Bot.Types.ReplyMarkups;

namespace SuperBot.Infrastructure.Services
{
    public class WishlistDiscountAlertService(
        IWishlistRepository _wishlistRepository,
        ITelegramLinkRepository _linkRepository,
        IGameRepository _gameRepository,
        IGameDiscountRepository _discountRepository,
        ITelegramBotClient _bot,
        ITranslationsService _translationsService,
        IUrlService _urlService,
        ILogger<WishlistDiscountAlertService> _logger) : IWishlistDiscountAlertService
    {
        public async Task NotifyGameDiscountAsync(string gameId)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(gameId))
                {
                    return;
                }

                var discount = await _discountRepository.GetByGameIdAsync(gameId);
                if (discount == null || !discount.IsActiveAt(DateTime.UtcNow))
                {
                    return; // скидки нет / не активна — алерты не шлём
                }

                var game = await _gameRepository.GetByIdAsync(gameId);
                if (game == null)
                {
                    return;
                }

                var wishlisters = await _wishlistRepository.GetUserIdsByGameAsync(gameId);
                if (wishlisters.Count == 0)
                {
                    return;
                }

                var oldPrice = game.Price;
                var newPrice = SuperBot.Core.Services.PriceCalculator.FinalPrice(oldPrice, discount.DiscountPercent);
                var gameUrl = $"{_urlService.MainUrl?.TrimEnd('/')}/games/{game.Slug}";
                var template = _translationsService.Translation.WishlistDiscountAlert;
                var text = string.IsNullOrWhiteSpace(template)
                    ? $"🔥 <b>{game.Title}</b> — скидка {discount.DiscountPercent:0.#}%!\n<s>${oldPrice:0.00}</s> → <b>${newPrice:0.00}</b>"
                    : string.Format(template, game.Title, $"{discount.DiscountPercent:0.#}", $"${oldPrice:0.00}", $"${newPrice:0.00}");

                var keyboard = new InlineKeyboardMarkup(
                    InlineKeyboardButton.WithUrl(_translationsService.Translation.Store ?? "Store", gameUrl));

                // Один пользователь мог попасть в список под несколькими алиасами — дедуп по чату.
                var notifiedChats = new HashSet<long>();
                foreach (var alias in wishlisters)
                {
                    var link = await _linkRepository.GetForUserAsync(new[] { alias });
                    if (link == null || !notifiedChats.Add(link.ChatId))
                    {
                        continue;
                    }

                    try
                    {
                        await _bot.SendTextMessageAsync(link.ChatId, text, parseMode: ParseMode.Html, replyMarkup: keyboard);
                    }
                    catch (Exception sendError)
                    {
                        _logger.LogWarning(sendError, "Wishlist discount alert failed for chat {ChatId}", link.ChatId);
                    }
                }

                if (notifiedChats.Count > 0)
                {
                    _logger.LogInformation("Wishlist discount alerts sent: game {GameId}, chats {Count}", gameId, notifiedChats.Count);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Wishlist discount alert pipeline failed for game {GameId}", gameId);
            }
        }
    }
}
