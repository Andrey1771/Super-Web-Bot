using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Bson;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SuperBot.Infrastructure.Data
{
    public class UserDb
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string Id { get; set; }

        [BsonElement("userId")]
        public string UserId { get; set; }

        [BsonElement("name")]
        public string Name { get; set; }

        [BsonElement("balance")]
        public decimal Balance { get; set; }

        [BsonElement("countOfInvited")] // Количество приглашенных пользователей
        public int CountOfInvited { get; set; }

        [BsonElement("discount")] // Скидка, доступная пользователю
        public decimal Discount { get; set; }

        [BsonElement("quantityBeforeIncrease")] // Количество покупок до увеличения скидки
        public int QuantityBeforeIncrease { get; set; }

        [BsonElement("username")]
        public string Username { get; set; }

        [BsonElement("choseSteamLogin")]
        public string ChoseSteamLogin { get; set; }

        [BsonElement("choseCard")]
        public string ChoseCard { get; set; }

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; }

        [BsonElement("updatedAt")]
        public DateTime UpdatedAt { get; set; }
    }
}