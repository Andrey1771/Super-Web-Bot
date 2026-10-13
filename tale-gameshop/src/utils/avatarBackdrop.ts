import { clamp } from "./clamp";
/**
 * Подложка под аватар с прозрачностью.
 *
 * PNG/WebP с альфой сохранялся как есть, а кружок аватара в интерфейсе залит своим цветом:
 * фиолетовым в профиле, светло-лиловым в отзывах, тёмным в админке. Одна и та же картинка
 * без фона выглядела в каждом месте по-разному — сквозь дырки просвечивал фон контейнера.
 *
 * Поэтому фон подрисовывается ОДИН раз, при кропе, прямо в файл: после экспорта альфы нет,
 * и аватар везде одинаковый. Отсюда следует и то, чего здесь НЕТ: варианта «оставить
 * прозрачным». Прозрачность — это ровно то состояние, из-за которого всё и затевалось.
 *
 * Цвет пользователь выбирает сам — из палитры сайта или пипеткой. Раньше он выводился из
 * самой картинки, но угадывать за человека, какой фон идёт его аватарке, — не наше дело:
 * оттенок случайной картинки не обязан сочетаться с магазином.
 */

/** Радиальный градиент задаётся двумя тонами: центр (светлее) и край. */
export type BackdropTones = {
    center: string;
    edge: string;
};

/** Смещение центра градиента вверх: свет «сверху» читается живее ровной заливки. */
export const BACKDROP_CENTER_Y = 0.38;
export const BACKDROP_RADIUS = 0.72;

/**
 * Палитра подложек.
 *
 * Не произвольные цвета, а те, что уже живут на сайте: лиловый — разбавленный
 * --color-primary, «Violet» — он сам, «Ink» — --color-hero-surface из тёмных секций,
 * «Mist» — --color-bg. Остальные три дают тёплый и холодный выход из фиолетового, когда
 * аватарка сама фиолетовая и сливается.
 */
export const AVATAR_BACKDROPS: { id: string; label: string; color: string }[] = [
    { id: 'lilac', label: 'Lilac', color: '#ded4fb' },
    { id: 'violet', label: 'Violet', color: '#7c3aed' },
    { id: 'ink', label: 'Ink', color: '#161b2c' },
    { id: 'mist', label: 'Mist', color: '#e8eaf2' },
    { id: 'mint', label: 'Mint', color: '#a7e8dd' },
    { id: 'peach', label: 'Peach', color: '#fcd9a4' },
    { id: 'rose', label: 'Rose', color: '#f9c9d9' }
];

/** Лиловый первым: он ближе всего к фирменному цвету и не спорит ни с одной картинкой. */
export const DEFAULT_BACKDROP_COLOR = AVATAR_BACKDROPS[0].color;

const SAMPLE_SIZE = 64;
/** Полностью непрозрачным считается только 255: даже 254 уже даёт просвет. */
const OPAQUE = 255;

const hexToRgb = (hex: string) => {
    const value = hex.replace('#', '');
    const full =
        value.length === 3
            ? value
                  .split('')
                  .map((char) => char + char)
                  .join('')
            : value;
    return {
        r: parseInt(full.slice(0, 2), 16) || 0,
        g: parseInt(full.slice(2, 4), 16) || 0,
        b: parseInt(full.slice(4, 6), 16) || 0
    };
};

const rgbToHsl = (r: number, g: number, b: number) => {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    const delta = max - min;

    if (delta === 0) {
        return { h: 0, s: 0, l };
    }

    const s = delta / (1 - Math.abs(2 * l - 1));
    let h: number;
    if (max === rn) {
        h = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
        h = (bn - rn) / delta + 2;
    } else {
        h = (rn - gn) / delta + 4;
    }

    return { h: (h * 60 + 360) % 360, s, l };
};

const hsl = (h: number, s: number, l: number) =>
    `hsl(${Math.round(h)}, ${Math.round(clamp(s, 0, 1) * 100)}%, ${Math.round(clamp(l, 0, 1) * 100)}%)`;

/**
 * Из одного цвета — два тона градиента.
 *
 * Ровная заливка выглядит как дырка в интерфейсе, поэтому центр берётся чуть светлее
 * выбранного цвета, край — чуть темнее. Выбранный цвет остаётся средним по кругу, то есть
 * в свотче и на аватаре человек видит один и тот же цвет.
 */
export const tonesFromColor = (color: string): BackdropTones => {
    const { r, g, b } = hexToRgb(color);
    const { h, s, l } = rgbToHsl(r, g, b);
    return {
        center: hsl(h, s, clamp(l + 0.05, 0, 0.97)),
        edge: hsl(h, s, clamp(l - 0.09, 0.03, 1))
    };
};

/**
 * Есть ли в картинке прозрачность.
 *
 * От этого зависит, показывать ли выбор фона вообще: под фотографией любая подложка
 * невидима, и ряд свотчей был бы просто мусором на экране.
 */
export const pixelsHaveTransparency = (pixels: Uint8ClampedArray): boolean => {
    for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] < OPAQUE) {
            return true;
        }
    }
    return false;
};

export const imageHasTransparency = (image: CanvasImageSource): boolean => {
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
        return false;
    }

    try {
        context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        return pixelsHaveTransparency(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data);
    } catch {
        // Картинка с чужого домена без CORS: пиксели читать нельзя.
        return false;
    }
};

/** CSS-двойник canvas-градиента: превью в модалке и экспорт должны совпадать. */
export const backdropToCss = (tones: BackdropTones) =>
    `radial-gradient(ellipse ${BACKDROP_RADIUS * 100}% ${BACKDROP_RADIUS * 100}% at 50% ${
        BACKDROP_CENTER_Y * 100
    }%, ${tones.center}, ${tones.edge})`;

export const paintBackdrop = (context: CanvasRenderingContext2D, size: number, tones: BackdropTones) => {
    const gradient = context.createRadialGradient(
        size / 2,
        size * BACKDROP_CENTER_Y,
        0,
        size / 2,
        size * BACKDROP_CENTER_Y,
        size * BACKDROP_RADIUS
    );
    gradient.addColorStop(0, tones.center);
    gradient.addColorStop(1, tones.edge);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
};
