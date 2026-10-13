namespace SuperBot.Core.Entities
{
    public class GameKey
    {
        public string UserId { get; set; }
        public string GameId { get; set; }
        public string Key { get; set; }
        public string KeyType { get; set; }
        /// <summary>Издание (код из GameDetails.Editions), которому принадлежит ключ. Пусто — базовое издание.</summary>
        public string? EditionCode { get; set; }
        /// <summary>Своя политика активации у ключа (партия под другой регион). Пусто — политика игры.</summary>
        public SuperBot.Core.Regions.RegionPolicy? RegionPolicy { get; set; }
        public DateTime IssuedAt { get; set; }

        /// <summary>
        /// Себестоимость ключа: за сколько куплен, в какой валюте, у кого и в какой партии.
        /// null означает «неизвестно», а не «бесплатно»: у ключей, заведённых до появления учёта,
        /// цены нет, и в отчёте они должны попадать в строку «без себестоимости», а не занижать
        /// расходы нулями.
        /// </summary>
        public decimal? UnitCost { get; set; }
        public string? CostCurrency { get; set; }
        public string? Supplier { get; set; }
        public string? BatchId { get; set; }
        public DateTime? AcquiredAtUtc { get; set; }

        /// <summary>Заказ, по которому ключ выдан. Пусто у лежащих в пуле и у выданных вручную.</summary>
        public string? OrderId { get; set; }

        public bool IsActive { get; set; }

        /// <summary>Кто залил ключ в пул (почта сотрудника). Пусто — импорт до появления поля.</summary>
        public string? AddedBy { get; set; }
        /// <summary>Кто выдал вручную (grant / deliver-keys). Пусто — автоматическая выдача при оплате.</summary>
        public string? IssuedBy { get; set; }
    }
}
