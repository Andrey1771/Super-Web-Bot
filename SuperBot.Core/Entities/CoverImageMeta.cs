namespace SuperBot.Core.Entities
{
    /// <summary>
    /// Что магазин знает о загруженной картинке обложки помимо самого файла: где у неё главное место
    /// (точка фокуса для обрезки под разные рамки), размер и основной цвет для заглушки.
    /// Ключ — путь файла внутри папки загрузок («images/abc.png»): обложка у игры хранится просто адресом,
    /// и это единственное, что есть и у товаров из медиатеки, и у старых загрузок.
    /// </summary>
    public class CoverImageMeta
    {
        public string Path { get; set; } = string.Empty;
        /// <summary>Точка фокуса по горизонтали, 0 — левый край, 1 — правый. По умолчанию центр.</summary>
        public double FocusX { get; set; } = 0.5;
        /// <summary>Точка фокуса по вертикали, 0 — верх, 1 — низ.</summary>
        public double FocusY { get; set; } = 0.5;
        public int? Width { get; set; }
        public int? Height { get; set; }
        /// <summary>Основной цвет картинки, #rrggbb — фон рамки, пока обложка не загрузилась.</summary>
        public string? DominantColor { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
