using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Common.Auth;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.WebApi.Controllers
{
    /// <summary>
    /// «Карта удачи» (сказочное таро на главной): залогиненный пользователь раз в кулдаун
    /// тянет карту и получает НАСТОЯЩИЙ одноразовый промокод со случайным процентом.
    /// Код проходит через обычный PromoCodeService на чекауте — отдельной ценовой логики нет.
    /// </summary>
    [ApiController]
    public class TarotController : ControllerBase
    {
        /// <summary>Алфавит кода без похожих символов (0/O, 1/I) — код диктуется без ошибок.</summary>
        private const string CodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
        /// <summary>Длина случайной части кода: 6 символов из 31-буквенного алфавита ≈ 900 млн комбинаций.</summary>
        private const int CodeLength = 6;
        /// <summary>Сколько раз пробуем сгенерировать неповторяющийся код, прежде чем сдаться.</summary>
        private const int CodeGenerationAttempts = 5;
        /// <summary>Сколько последних розыгрышей сканируем для подсчёта применённых кодов.</summary>
        private const int RedeemStatsSampleSize = 200;

        /// <summary>Границы настроек из админки: от часа до месяца — дальше это уже не «карта дня».</summary>
        private const int MinSettingHours = 1;
        private const int MaxSettingDays = 30;
        private const int HoursPerDay = 24;
        private const int MaxSettingHours = MaxSettingDays * HoursPerDay;
        /// <summary>Значение по умолчанию, если админка прислала пустое поле: сутки.</summary>
        private const int DefaultCooldownHours = HoursPerDay;
        private const int DefaultCodeTtlHours = HoursPerDay;

        /// <summary>Допустимый процент скидки: строго внутри 0–100, иначе это не скидка.</summary>
        private const decimal MinTierPercent = 1m;
        private const decimal MaxTierPercent = 99m;

        /// <summary>Промокод карты удачи одноразовый — он персональный, а не публичная акция.</summary>
        private const int SingleUseLimit = 1;

        /// <summary>
        /// Код валиден с этого сдвига в прошлое: страховка от расхождения часов между
        /// сервером приложения и базой — иначе свежесозданный код может не пройти проверку.
        /// </summary>
        private static readonly TimeSpan CodeActivationBackdate = TimeSpan.FromMinutes(1);

        private readonly ITarotSettingsRepository _settingsRepository;
        private readonly ITarotDrawRepository _drawRepository;
        private readonly IPromoCodeRepository _promoCodeRepository;
        private readonly IPromoCodeUsageRepository _promoCodeUsageRepository;

        public TarotController(
            ITarotSettingsRepository settingsRepository,
            ITarotDrawRepository drawRepository,
            IPromoCodeRepository promoCodeRepository,
            IPromoCodeUsageRepository promoCodeUsageRepository)
        {
            _settingsRepository = settingsRepository;
            _drawRepository = drawRepository;
            _promoCodeRepository = promoCodeRepository;
            _promoCodeUsageRepository = promoCodeUsageRepository;
        }

        /// <summary>Состояние карты для текущего пользователя: можно ли тянуть и что уже вытянуто.</summary>
        [HttpGet("api/tarot/state")]
        [Authorize]
        public async Task<IActionResult> GetState()
        {
            var userId = User.GetUserKey();
            if (string.IsNullOrWhiteSpace(userId))
            {
                return Unauthorized();
            }

            var settings = await GetSettingsOrDefaultsAsync();
            var latest = await _drawRepository.GetLatestByUserAsync(userId);
            var utcNow = DateTime.UtcNow;
            var nextDrawAt = latest?.DrawnAt.AddHours(settings.CooldownHours);

            return Ok(new
            {
                enabled = settings.Enabled,
                canDraw = settings.Enabled && (nextDrawAt == null || nextDrawAt <= utcNow),
                nextDrawAt,
                // Действующий код показываем снова — карта «помнит» вытянутое до истечения срока.
                current = latest != null && latest.ExpiresAt > utcNow
                    ? new { code = latest.Code, percent = latest.Percent, expiresAt = latest.ExpiresAt }
                    : null
            });
        }

        [HttpPost("api/tarot/draw")]
        [Authorize]
        public async Task<IActionResult> Draw()
        {
            var userId = User.GetUserKey();
            if (string.IsNullOrWhiteSpace(userId))
            {
                return Unauthorized();
            }

            var settings = await GetSettingsOrDefaultsAsync();
            if (!settings.Enabled)
            {
                return BadRequest(new { message = "The lucky card is taking a rest — check back later." });
            }

            var utcNow = DateTime.UtcNow;
            var latest = await _drawRepository.GetLatestByUserAsync(userId);
            var nextDrawAt = latest?.DrawnAt.AddHours(settings.CooldownHours);
            if (nextDrawAt != null && nextDrawAt > utcNow)
            {
                return BadRequest(new { message = "You've already drawn your card.", nextDrawAt });
            }

            var tier = RollTier(settings.Tiers);
            var code = await GenerateUniqueCodeAsync();
            if (code == null)
            {
                return StatusCode(StatusCodes.Status500InternalServerError,
                    new { message = "Could not conjure a code — try again." });
            }

            var expiresAt = utcNow.AddHours(settings.CodeTtlHours);
            var promo = await _promoCodeRepository.CreateAsync(new PromoCode
            {
                Code = code,
                Type = PromoCodeType.Percentage,
                Value = tier.Percent,
                StartDate = utcNow - CodeActivationBackdate,
                EndDate = expiresAt,
                // Карта удачи — персональная: код сгорает после первого применения.
                UsageLimit = SingleUseLimit
            });

            await _drawRepository.CreateAsync(new TarotDraw
            {
                UserId = userId,
                Code = code,
                PromoCodeId = promo.Id,
                Percent = tier.Percent,
                DrawnAt = utcNow,
                ExpiresAt = expiresAt
            });

            return Ok(new
            {
                code,
                percent = tier.Percent,
                expiresAt,
                nextDrawAt = utcNow.AddHours(settings.CooldownHours)
            });
        }

        [HttpGet("api/admin/tarot")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> GetAdmin()
        {
            var settings = await GetSettingsOrDefaultsAsync();
            return Ok(new
            {
                settings = new
                {
                    enabled = settings.Enabled,
                    cooldownHours = settings.CooldownHours,
                    codeTtlHours = settings.CodeTtlHours,
                    tiers = settings.Tiers.Select(tier => new { percent = tier.Percent, weight = tier.Weight })
                },
                stats = await BuildStatsAsync()
            });
        }

        [HttpPut("api/admin/tarot")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> UpdateAdmin([FromBody] UpdateTarotSettingsRequest request)
        {
            var tiers = (request?.Tiers ?? new List<TarotTierRequest>())
                .Where(tier => tier.Percent >= MinTierPercent
                    && tier.Percent <= MaxTierPercent
                    && tier.Weight > 0)
                .Select(tier => new TarotLuckyTier { Percent = tier.Percent, Weight = tier.Weight })
                .ToList();
            if (tiers.Count == 0)
            {
                return BadRequest(new
                {
                    message = $"At least one valid tier is required (percent {MinTierPercent}-{MaxTierPercent}, weight > 0)."
                });
            }

            var saved = await _settingsRepository.UpsertAsync(new TarotSettings
            {
                Enabled = request?.Enabled ?? true,
                CooldownHours = Math.Clamp(
                    request?.CooldownHours ?? DefaultCooldownHours, MinSettingHours, MaxSettingHours),
                CodeTtlHours = Math.Clamp(
                    request?.CodeTtlHours ?? DefaultCodeTtlHours, MinSettingHours, MaxSettingHours),
                Tiers = tiers,
                UpdatedAt = DateTime.UtcNow
            });

            return Ok(new
            {
                settings = new
                {
                    enabled = saved.Enabled,
                    cooldownHours = saved.CooldownHours,
                    codeTtlHours = saved.CodeTtlHours,
                    tiers = saved.Tiers.Select(tier => new { percent = tier.Percent, weight = tier.Weight })
                },
                stats = await BuildStatsAsync()
            });
        }

        private async Task<TarotSettings> GetSettingsOrDefaultsAsync() =>
            await _settingsRepository.GetAsync() ?? new TarotSettings();

        private static TarotLuckyTier RollTier(List<TarotLuckyTier> tiers)
        {
            var totalWeight = tiers.Sum(tier => tier.Weight);
            var roll = Random.Shared.Next(totalWeight);
            foreach (var tier in tiers)
            {
                roll -= tier.Weight;
                if (roll < 0)
                {
                    return tier;
                }
            }
            return tiers[^1];
        }

        private async Task<string?> GenerateUniqueCodeAsync()
        {
            for (var attempt = 0; attempt < CodeGenerationAttempts; attempt++)
            {
                var suffix = new string(Enumerable.Range(0, CodeLength)
                    .Select(_ => CodeAlphabet[Random.Shared.Next(CodeAlphabet.Length)])
                    .ToArray());
                var code = $"TARO-{suffix}";
                if (await _promoCodeRepository.GetByCodeAsync(code) == null)
                {
                    return code;
                }
            }
            return null;
        }

        private async Task<object> BuildStatsAsync()
        {
            var totalDraws = await _drawRepository.CountAsync();
            var draws7d = await _drawRepository.CountSinceAsync(DateTime.UtcNow.AddDays(-7));

            // «Применено на чекауте»: по последним розыгрышам смотрим, есть ли usage у их промокодов.
            var recent = await _drawRepository.GetRecentAsync(RedeemStatsSampleSize);
            var redeemed = 0;
            foreach (var draw in recent)
            {
                if (!string.IsNullOrWhiteSpace(draw.PromoCodeId) &&
                    await _promoCodeUsageRepository.CountByPromoCodeIdAsync(draw.PromoCodeId!) > 0)
                {
                    redeemed++;
                }
            }

            return new { totalDraws, draws7d, redeemedInSample = redeemed, sampleSize = recent.Count };
        }
    }

    public class UpdateTarotSettingsRequest
    {
        public bool? Enabled { get; set; }
        public int? CooldownHours { get; set; }
        public int? CodeTtlHours { get; set; }
        public List<TarotTierRequest>? Tiers { get; set; }
    }

    public class TarotTierRequest
    {
        public decimal Percent { get; set; }
        public int Weight { get; set; }
    }
}
