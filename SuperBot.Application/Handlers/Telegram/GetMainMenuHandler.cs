using MediatR;
using SuperBot.Application.Commands.Telegram;
using SuperBot.Application.Handlers.Telegram.Base;
using SuperBot.Core.Interfaces;
using System.Text;
using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;
using Telegram.Bot.Types.ReplyMarkups;

namespace SuperBot.Application.Handlers.Telegram
{
    public class GetMainMenuHandler(ITelegramBotClient _botClient, ITranslationsService _translationsService, IMediator _mediator, IUrlService _urlService) : DialogCommandHandler<GetMainMenuCommand>(_mediator, _translationsService), IRequestHandler<GetMainMenuCommand, Message>
    {
        public async Task<Message> Handle(GetMainMenuCommand request, CancellationToken cancellationToken)
        {
            await SendToChangeDialogStateAsync(request.ChatId);

            return await _botClient.SendTextMessageAsync(
                chatId: request.ChatId,
                text: GetMenuText(),
                parseMode: ParseMode.Html,
                replyMarkup: GetKeyboard(request.ChatId),
                cancellationToken: cancellationToken);
        }

        public string GetMenuText()
        {
            var stringBuilder = new StringBuilder();
            stringBuilder.AppendLine($"<b><u>{_translationsService.Translation.BotMenu}</u></b>");
            stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.BuySteamGames, _translationsService.Translation.BuySteamGames));
            stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.Account, _translationsService.Translation.Account));
            stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.ReferralProgram, _translationsService.Translation.ReferralProgram));
            stringBuilder.AppendLine(GetFormat(_translationsService.KeyboardKeys.Store, _translationsService.Translation.Store));
            return stringBuilder.ToString();
        }

        private string GetFormat(string commandKey, string commandValue)
        {
            return $"{commandKey} - {commandValue}";
        }

        private InlineKeyboardMarkup GetKeyboard(long chatId)
        {
            var inlineKeyboard = new List<List<InlineKeyboardButton>>();

            var mainUrl = _urlService.MainUrl ?? string.Empty;
            var buttons = new List<InlineKeyboardButton>
            {
                InlineKeyboardButton.WithCallbackData(_translationsService.Translation.BuySteamGames, _translationsService.KeyboardKeys.BuySteamGames),
                InlineKeyboardButton.WithCallbackData(_translationsService.Translation.Account, _translationsService.KeyboardKeys.Account),
                InlineKeyboardButton.WithCallbackData(_translationsService.Translation.ReferralProgram, _translationsService.KeyboardKeys.ReferralProgram),
            };

            // Магазин — прямая ссылка на сайт. Telegram отвергает URL-кнопки с localhost/невалидным
            // хостом ("Wrong HTTP URL") и роняет ВСЁ меню, поэтому добавляем её только для публичного адреса.
            if (IsPublicWebUrl(mainUrl))
            {
                buttons.Add(InlineKeyboardButton.WithUrl(_translationsService.Translation.Store, mainUrl));

                // Mini App открывается только по HTTPS (требование Telegram) — на локалке кнопку не добавляем.
                if (mainUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                {
                    buttons.Add(InlineKeyboardButton.WithWebApp("🎮 Mini App", new WebAppInfo { Url = $"{mainUrl.TrimEnd('/')}/tg" }));
                }
            }

            // Разбиваем на строки по 2 кнопки в каждой
            for (int i = 0; i < buttons.Count; i += 2)
            {
                var row = new List<InlineKeyboardButton>();

                // Добавляем первую кнопку в строке
                row.Add(buttons[i]);

                // Добавляем вторую кнопку в строке, если есть
                if (i + 1 < buttons.Count)
                {
                    row.Add(buttons[i + 1]);
                }

                // Добавляем строку с двумя кнопками в клавиатуру
                inlineKeyboard.Add(row);
            }

            // Создаем клавиатуру
            return new InlineKeyboardMarkup(inlineKeyboard);
        }

        // Кнопку-ссылку Telegram принимает только для публичного http(s)-хоста.
        // localhost/127.0.0.1/*.local и пустой/кривой URL отсекаем, иначе SendMessage падает и меню не приходит.
        private static bool IsPublicWebUrl(string url)
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
                return false;

            if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
                return false;

            var host = uri.Host;
            return !host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
                && !host.Equals("127.0.0.1")
                && !host.Equals("::1")
                && !host.EndsWith(".local", StringComparison.OrdinalIgnoreCase);
        }
    }
}
