using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Bson;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.Infrastructure.Data
{
    public class SteamOrderDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.String)] // Хранение Guid как строки
        public Guid Id { get; set; }
        public string Username { get; set; }
        public string SteamLogin { get; set; }
        public decimal Amount { get; set; }
        public decimal TotalAmount { get; set; }
        public bool IsPaid { get; set; }
        public string PayId { get; set; }
    }
}
