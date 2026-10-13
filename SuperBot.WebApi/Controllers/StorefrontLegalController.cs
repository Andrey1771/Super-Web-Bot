using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SuperBot.WebApi.Services;
using SuperBot.WebApi.Services.SiteSettings;

namespace SuperBot.WebApi.Controllers;

/// <summary>
/// Реквизиты продавца для юридических документов витрины.
///
/// Отдаём с сервера, а не держим в коде фронта: сменить название юрлица, адрес или срок
/// хранения данных должно быть настройкой, а не пересборкой сайта. Значения публичные по
/// своей природе — их и печатают в условиях продажи, — поэтому эндпоинт открыт всем.
/// </summary>
[ApiController]
[Route("api/storefront/legal")]
public class StorefrontLegalController : ControllerBase
{
    private readonly LegalOptions _legal;

    public StorefrontLegalController(IOptionsSnapshot<LegalOptions> legal)
    {
        _legal = legal.Value;
    }

    /// <summary>
    /// Тексты — на языке покупателя (Accept-Language = язык сайта), поэтому кэш ответа различает
    /// заголовок: иначе русскому прилетел бы английский ответ, закэшированный для соседа.
    /// </summary>
    [AllowAnonymous]
    [HttpGet]
    [ResponseCache(Duration = 300, Location = ResponseCacheLocation.Any, VaryByHeader = "Accept-Language")]
    public ActionResult Get()
    {
        var language = BuyerLanguage.Resolve(Request);
        string T(string field, string english) => _legal.Text(field, english, language);
        return Ok(new
        {
            entity = _legal.Entity,
            registrationCountry = T(nameof(_legal.RegistrationCountry), _legal.RegistrationCountry),
            registrationNumber = _legal.RegistrationNumber,
            address = _legal.Address,
            supportEmail = _legal.SupportEmail,
            privacyEmail = _legal.PrivacyEmail,
            governingLawCountry = T(nameof(_legal.GoverningLawCountry), _legal.GoverningLawCountry),
            disputeForum = T(nameof(_legal.DisputeForum), _legal.DisputeForum),
            withdrawalWording = T(nameof(_legal.WithdrawalWording), _legal.WithdrawalWording),
            liabilityLimits = T(nameof(_legal.LiabilityLimits), _legal.LiabilityLimits),
            dataProtectionOfficer = T(nameof(_legal.DataProtectionOfficer), _legal.DataProtectionOfficer),
            supervisoryAuthority = T(nameof(_legal.SupervisoryAuthority), _legal.SupervisoryAuthority),
            dataRequestDays = _legal.DataRequestDays,
            paymentProvider = T(nameof(_legal.PaymentProvider), _legal.PaymentProvider),
            identityProvider = T(nameof(_legal.IdentityProvider), _legal.IdentityProvider),
            emailProvider = T(nameof(_legal.EmailProvider), _legal.EmailProvider),
            hostingProvider = T(nameof(_legal.HostingProvider), _legal.HostingProvider),
            dataTransfers = T(nameof(_legal.DataTransfers), _legal.DataTransfers),
            orderRetention = T(nameof(_legal.OrderRetention), _legal.OrderRetention),
            accountRetention = T(nameof(_legal.AccountRetention), _legal.AccountRetention),
            supportRetention = T(nameof(_legal.SupportRetention), _legal.SupportRetention),
            analyticsRetention = T(nameof(_legal.AnalyticsRetention), _legal.AnalyticsRetention),
            effectiveDate = T(nameof(_legal.EffectiveDate), _legal.EffectiveDate),
            // Витрина всё равно перепроверит заполненность сама: пометка нужна и тогда, когда
            // поля на месте, но текст ещё не смотрел юрист.
            draft = _legal.Draft
        });
    }
}
