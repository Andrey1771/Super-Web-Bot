import { resolveMediaUrl } from "../../utils/media";

/**
 * Адреса картинок страницы кэшбэка.
 *
 * Версия в запросе обязательна: файлы в public/images/rewards лежат под постоянными
 * именами, и после замены (например, перекраски) браузеры продолжали показывать старые
 * из кэша. Поменял файлы — подними ART_VERSION.
 */
const ART_VERSION = 7;

export const rewardsArt = (name: string) => `/images/rewards/${name}.webp?v=${ART_VERSION}`;

/** Уровни, для которых в public/images/rewards есть своя 3D-медаль. */
const BUILT_IN_TIER_ART = new Set(["rookie", "veteran", "elite", "legend"]);

/**
 * Картинка уровня: загруженная в админке (из медиатеки), иначе встроенная медаль по id, иначе звезда —
 * новый уровень без картинки не должен оставлять на треке пустой кружок.
 */
export const tierArt = (tier: { id: string; imageUrl?: string | null }, apiBaseUrl: string): string => {
    if (tier.imageUrl) {
        return resolveMediaUrl(tier.imageUrl, apiBaseUrl) ?? rewardsArt("hero-star");
    }
    return BUILT_IN_TIER_ART.has(tier.id) ? rewardsArt(`tier-${tier.id}`) : rewardsArt("hero-star");
};
