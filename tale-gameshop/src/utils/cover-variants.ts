/**
 * Варианты обложек: один исходник — много рамок.
 *
 * Сервер отдаёт копии обложки нужной ширины и пропорции по адресу
 * /uploads/v/{ширина}/{рамка}/{путь исходника}.webp (см. CoverImages.cs), обрезанные вокруг точки фокуса.
 * Здесь — только сборка адресов: какие рамки бывают, какие ширины запрашивать и для каких картинок это вообще
 * возможно (svg, gif, чужие домены и заглушки остаются как есть).
 */
export type CoverRatio = 'square' | 'portrait' | 'landscape' | 'wide' | 'photo';

/** Сегмент адреса варианта для каждой рамки — те же ключи, что в CoverImages.Ratios на сервере. */
export const COVER_RATIO_TOKEN: Record<CoverRatio, string> = {
    square: 'sq',
    portrait: '3x4',
    landscape: '4x3',
    wide: '16x9',
    photo: '3x2',
};

/** Значение aspect-ratio для рамки. */
export const COVER_RATIO_CSS: Record<CoverRatio, string> = {
    square: '1 / 1',
    portrait: '3 / 4',
    landscape: '4 / 3',
    wide: '16 / 9',
    photo: '3 / 2',
};

/** Ширины для srcset; браузер выберет ближайшую к реальному размеру рамки на экране. */
export const COVER_WIDTHS = [240, 480, 960, 1400] as const;
/** Крошечная копия для размытой заглушки, пока грузится настоящая. */
export const COVER_PLACEHOLDER_WIDTH = 24;

const SOURCE_RE = /^\/uploads\/(?!v\/)(.+\.(?:jpe?g|png|webp))$/i;

/** Адрес варианта или null, если картинка не наша загрузка (svg, gif, чужой домен, data:, заглушка). */
export const coverVariantUrl = (src: string | null | undefined, width: number, ratio: CoverRatio): string | null => {
    if (!src) {
        return null;
    }
    let url: URL;
    try {
        url = new URL(src, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    } catch {
        return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return null;
    }
    const match = SOURCE_RE.exec(url.pathname);
    if (!match) {
        return null;
    }
    return `${url.origin}/uploads/v/${width}/${COVER_RATIO_TOKEN[ratio]}/${match[1]}.webp`;
};

/** Строка srcset для рамки; undefined — вариантов нет, показываем исходник. */
export const buildCoverSrcSet = (src: string | null | undefined, ratio: CoverRatio, widths: readonly number[] = COVER_WIDTHS): string | undefined => {
    const entries = widths
        .map((width) => {
            const url = coverVariantUrl(src, width, ratio);
            return url ? `${url} ${width}w` : null;
        })
        .filter((entry): entry is string => Boolean(entry));
    return entries.length > 0 ? entries.join(', ') : undefined;
};
