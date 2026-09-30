namespace SuperBot.Core.Services;

/// <summary>
/// Вердикт отзыва («рекомендую» / «не рекомендую») выводится из звёзд, а не спрашивается отдельно.
/// Раньше в форме была галочка «I recommend this game», включённая по умолчанию: она дублировала
/// оценку, забывалась, и появлялись отзывы «2 звезды, рекомендую». Как у Metacritic: 4–5 — за,
/// 1–2 — против, 3 — нейтрально, без подписи.
/// </summary>
public static class ReviewVerdict
{
    public const int RecommendFrom = 4;
    public const int NotRecommendUpTo = 2;

    /// <summary>true — рекомендует, false — не рекомендует, null — нейтральная тройка.</summary>
    public static bool? FromRating(int rating) =>
        rating >= RecommendFrom ? true : rating <= NotRecommendUpTo ? false : null;

    /// <summary>Идёт ли отзыв в «N% recommend»: только 4 и 5 звёзд.</summary>
    public static bool IsRecommendation(int rating) => rating >= RecommendFrom;
}
