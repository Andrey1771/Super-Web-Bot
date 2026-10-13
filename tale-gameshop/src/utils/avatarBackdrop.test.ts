import {
    AVATAR_BACKDROPS,
    DEFAULT_BACKDROP_COLOR,
    backdropToCss,
    pixelsHaveTransparency,
    tonesFromColor
} from './avatarBackdrop';

/** Собирает RGBA-массив из списка пикселей — так же, как его отдаёт getImageData. */
const pixels = (list: number[][]) => Uint8ClampedArray.from(list.flat());

/** Достаёт три числа из строки вида hsl(320, 40%, 80%). */
const parseHsl = (value: string) => {
    const numbers = value
        .replace('hsl(', '')
        .replace(')', '')
        .split(',')
        .map((part) => Number(part.trim().replace('%', '')));
    return { h: numbers[0], s: numbers[1], l: numbers[2] };
};

describe('pixelsHaveTransparency', () => {
    it('says no for a fully opaque picture', () => {
        expect(pixelsHaveTransparency(pixels([[200, 80, 140, 255], [190, 70, 130, 255]]))).toBe(false);
    });

    it('says yes as soon as one pixel is not fully opaque', () => {
        expect(pixelsHaveTransparency(pixels([[200, 80, 140, 255], [0, 0, 0, 0]]))).toBe(true);
    });

    it('counts a barely translucent pixel too: even 254 lets the container show through', () => {
        expect(pixelsHaveTransparency(pixels([[200, 80, 140, 254]]))).toBe(true);
    });
});

describe('tonesFromColor', () => {
    it('keeps the chosen colour recognisable: the centre is lighter, the edge darker', () => {
        const tones = tonesFromColor('#7c3aed');

        const center = parseHsl(tones.center);
        const edge = parseHsl(tones.edge);
        expect(center.l).toBeGreaterThan(edge.l);
        // Оттенок остаётся тем же, меняется только светлота — иначе свотч и аватар
        // показывали бы разные цвета.
        expect(Math.abs(center.h - edge.h)).toBeLessThan(2);
        expect(Math.abs(center.h - 262)).toBeLessThan(4);
    });

    it('works for a dark colour without collapsing into flat black', () => {
        const tones = tonesFromColor('#161b2c');

        expect(parseHsl(tones.center).l).toBeGreaterThan(parseHsl(tones.edge).l);
        expect(parseHsl(tones.edge).l).toBeGreaterThanOrEqual(3);
    });

    it('accepts a three-digit hex, which is what some colour pickers hand back', () => {
        expect(tonesFromColor('#fff')).toEqual(tonesFromColor('#ffffff'));
    });
});

describe('AVATAR_BACKDROPS', () => {
    it('starts with the default colour so the first swatch is the preselected one', () => {
        expect(AVATAR_BACKDROPS[0].color).toBe(DEFAULT_BACKDROP_COLOR);
    });

    it('has no duplicates — two identical swatches would look like a bug', () => {
        const colors = AVATAR_BACKDROPS.map((item) => item.color);
        expect(new Set(colors).size).toBe(colors.length);
    });

    it('offers both light and dark options, so any artwork has something to sit on', () => {
        const lightness = AVATAR_BACKDROPS.map((item) => parseHsl(tonesFromColor(item.color).center).l);
        expect(Math.max(...lightness)).toBeGreaterThan(80);
        expect(Math.min(...lightness)).toBeLessThan(30);
    });
});

describe('backdropToCss', () => {
    it('puts both tones into one radial gradient', () => {
        const tones = tonesFromColor('#ded4fb');
        const css = backdropToCss(tones);

        expect(css).toContain('radial-gradient');
        expect(css).toContain(tones.center);
        expect(css).toContain(tones.edge);
    });
});
