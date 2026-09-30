using System.Security.Claims;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Services;

namespace SuperBot.WebApi.Services;

/// <summary>
/// Покупатель Stripe для вошедшего пользователя. Один на человека: к нему привязываются карты, сохранённые и в
/// кабинете (Billing → Add method), и на кассе (галочка «сохранить» в форме карты). Заводится лениво — только там,
/// где карта действительно привязывается, а не при каждом показе кабинета.
/// </summary>
public interface IBillingCustomers
{
    /// <summary>Идентификатор покупателя Stripe; профиль биллинга и покупатель создаются при первом обращении.</summary>
    Task<string> EnsureStripeCustomerAsync(ClaimsPrincipal user);
}

public class BillingCustomers : IBillingCustomers
{
    private readonly IBillingProfileRepository _profiles;
    private readonly IStripeCustomerGateway _stripe;

    public BillingCustomers(IBillingProfileRepository profiles, IStripeCustomerGateway stripe)
    {
        _profiles = profiles;
        _stripe = stripe;
    }

    /// <summary>
    /// Ключ профиля биллинга: sub из Keycloak, дальше запасные варианты. Именно этот порядок использует кабинет
    /// (BillingController) — касса должна попадать в тот же профиль, иначе у человека будет два покупателя Stripe
    /// и карты с кассы не появятся в кабинете.
    /// </summary>
    public static string ProfileKey(ClaimsPrincipal user) =>
        user.FindFirst("sub")?.Value
        ?? user.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? user.FindFirst("email")?.Value
        ?? user.FindFirst(ClaimTypes.Email)?.Value
        ?? user.FindFirst("preferred_username")?.Value
        ?? string.Empty;

    public static string Email(ClaimsPrincipal user) =>
        user.FindFirst("email")?.Value ?? user.FindFirst(ClaimTypes.Email)?.Value ?? string.Empty;

    public static string DisplayName(ClaimsPrincipal user) =>
        user.FindFirst("name")?.Value ?? user.FindFirst("preferred_username")?.Value ?? Email(user);

    public async Task<string> EnsureStripeCustomerAsync(ClaimsPrincipal user)
    {
        var userId = ProfileKey(user);
        if (string.IsNullOrWhiteSpace(userId))
        {
            throw new InvalidOperationException("Cannot create a Stripe customer for an anonymous user.");
        }

        var profile = await _profiles.GetByUserIdAsync(userId) ?? new BillingProfile
        {
            UserId = userId,
            DisplayName = DisplayName(user),
            Email = Email(user),
            HideOwnedGamesInProfile = false
        };

        if (!string.IsNullOrWhiteSpace(profile.StripeCustomerId))
        {
            return profile.StripeCustomerId;
        }

        // Ключ идемпотентности от id пользователя: если ответ Stripe потеряется или запись профиля не пройдёт,
        // повтор вернёт того же покупателя, а не заведёт второго. Тот же ключ, что и в кабинете.
        profile.StripeCustomerId = await _stripe.CreateCustomerAsync(
            string.IsNullOrWhiteSpace(profile.Email) ? Email(user) : profile.Email,
            string.IsNullOrWhiteSpace(profile.DisplayName) ? DisplayName(user) : profile.DisplayName,
            $"billing-customer:{userId}");
        await _profiles.UpsertAsync(profile);
        return profile.StripeCustomerId;
    }
}
