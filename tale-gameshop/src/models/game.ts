export interface Game {
    id?: string;
    slug?: string;
    name: string;
    description: string;
    price: number;
    finalPrice?: number;
    discountPercent?: number;
    discountActive?: boolean;
    /** Конец активной скидки (UTC, ISO) — для обратного отсчёта на витрине. */
    discountEndsAt?: string;
    /** Статус релиза считает сервер — клиент даты не сравнивает (часы/таймзоны врут). */
    isComingSoon?: boolean;
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
    title: string;
    gameType: number;
    imagePath: string;
    releaseDate: string;
}
