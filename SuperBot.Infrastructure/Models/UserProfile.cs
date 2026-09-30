using AutoMapper;
using SuperBot.Core.Entities;
using SuperBot.Infrastructure.Data;

namespace SuperBot.Infrastructure.Models
{
    public class UserProfile : Profile
    {
        public UserProfile()
        {
            // В коллекции Users лежат два разных вида записей: покупатели из Telegram, у которых
            // идентификатор — число, и учётки сайта, у которых там GUID из Keycloak. У сущности
            // User идентификатор числовой, и на GUID преобразование падало с FormatException —
            // разом ломая ЛЮБУЮ выборку всех пользователей, из-за чего рассылка боту отвечала
            // пятисоткой. Нечисловой идентификатор — не ошибка, а «это не пользователь бота»:
            // отдаём 0, а вызывающий код такие записи пропускает.
            CreateMap<UserDb, User>()
                .ForMember(dest => dest.UserId, opt => opt.MapFrom(src => ToTelegramId(src.UserId)));

            CreateMap<User, UserDb>()
                .ForMember(dest => dest.UserId, opt => opt.MapFrom(src => src.UserId.ToString()));
        }

        /// <summary>Идентификатор Telegram или 0, если в поле лежит что-то другое.</summary>
        private static long ToTelegramId(string? value) =>
            long.TryParse(value, out var id) ? id : 0;
    }
}
