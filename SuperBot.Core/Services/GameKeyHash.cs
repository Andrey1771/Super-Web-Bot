using System.Security.Cryptography;
using System.Text;

namespace SuperBot.Core.Services
{
    /// <summary>
    /// Детерминированный хеш ключа для дедупа и истории: SHA-256(trim(key)) в нижнем hex.
    /// ОДНА реализация на весь проект — репозиторий и инициализатор БД обязаны считать одинаково,
    /// иначе уникальный индекс (GameId, KeyHash) и проверка дублей разъедутся.
    ///
    /// Ключи высокоэнтропийны (длинные случайные строки), поэтому обычного SHA-256 без соли
    /// достаточно: хеш нужен для сравнения «этот ключ уже был», а не для парольной защиты.
    /// Регистр значим (ключи регистрозависимы) — нормализуем только trim, без ToLower.
    /// </summary>
    public static class GameKeyHash
    {
        public static string Compute(string? key)
        {
            var normalized = (key ?? string.Empty).Trim();
            var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(normalized));
            return Convert.ToHexString(bytes).ToLowerInvariant();
        }
    }
}
