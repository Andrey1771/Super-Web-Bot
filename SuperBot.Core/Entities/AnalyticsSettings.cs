namespace SuperBot.Core.Entities
{
    public class AnalyticsSettings
    {
        public string Id { get; set; }
        public string GaMeasurementId { get; set; }
        public string GaPropertyId { get; set; }

        /// <summary>
        /// Секрет Measurement Protocol: им сервер отправляет покупку напрямую в GA4.
        /// Отдельный от всего остального ключ, создаётся в GA (Admin → Data Streams → Measurement Protocol).
        /// Наружу НЕ отдаётся: публичные настройки витрины его не содержат, иначе им мог бы
        /// воспользоваться кто угодно и засорить отчёты выдуманными покупками.
        /// </summary>
        public string GaApiSecret { get; set; }
        public string GtmContainerId { get; set; }

        /// <summary>
        /// Доступ на ЧТЕНИЕ отчётов через Google Analytics Data API. Три части одной учётной
        /// записи «для программы»: логин, пароль и разрешение владельца аккаунта.
        ///
        /// Область доступа — analytics.readonly, то есть только чтение статистики. Ни писать,
        /// ни трогать что-либо за пределами аналитики эти ключи не позволяют, и владелец
        /// отзывает их в настройках своего аккаунта Google в любой момент.
        ///
        /// Наружу не отдаются: в ответах API от них остаётся признак «задано» и огрызок.
        /// </summary>
        public string GaOauthClientId { get; set; }
        public string GaOauthClientSecret { get; set; }
        public string GaOauthRefreshToken { get; set; }

        /// <summary>
        /// Когда токен сохранён. Нужен ровно для одного: приложение в статусе Testing Google
        /// лишает доступа через неделю, молча. Дата даёт панели возможность предупредить до
        /// того, как отчёты отвалятся, вместо того чтобы объяснять это задним числом.
        /// </summary>
        public DateTime? GaOauthRefreshTokenSavedAt { get; set; }

        public bool IsEnabled { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
