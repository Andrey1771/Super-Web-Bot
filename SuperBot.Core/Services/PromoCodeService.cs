using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;

namespace SuperBot.Core.Services;

public class PromoCodeService : IPromoCodeService
{
    private readonly IPromoCodeRepository _promoCodeRepository;
    private readonly IPromoCodeUsageRepository _promoCodeUsageRepository;
    private readonly IOrderRepository _orderRepository;

    public PromoCodeService(
        IPromoCodeRepository promoCodeRepository,
        IPromoCodeUsageRepository promoCodeUsageRepository,
        IOrderRepository orderRepository)
    {
        _promoCodeRepository = promoCodeRepository;
        _promoCodeUsageRepository = promoCodeUsageRepository;
        _orderRepository = orderRepository;
    }

    public async Task<PromoValidationResult> ValidateAsync(PromoValidationRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Code))
        {
            return Invalid(request.CartSubtotal, "Promo code is required.");
        }

        var promoCode = await _promoCodeRepository.GetByCodeAsync(request.Code.Trim());
        if (promoCode == null)
        {
            return Invalid(request.CartSubtotal, "Promo code does not exist.");
        }

        var now = DateTime.UtcNow;
        if (!promoCode.IsActiveAt(now))
        {
            return Invalid(request.CartSubtotal, "Promo code has expired or is not active yet.");
        }

        if (promoCode.MinOrderAmount.HasValue && request.CartSubtotal < promoCode.MinOrderAmount.Value)
        {
            return Invalid(request.CartSubtotal, "Minimum order amount is not reached.");
        }

        var normalizedUser = request.UserName?.Trim();
        if (promoCode.FirstOrderOnly)
        {
            if (string.IsNullOrWhiteSpace(normalizedUser))
            {
                return Invalid(request.CartSubtotal, "Promo code is available only for authorized users.");
            }

            var userOrders = await _orderRepository.GetOrdersByUserAsync(normalizedUser);
            var hasCompletedOrder = userOrders.Any(order => order.IsPaid || string.Equals(order.Status, "DELIVERED", StringComparison.OrdinalIgnoreCase));
            if (hasCompletedOrder)
            {
                return Invalid(request.CartSubtotal, "Promo code is only available for the first order.");
            }
        }

        if (!string.IsNullOrWhiteSpace(normalizedUser) && promoCode.UsagePerUser.HasValue)
        {
            var usedByUser = await _promoCodeUsageRepository.CountByPromoCodeAndUserAsync(promoCode.Id!, normalizedUser);
            if (usedByUser >= promoCode.UsagePerUser.Value)
            {
                return Invalid(request.CartSubtotal, "You have reached usage limit for this promo code.");
            }
        }

        if (promoCode.UsageLimit.HasValue)
        {
            var totalUsed = await _promoCodeUsageRepository.CountByPromoCodeIdAsync(promoCode.Id!);
            if (totalUsed >= promoCode.UsageLimit.Value)
            {
                return Invalid(request.CartSubtotal, "Promo code usage limit has been reached.");
            }
        }

        var discount = CalculateDiscount(promoCode, request.CartSubtotal);
        var finalTotal = Math.Max(0, request.CartSubtotal - discount);

        return new PromoValidationResult
        {
            Valid = true,
            DiscountAmount = discount,
            FinalTotal = finalTotal,
            Message = "Promo code applied.",
            PromoCodeId = promoCode.Id,
            NormalizedCode = promoCode.Code
        };
    }

    public async Task RecordUsageAsync(PromoApplyRequest request)
    {
        var validation = await ValidateAsync(new PromoValidationRequest
        {
            Code = request.Code,
            CartSubtotal = request.CartSubtotal,
            UserName = request.UserName
        });

        if (!validation.Valid || string.IsNullOrWhiteSpace(validation.PromoCodeId))
        {
            throw new InvalidOperationException(validation.Message);
        }

        await _promoCodeUsageRepository.RecordUsageAsync(new PromoCodeUsage
        {
            PromoCodeId = validation.PromoCodeId,
            Code = validation.NormalizedCode ?? request.Code.Trim().ToUpperInvariant(),
            UserName = request.UserName?.Trim() ?? string.Empty,
            OrderId = request.OrderId,
            UsedAt = DateTime.UtcNow
        });
    }

    private static PromoValidationResult Invalid(decimal subtotal, string message)
    {
        return new PromoValidationResult
        {
            Valid = false,
            DiscountAmount = 0,
            FinalTotal = subtotal,
            Message = message
        };
    }

    private static decimal CalculateDiscount(PromoCode promoCode, decimal subtotal)
    {
        decimal discount = promoCode.Type switch
        {
            PromoCodeType.Percentage => subtotal * (promoCode.Value / 100m),
            PromoCodeType.Fixed => promoCode.Value,
            _ => 0
        };

        if (promoCode.MaxDiscountAmount.HasValue)
        {
            discount = Math.Min(discount, promoCode.MaxDiscountAmount.Value);
        }

        discount = Math.Min(discount, subtotal);
        return Math.Round(discount, 2, MidpointRounding.AwayFromZero);
    }
}
