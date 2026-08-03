namespace SuperBot.Core.Entities;

/// <summary>
/// Настройки программы лояльности. Биндятся из секции "Cashback" appsettings — пороги/ставки
/// это бизнес-политика, а не магические числа в коде. Пустой/битый конфиг → безопасные дефолты.
/// </summary>
public class CashbackOptions
{
    public bool Enabled { get; set; } = true;

    /// <summary>Сколько единиц валюты стоит 1 балл. По умолчанию 1 балл = $1.</summary>
    public decimal PointToCurrency { get; set; } = 1m;

    /// <summary>Минимум баллов к списанию за раз.</summary>
    public int MinRedeemPoints { get; set; } = 1;

    /// <summary>Потолок списания как доля суммы заказа (100 = можно погасить заказ полностью).</summary>
    public decimal MaxRedeemPercentOfOrder { get; set; } = 100m;

    /// <summary>Тиры по возрастанию порога. Ставка кэшбэка растёт с суммой трат.</summary>
    public List<CashbackTier> Tiers { get; set; } = new();

    /// <summary>Дефолтные тиры, если конфиг не задал ни одного корректного.</summary>
    public static List<CashbackTier> DefaultTiers() => new()
    {
        new CashbackTier { Name = "Bronze", MinLifetimeSpent = 0m, RatePercent = 1m },
        new CashbackTier { Name = "Silver", MinLifetimeSpent = 100m, RatePercent = 2m },
        new CashbackTier { Name = "Gold", MinLifetimeSpent = 500m, RatePercent = 3m }
    };

    /// <summary>
    /// Нормализует конфиг к рабочему виду: подставляет дефолтные тиры при отсутствии,
    /// сортирует по порогу и чинит бессмысленные значения. Вызывать один раз при старте.
    /// </summary>
    public CashbackOptions Normalized()
    {
        var tiers = (Tiers ?? new List<CashbackTier>())
            .Where(tier => tier is not null && tier.RatePercent >= 0m && tier.MinLifetimeSpent >= 0m)
            .OrderBy(tier => tier.MinLifetimeSpent)
            .ToList();

        if (tiers.Count == 0)
        {
            tiers = DefaultTiers();
        }

        return new CashbackOptions
        {
            Enabled = Enabled,
            PointToCurrency = PointToCurrency > 0m ? PointToCurrency : 1m,
            MinRedeemPoints = MinRedeemPoints > 0 ? MinRedeemPoints : 1,
            MaxRedeemPercentOfOrder = MaxRedeemPercentOfOrder is > 0m and <= 100m ? MaxRedeemPercentOfOrder : 100m,
            Tiers = tiers
        };
    }

    /// <summary>Тир, соответствующий накопленной сумме трат (наивысший достигнутый порог).</summary>
    public CashbackTier ResolveTier(decimal lifetimeSpent)
    {
        var applicable = Tiers.Where(tier => lifetimeSpent >= tier.MinLifetimeSpent).ToList();
        return applicable.Count > 0 ? applicable[^1] : Tiers[0];
    }

    /// <summary>Следующий тир после текущего, если он есть.</summary>
    public CashbackTier? NextTier(decimal lifetimeSpent)
    {
        return Tiers.FirstOrDefault(tier => tier.MinLifetimeSpent > lifetimeSpent);
    }
}

public class CashbackTier
{
    public string Name { get; set; } = string.Empty;
    public decimal MinLifetimeSpent { get; set; }
    public decimal RatePercent { get; set; }
}
