export interface Game {
    id?: string;
    slug?: string;
    name: string;
    description: string;
    /** Базовая цена, выражена в `currency`. Форматировать только через formatMoney. */
    price: number;
    /**
     * Валюта базовой цены. Пусто у записей до мультивалютности — это USD.
     * Фронт валюту не выбирает и не конвертирует: показывает ту, что пришла с сервера.
     */
    currency?: string;
    /** Ручные цены в других валютах: код → сумма. Базовой валюты здесь нет, она в price. */
    prices?: Record<string, number>;
    finalPrice?: number;
    discountPercent?: number;
    discountActive?: boolean;
    /** Конец активной скидки (UTC, ISO) — для обратного отсчёта на витрине. */
    discountEndsAt?: string;
    /** Статус релиза считает сервер — клиент даты не сравнивает (часы/таймзоны врут). */
    isComingSoon?: boolean;
    /** Для DLC — id базовой игры. */
    parentGameId?: string | null;
    /**
     * Где активируется ключ. Приходит только у товаров с ограничением: у «работает везде»
     * поля нет вовсе, и рисовать бейдж не из чего — так и задумано.
     * allowed: true/false — вердикт для страны покупателя, null — страна неизвестна.
     */
    region?: {
        badge: string;
        summary: string;
        exclusions?: string | null;
        /** Код вида и списки — из них витрина собирает подпись на языке сайта (utils/region-text). */
        kind?: string | null;
        regionNames?: string[] | null;
        excludedCountries?: string[] | null;
        allowed?: boolean | null;
    } | null;
    isDlc?: boolean;
    /** Сколько DLC у игры в магазине: пометка «+N DLC» на плитке. */
    dlcCount?: number;
    genres?: string[];
    /** Ярлыки платформ («PC», «PlayStation», «Xbox», …) — сервер отдаёт минимум ["PC"]. */
    platforms?: string[];
    /** Название категории, под которой игра показана в каталоге. Считает сервер по настройкам. */
    category?: string;
    /** Средняя оценка. null — отзывов нет; это не то же самое, что ноль звёзд. */
    rating?: number | null;
    reviewCount?: number;
    /** Есть ли ключи в наличии. У невышедшей игры всегда true — там нечему кончаться. */
    inStock?: boolean;
    /** Остаток, когда он мал (иначе null) — точный размер запаса наружу не отдаётся. */
    lowStockLeft?: number | null;
    showInFeaturedStorefront?: boolean;
    featuredStorefrontPriority?: number;
    /** Вид товара: игра или ПО. Нет поля — игра (старые ответы). */
    kind?: 'Game' | 'Software';
    /** Жанр игры — код (адрес страницы жанра /games/category/{genre}). У ПО нет. */
    genre?: string | null;
    /** Категория раздела /software (tag). У игр нет. */
    softwareCategory?: string | null;
    /** Лицензия ПО, чья цена на карточке («1 year · 3 devices»). */
    license?: { code: string; label: string; termMonths?: number | null; devices?: number | null; isSubscription: boolean } | null;
    /** Сколько у ПО лицензий: «+N licenses» на карточке. */
    licenseCount?: number;
    /** Цена «от»: лицензий больше одной. */
    priceFrom?: boolean;
    /** Где активируется ключ ПО (VendorWebsite, MicrosoftAccount, InApp). */
    activation?: string | null;
    title: string;
    gameType: number;
    imagePath: string;
    /** Трейлер для превью при наведении на плитку; нет — видео у товара нет. */
    trailerUrl?: string | null;
    trailerPosterUrl?: string | null;
    releaseDate: string;
}
