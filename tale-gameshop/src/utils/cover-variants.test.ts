import { buildCoverSrcSet, coverVariantUrl } from './cover-variants';

/**
 * Адреса вариантов обложек. Раньше карточки грузили исходник как есть — PNG на 5 МБ в каждой плитке.
 * Теперь витрина просит копию нужной ширины и рамки, а всё, что сервер резать не умеет, остаётся как было.
 */

it('rewrites an uploaded cover into a sized, framed webp variant', () => {
    expect(coverVariantUrl('http://localhost/uploads/images/abc.png', 480, 'square'))
        .toBe('http://localhost/uploads/v/480/sq/images/abc.png.webp');
    expect(coverVariantUrl('/uploads/legacy.jpg', 240, 'portrait'))
        .toBe(`${window.location.origin}/uploads/v/240/3x4/legacy.jpg.webp`);
});

it('leaves alone what the server cannot cut: svg, gif, other domains, data urls, already-cut variants', () => {
    expect(coverVariantUrl('http://localhost/uploads/demo-covers/portal-2.svg', 480, 'square')).toBeNull();
    expect(coverVariantUrl('http://localhost/uploads/images/anim.gif', 480, 'square')).toBeNull();
    expect(coverVariantUrl('https://cdn.example.com/uploads/images/abc.png', 480, 'square'))
        .toBe('https://cdn.example.com/uploads/v/480/sq/images/abc.png.webp');   // тот же контракт на любом нашем хосте
    expect(coverVariantUrl('https://example.com/covers/abc.png', 480, 'square')).toBeNull();
    expect(coverVariantUrl('data:image/png;base64,AAAA', 480, 'square')).toBeNull();
    expect(coverVariantUrl('http://localhost/uploads/v/240/sq/images/abc.png.webp', 480, 'square')).toBeNull();
    expect(coverVariantUrl(null, 480, 'square')).toBeNull();
});

it('builds a srcset with every width, or nothing when there are no variants', () => {
    expect(buildCoverSrcSet('http://localhost/uploads/images/abc.png', 'wide')).toBe(
        'http://localhost/uploads/v/240/16x9/images/abc.png.webp 240w, '
        + 'http://localhost/uploads/v/480/16x9/images/abc.png.webp 480w, '
        + 'http://localhost/uploads/v/960/16x9/images/abc.png.webp 960w, '
        + 'http://localhost/uploads/v/1400/16x9/images/abc.png.webp 1400w',
    );
    expect(buildCoverSrcSet('http://localhost/uploads/demo-covers/x.svg', 'wide')).toBeUndefined();
});
