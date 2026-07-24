namespace SuperBot.Core.Services
{
    /// <summary>
    /// Единственная формула цены со скидкой в проекте.
    /// Раньше она была скопирована в пяти местах (каталог, детали игры, рассылка, админка скидок,
    /// чекаут). Расхождение хотя бы в округлении означало бы, что на витрине одна цена,
    /// а списывается другая — поэтому источник должен быть один.
    /// </summary>
    public static class PriceCalculator
    {
        /// <summary>
        /// Цена с учётом скидки. Округление до копеек «от нуля» (0.005 → 0.01),
        /// чтобы результат совпадал везде до последнего цента.
        /// </summary>
        public static decimal FinalPrice(decimal price, decimal? discountPercent)
        {
            if (!discountPercent.HasValue || discountPercent.Value <= 0)
            {
                return price;
            }

            var result = price * (1 - (discountPercent.Value / 100m));
            return Math.Round(result, 2, MidpointRounding.AwayFromZero);
        }
    }
}
