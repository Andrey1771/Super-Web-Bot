using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Лимиты частоты для анонимных форм, где ответ сам по себе — ценность для атакующего:
/// проверка промокода (перебор кодов). Счёт — по адресу клиента.
///
/// Адрес — <see cref="ClientAddress"/>: X-Real-IP от нашего nginx, подменить его снаружи нельзя.
/// </summary>
public static class PublicRateLimits
{
    public const string PromoValidation = "promo-validation";

    public static IServiceCollection AddPublicRateLimits(this IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection("RateLimits");
        var promoPerMinute = section.GetValue("PromoValidationPerMinute", 10);

        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = async (context, token) =>
            {
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                {
                    context.HttpContext.Response.Headers.RetryAfter = ((int)retryAfter.TotalSeconds).ToString();
                }
                await context.HttpContext.Response.WriteAsJsonAsync(
                    ApiErrors.Body("RATE_LIMITED", "Too many attempts. Please try again in a minute."), token);
            };

            options.AddPolicy(PromoValidation, context => RateLimitPartition.GetFixedWindowLimiter(
                ClientAddress.ResolveOrUnknown(context),
                _ => new FixedWindowRateLimiterOptions { PermitLimit = promoPerMinute, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
        });
        return services;
    }
}
