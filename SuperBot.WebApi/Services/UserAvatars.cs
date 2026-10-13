using MongoDB.Driver;
using SuperBot.Infrastructure.Data;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Адрес аватара пользователя.
///
/// Один на весь проект: раньше сборка адреса жила приватным методом в AccountController, и
/// всякий, кому аватар нужен ещё где-то, неизбежно написал бы свою копию — вместе с меткой
/// версии, без которой браузер продолжает показывать прежнюю картинку после замены.
/// </summary>
public static class UserAvatars
{
    /// <summary>
    /// Относительный адрес: за nginx Request.Host — это внутренний backend:7002, недостижимый
    /// из браузера. Браузер разрешит путь против своего origin сам.
    ///
    /// Метка версии в запросе обязательна: файл всегда лежит по одному и тому же пути
    /// (avatar.webp), и без неё замена аватара не видна, пока не протухнет кэш.
    /// </summary>
    public static string? Build(string? avatarPath, DateTime? updatedAt)
    {
        if (string.IsNullOrWhiteSpace(avatarPath))
        {
            return null;
        }

        var version = updatedAt?.Ticks.ToString() ?? DateTime.UtcNow.Ticks.ToString();
        return $"/uploads/{avatarPath}?v={version}";
    }
}

/// <summary>
/// Аватары пачкой по списку пользователей.
///
/// Отзыв хранит только имя автора и его идентификатор; аватар берётся из профиля в момент
/// показа, а не записывается в отзыв. Так делают Steam, Amazon, Google и Trustpilot, и
/// причина простая: сменил человек аватар — обновилось везде, включая отзывы трёхлетней
/// давности; удалил — нигде не осталось мёртвой ссылки. Снимок в отзыв замораживает и
/// картинку, и метку версии, то есть ломает ровно то, ради чего метка нужна.
///
/// Запрос один на всю выдачу, а не по отзыву на штуку: страница отзывов просит до 50 за раз.
/// </summary>
public sealed class UserAvatarLookup
{
    private readonly IMongoCollection<UserDb> _users;

    public UserAvatarLookup(IMongoDatabase database)
    {
        _users = database.GetCollection<UserDb>("Users");
    }

    /// <summary>
    /// Идентификатор пользователя → адрес аватара. В словаре только те, у кого аватар есть:
    /// отсутствие ключа и есть «аватара нет», отдельного признака не нужно.
    /// </summary>
    public async Task<IReadOnlyDictionary<string, string>> ForUsersAsync(IEnumerable<string?> userIds)
    {
        var ids = userIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id!)
            .Distinct()
            .ToList();

        if (ids.Count == 0)
        {
            return new Dictionary<string, string>();
        }

        var users = await _users
            .Find(Builders<UserDb>.Filter.In(user => user.UserId, ids))
            .Project(user => new { user.UserId, user.AvatarPath, user.AvatarUpdatedAt })
            .ToListAsync();

        var result = new Dictionary<string, string>();
        foreach (var user in users)
        {
            var url = UserAvatars.Build(user.AvatarPath, user.AvatarUpdatedAt);
            if (url is not null && !string.IsNullOrWhiteSpace(user.UserId))
            {
                result[user.UserId] = url;
            }
        }

        return result;
    }
}

/// <summary>
/// Файлы аватаров и их снятие.
///
/// Раскладку папок и удаление знал только AccountController приватными методами, а снимать
/// аватар нужно ещё и модератору: жалоба на непристойную картинку приходит вместе с жалобой
/// на отзыв и разбирается там же. Две копии одной раскладки — верный способ однажды удалить
/// не ту папку, поэтому она здесь одна.
/// </summary>
public sealed class UserAvatarStore
{
    private readonly IMongoCollection<UserDb> _users;
    private readonly IWebHostEnvironment _environment;

    public UserAvatarStore(IMongoDatabase database, IWebHostEnvironment environment)
    {
        _users = database.GetCollection<UserDb>("Users");
        _environment = environment;
    }

    /// <summary>
    /// Идентификатор в имя папки: он приходит из токена, а оттуда может прийти что угодно.
    /// Всё, кроме букв, цифр, дефиса и подчёркивания, вырезается — иначе «../» в
    /// идентификаторе увёл бы удаление за пределы папки аватаров.
    /// </summary>
    public static string NormalizeUserId(string userId)
    {
        var cleaned = System.Text.RegularExpressions.Regex.Replace(userId ?? string.Empty, @"[^a-zA-Z0-9_-]", string.Empty);
        return string.IsNullOrWhiteSpace(cleaned) ? "user" : cleaned;
    }

    /// <summary>Папка аватаров пользователя; создаётся, если её ещё нет.</summary>
    public string EnsureFolder(string userId)
    {
        var webRoot = _environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        var root = Path.Combine(webRoot, "uploads", "avatars", NormalizeUserId(userId));
        if (!Directory.Exists(root))
        {
            Directory.CreateDirectory(root);
        }

        return root;
    }

    public static void DeleteAllFilesInFolder(string folder)
    {
        if (!Directory.Exists(folder))
        {
            return;
        }

        foreach (var filePath in Directory.GetFiles(folder))
        {
            File.Delete(filePath);
        }
    }

    /// <summary>
    /// Снимает аватар: удаляет файлы и очищает поля профиля. Идемпотентно — снимать нечего
    /// значит просто ничего не произошло, а не ошибка.
    /// </summary>
    /// <returns>true, если аватар был и его сняли.</returns>
    public async Task<bool> RemoveAsync(string userId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(userId))
        {
            return false;
        }

        DeleteAllFilesInFolder(EnsureFolder(userId));

        var update = Builders<UserDb>.Update
            .Set(u => u.AvatarPath, null)
            .Set(u => u.AvatarUpdatedAt, null)
            .Set(u => u.UpdatedAt, DateTime.UtcNow);

        // Без upsert: профиль у автора отзыва заведомо есть, а плодить пустые записи по
        // идентификатору из чужого запроса незачем.
        var result = await _users.UpdateOneAsync(
            u => u.UserId == userId && u.AvatarPath != null,
            update,
            cancellationToken: ct);

        return result.ModifiedCount > 0;
    }
}
