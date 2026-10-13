using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace SuperBot.WebApi.Controllers
{
    /// <summary>
    /// Раздаёт статические ассеты для писем (логотип шапки) прямо из сборки бэкенда.
    /// Так письмо не зависит от деплоя фронта: одна пересборка backend обновляет и шаблон,
    /// и логотип. Путь под /api/* — его реверс-прокси уже направляет на бэкенд.
    /// </summary>
    [ApiController]
    [AllowAnonymous]
    [Route("api/email-assets")]
    public class EmailAssetsController : ControllerBase
    {
        // Логическое имя embedded-ресурса кончается на имя файла — не хардкодим полный путь.
        private const string LogoResourceSuffix = "email-logo.png";

        // ВАЖНО: без расширения .png в маршруте. Иначе nginx-regex для статики (~* \.png$)
        // перехватит /api/email-assets/logo.png раньше прокси /api/ и вернёт 404 (файла на фронте нет).
        // Content-Type задаём заголовком, расширение в URL не нужно.
        [HttpGet("logo")]
        public IActionResult Logo()
        {
            var assembly = typeof(EmailAssetsController).Assembly;
            var resourceName = assembly.GetManifestResourceNames()
                .FirstOrDefault(name => name.EndsWith(LogoResourceSuffix, StringComparison.OrdinalIgnoreCase));

            if (resourceName == null)
            {
                return NotFound();
            }

            var stream = assembly.GetManifestResourceStream(resourceName);
            if (stream == null)
            {
                return NotFound();
            }

            // Логотип неизменен между релизами — разрешаем клиентам/прокси кэшировать надолго.
            Response.Headers.CacheControl = "public, max-age=604800, immutable";
            return File(stream, "image/png");
        }
    }
}
