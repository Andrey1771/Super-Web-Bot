using MediatR;
using Microsoft.Extensions.Configuration;
using SuperBot.Core.Interfaces;
using Telegram.Bot.Types;
using Telegram.Bot;
using Telegram.Bot.Types.Enums;
using Telegram.Bot.Types.ReplyMarkups;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Payments;
using Microsoft.Extensions.DependencyInjection;
using SuperBot.Application.Commands.BuyGame;
using SuperBot.Application.Handlers.Telegram.Base;
using System.Net;
using System.Text;

namespace SuperBot.Application.Handlers.Telegram.BuyGame
{
    public class BuyGameHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IServiceProvider _serviceProvider, IMediator _mediator, IUrlService _urlService, IConfiguration _configuration) : DialogCommandHandler<BuyGameCommand>(_mediator, _translationsService), IRequestHandler<BuyGameCommand, Message>
    {
        // Карточки — с обложками, поэтому держим список коротким: несколько фото читаются, «простыня» из фото — нет.
        private const int MaxResults = 6;

        // file_id дефолтной обложки после первой загрузки: Telegram кеширует файл, повторно 1.25 МБ не шлём.
        private static string? _fallbackCoverFileId;

        public async Task<Message> Handle(BuyGameCommand request, CancellationToken cancellationToken)
        {
            using var serviceScope = _serviceProvider.GetRequiredService<IServiceScopeFactory>().CreateScope();
            var gameRepository = serviceScope.ServiceProvider.GetService(typeof(IGameRepository)) as IGameRepository;

            var chatId = request.ChatId;
            var query = (request.Text ?? string.Empty).Trim();

            // После показа результатов возвращаемся в главное меню (диалог покупки закрыт).
            await SendToChangeDialogStateAsync(chatId);

            var games = await gameRepository.GetAllAsync();
            var matches = games
                .Where(game => !string.IsNullOrWhiteSpace(game.Id) && Matches(game, query))
                .Take(MaxResults)
                .ToList();

            if (matches.Count == 0)
            {
                return await _botClient.SendTextMessageAsync(chatId, _translationsService.Translation.NotFoundGameError, cancellationToken: cancellationToken);
            }

            var starsPerUsd = _configuration.GetValue<int?>("BotPayments:StarsPerUsd") ?? StarPrice.DefaultStarsPerUsd;

            // Заголовок один раз, затем каждая игра — отдельной карточкой с обложкой.
            var header = string.Format(_translationsService.Translation.ChooseGameToBuy, query);
            var headerMessage = await _botClient.SendTextMessageAsync(
                chatId: chatId,
                text: header,
                parseMode: ParseMode.Html,
                cancellationToken: cancellationToken);

            foreach (var game in matches)
            {
                var title = string.IsNullOrWhiteSpace(game.Title) ? game.Name : game.Title;
                var siteUrl = $"{_urlService.MainUrl?.TrimEnd('/')}/cart?add={game.Id}";
                // Курсов у бот-обработчика нет, поэтому в звёздах продаём только то, что заведено
                // в долларах. Игру в другой валюте показываем без кнопки звёзд, а не по долларовой
                // ставке от евро — это была бы скидка на пустом месте.
                var stars = StarPrice.FromAmount(game.Price, game.Currency, rates: null, starsPerUsd);

                // Кнопка «купить на сайте» есть всегда, кнопка звёзд — только когда цену
                // в звёздах удалось посчитать.
                var buttons = new List<InlineKeyboardButton>
                {
                    InlineKeyboardButton.WithUrl($"🛒 {FormatPrice(game)}", siteUrl)
                };

                if (stars is not null)
                {
                    buttons.Add(InlineKeyboardButton.WithCallbackData($"⭐ {stars}", $"stars:{game.Id}"));
                }

                var keyboard = new InlineKeyboardMarkup(new[] { buttons.ToArray() });

                await SendGameCardAsync(chatId, game, BuildCaption(game, title), keyboard, cancellationToken);
            }

            return headerMessage;
        }

        // Карточка игры: обложка + подпись + кнопки. Обложки нет/битая → дефолт → в крайнем случае текст.
        private async Task SendGameCardAsync(long chatId, Core.Entities.Game game, string caption, InlineKeyboardMarkup keyboard, CancellationToken cancellationToken)
        {
            var coverUrl = GameCoverUrlResolver.ResolveCoverUrl(game.ImagePath, _urlService.MainUrl);

            try
            {
                if (GameCoverUrlResolver.IsUsablePhotoUrl(coverUrl))
                {
                    await _botClient.SendPhotoAsync(chatId, InputFile.FromUri(coverUrl!),
                        caption: caption, parseMode: ParseMode.Html, replyMarkup: keyboard, cancellationToken: cancellationToken);
                    return;
                }

                await SendFallbackCardAsync(chatId, caption, keyboard, cancellationToken);
            }
            catch
            {
                // URL-обложка недоступна/отклонена Telegram — деградируем на дефолт, затем на текст.
                try
                {
                    await SendFallbackCardAsync(chatId, caption, keyboard, cancellationToken);
                }
                catch
                {
                    await _botClient.SendTextMessageAsync(chatId, caption, parseMode: ParseMode.Html, replyMarkup: keyboard, cancellationToken: cancellationToken);
                }
            }
        }

        private async Task SendFallbackCardAsync(long chatId, string caption, InlineKeyboardMarkup keyboard, CancellationToken cancellationToken)
        {
            var cachedFileId = _fallbackCoverFileId;
            if (cachedFileId != null)
            {
                await _botClient.SendPhotoAsync(chatId, InputFile.FromFileId(cachedFileId),
                    caption: caption, parseMode: ParseMode.Html, replyMarkup: keyboard, cancellationToken: cancellationToken);
                return;
            }

            await using var stream = OpenFallbackCoverStream();
            if (stream == null)
            {
                // Дефолтной обложки в сборке нет — не падаем, отдаём текстом.
                await _botClient.SendTextMessageAsync(chatId, caption, parseMode: ParseMode.Html, replyMarkup: keyboard, cancellationToken: cancellationToken);
                return;
            }

            var sent = await _botClient.SendPhotoAsync(chatId, InputFile.FromStream(stream, "game-cover.png"),
                caption: caption, parseMode: ParseMode.Html, replyMarkup: keyboard, cancellationToken: cancellationToken);

            var fileId = sent.Photo?.OrderByDescending(photo => photo.Width).FirstOrDefault()?.FileId;
            if (!string.IsNullOrEmpty(fileId))
            {
                _fallbackCoverFileId = fileId;
            }
        }

        private static Stream? OpenFallbackCoverStream()
        {
            var assembly = typeof(BuyGameHandler).Assembly;
            var resourceName = assembly.GetManifestResourceNames()
                .FirstOrDefault(name => name.EndsWith("game-cover-fallback.png", StringComparison.OrdinalIgnoreCase));
            return resourceName == null ? null : assembly.GetManifestResourceStream(resourceName);
        }

        /// <summary>
        /// Цена с кодом валюты игры. Знак доллара здесь был зашит в шаблон — ровно тот же дефект,
        /// что чинили на витрине: игра в евро подписывалась долларом.
        /// </summary>
        private static string FormatPrice(Core.Entities.Game game) =>
            $"{game.Price:0.00} {Core.Payments.GamePricing.BaseCurrency(game)}";

        private static string BuildCaption(Core.Entities.Game game, string? title)
        {
            var builder = new StringBuilder();
            builder.Append("<b>").Append(WebUtility.HtmlEncode(title)).Append("</b>\n");
            builder.Append('$').Append(game.Price.ToString("0.00"));

            if (Core.Entities.GameTypeMapper.DescriptionsCategories.TryGetValue(game.GameType, out var genre)
                && !string.IsNullOrWhiteSpace(genre))
            {
                builder.Append(" · ").Append(WebUtility.HtmlEncode(genre));
            }

            return builder.ToString();
        }

        private static bool Matches(Core.Entities.Game game, string query)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return true; // пустой запрос — показать что-нибудь из каталога
            }

            return (game.Name?.Contains(query, StringComparison.OrdinalIgnoreCase) ?? false)
                || (game.Title?.Contains(query, StringComparison.OrdinalIgnoreCase) ?? false);
        }
    }
}
