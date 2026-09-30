using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    /// <summary>
    /// Лишние поля документа не роняют чтение: настройки — один документ, который переживает удаление полей
    /// (так исчез YandexCounterId вместе с Метрикой), и без этого атрибута первое же чтение падало бы с
    /// FormatException, ломая аналитику на сайте и её страницу в админке до ручной правки базы.
    /// </summary>
    [BsonIgnoreExtraElements]
    public class AnalyticsSettingsDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.String)]
        public string Id { get; set; }
        public string GaMeasurementId { get; set; }
        public string GaPropertyId { get; set; }

        /// <summary>Секрет Measurement Protocol. Необязателен — у прежних записей поля нет.</summary>
        [BsonIgnoreIfNull]
        public string GaApiSecret { get; set; }
        public string GtmContainerId { get; set; }

        /// <summary>Доступ к чтению отчётов. Необязателен — у прежних записей полей нет.</summary>
        [BsonIgnoreIfNull]
        public string GaOauthClientId { get; set; }

        [BsonIgnoreIfNull]
        public string GaOauthClientSecret { get; set; }

        [BsonIgnoreIfNull]
        public string GaOauthRefreshToken { get; set; }

        /// <summary>Когда сохранён токен — чтобы предупредить о недельном сроке заранее.</summary>
        [BsonIgnoreIfNull]
        public DateTime? GaOauthRefreshTokenSavedAt { get; set; }

        public bool IsEnabled { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
