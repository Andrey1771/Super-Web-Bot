using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SuperBot.Infrastructure.Data
{
    public class GameKeyDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        public string UserId { get; set; }

        public string GameId { get; set; }

        public string Key { get; set; }

        /// <summary>SHA-256(trim(Key)) в hex — по нему уникальный индекс (GameId, KeyHash) и дедуп/история.</summary>
        public string KeyHash { get; set; }

        public string KeyType { get; set; }
        /// <summary>Издание ключа; null/пусто — базовое. Старые записи поля не имеют — это тоже «базовое».</summary>
        public string? EditionCode { get; set; }
        /// <summary>Своя политика активации партии ключей; null — политика игры.</summary>
        public SuperBot.Core.Regions.RegionPolicy? RegionPolicy { get; set; }

        public DateTime IssuedAt { get; set; }

        /// <summary>
        /// Себестоимость: за сколько ключ куплен и в какой валюте, у кого и в какой партии.
        /// Все поля необязательны — у 836 записей, заведённых до учёта расходов, их просто нет,
        /// и это читается как «закупочная цена неизвестна». Миграция поэтому не нужна, а отчёт
        /// обязан отличать «куплено за 0» от «неизвестно» — отсюда nullable, а не 0 по умолчанию.
        /// </summary>
        [BsonIgnoreIfNull]
        public decimal? UnitCost { get; set; }

        [BsonIgnoreIfNull]
        public string? CostCurrency { get; set; }

        [BsonIgnoreIfNull]
        public string? Supplier { get; set; }

        /// <summary>Идентификатор заливки: одинаковый у всех ключей одной партии.</summary>
        [BsonIgnoreIfNull]
        public string? BatchId { get; set; }

        /// <summary>Заказ, по которому ключ ушёл. Необязателен: у пуловых его нет.</summary>
        [BsonIgnoreIfNull]
        public string? OrderId { get; set; }

        /// <summary>Когда партия заведена. Дата закупки для отчёта, не путать с IssuedAt (выдача покупателю).</summary>
        [BsonIgnoreIfNull]
        public DateTime? AcquiredAtUtc { get; set; }

        public bool IsActive { get; set; }
        [BsonIgnoreIfNull]
        public string? AddedBy { get; set; }
        [BsonIgnoreIfNull]
        public string? IssuedBy { get; set; }

        /// <summary>
        /// Мягкое удаление: ключ изъят из пула, но остаётся в истории (для предупреждений при повторной заливке).
        /// У изъятого ключа plaintext стирается (Key=""), а KeyHash сохраняется. Уникальный индекс частичный —
        /// покрывает только активные (Voided=false), поэтому изъятое значение можно залить заново.
        /// </summary>
        public bool Voided { get; set; }

        public DateTime? VoidedAt { get; set; }
    }
}
