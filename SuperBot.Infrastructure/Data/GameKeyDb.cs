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

        public DateTime IssuedAt { get; set; }

        public bool IsActive { get; set; }

        /// <summary>
        /// Мягкое удаление: ключ изъят из пула, но остаётся в истории (для предупреждений при повторной заливке).
        /// У изъятого ключа plaintext стирается (Key=""), а KeyHash сохраняется. Уникальный индекс частичный —
        /// покрывает только активные (Voided=false), поэтому изъятое значение можно залить заново.
        /// </summary>
        public bool Voided { get; set; }

        public DateTime? VoidedAt { get; set; }
    }
}
