using Konscious.Security.Cryptography;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Driver;
using SuperBot.Identity.Models;
using SuperBot.Identity.Services;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace SuperBot.Identity.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly IMongoCollection<User> _users;
        private readonly EncryptionService _encryptionService;
        private readonly IConfiguration _configuration;

        public AuthController(IMongoDatabase database, IConfiguration configuration)
        {
            _users = database.GetCollection<User>("Users");
            _configuration = configuration;
            _encryptionService = new EncryptionService("8924889b-7f38-451d-8da4-842a1c2cedcd"); // Замените на свой ключ TODO
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterModel model)
        {
            var encryptedUsername = _encryptionService.Encrypt(model.Username);

            var user = new User
            {
                Username = encryptedUsername,
                PasswordHash = await HashPasswordAsync(model.Password)
            };

            await _users.InsertOneAsync(user);
            return Ok("Registration successful");
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginModel model)
        {
            var encryptedUsername = _encryptionService.Encrypt(model.Username);
            var user = await _users.Find(u => u.Username == encryptedUsername).FirstOrDefaultAsync();

            if (user == null || !await VerifyPasswordAsync(model.Password, user.PasswordHash))
                return Unauthorized("Invalid credentials");

            var tokenHandler = new JwtSecurityTokenHandler();
            var key = Encoding.ASCII.GetBytes(_configuration["JwtSettings:SecretKey"]);

            var username = _encryptionService.Decrypt(user.Username);
            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(new Claim[]
                {
                    new Claim(ClaimTypes.Name, username),
                    new Claim(ClaimTypes.Role, username == "Hohlov908.com" ? "admin" : "user"),//TODO Вынести в файл настроек
                    new Claim(ClaimTypes.NameIdentifier, user.Id.ToString())
                }),
                Expires = DateTime.UtcNow.AddHours(1),
                Issuer = _configuration["JwtSettings:Issuer"],
                Audience = _configuration["JwtSettings:Audience"],
                SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
            };
            var token = tokenHandler.CreateToken(tokenDescriptor);
            return Ok(new { Token = tokenHandler.WriteToken(token) });
        }

        private async Task<string> HashPasswordAsync(string password)
        {
            var salt = new byte[16];
            using (var rng = System.Security.Cryptography.RandomNumberGenerator.Create())
            {
                rng.GetBytes(salt);
            }
            var hasher = new Argon2id(Encoding.UTF8.GetBytes(password))
            {
                Salt = salt,
                DegreeOfParallelism = 8,
                Iterations = 4,
                MemorySize = 1024 * 16
            };
            var hash = await hasher.GetBytesAsync(16);

            // Конкатенируем соль и хэш пароля в одну строку, чтобы хранить их вместе
            var result = new byte[salt.Length + hash.Length];
            Buffer.BlockCopy(salt, 0, result, 0, salt.Length);
            Buffer.BlockCopy(hash, 0, result, salt.Length, hash.Length);

            return Convert.ToBase64String(result);
        }

        private async Task<bool> VerifyPasswordAsync(string password, string hashedPassword)
        {
            var hashBytes = Convert.FromBase64String(hashedPassword);

            // Проверка, что длина соответствует ожидаемой (16 байт для соли + 16 байт для хэша)
            if (hashBytes.Length != 32)
            {
                throw new ArgumentException("Invalid stored password format.");
            }

            // Извлекаем соль и хэш из массива
            var salt = new byte[16];
            var hash = new byte[16];
            Buffer.BlockCopy(hashBytes, 0, salt, 0, 16);
            Buffer.BlockCopy(hashBytes, 16, hash, 0, 16);

            var hasher = new Argon2id(Encoding.UTF8.GetBytes(password))
            {
                Salt = salt,
                DegreeOfParallelism = 8,
                Iterations = 4,
                MemorySize = 1024 * 16
            };
            var computedHash = await hasher.GetBytesAsync(16);

            // Сравнение computedHash с hash
            for (int i = 0; i < computedHash.Length; i++)
            {
                if (computedHash[i] != hash[i])
                    return false;
            }
            return true;
        }
    }
}
