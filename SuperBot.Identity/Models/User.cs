using MongoDB.Bson;

namespace SuperBot.Identity.Models
{
    public class User
    {
        public ObjectId Id { get; set; }
        public string Username { get; set; }
        public string PasswordHash { get; set; }
    }
}
