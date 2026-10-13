import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Cover from './Cover';
import { GAME_COVER_FALLBACK } from '../../utils/game-cover';

/**
 * Обложка в рамке. Рамку задаёт сайт, картинка обрезается под неё; варианты по ширине — через srcset.
 * Раньше рамка была объявлена, но не держалась: вертикальная обложка растягивала весь ряд карточек.
 */

it('frames the picture at the requested ratio and asks for sized variants', () => {
    render(<Cover src="/uploads/images/abc.png" baseUrl="http://api.test" title="Portal 2" ratio="portrait" sizes="240px" />);

    const img = screen.getByAltText('Portal 2');
    const frame = img.parentElement as HTMLElement;
    expect(frame).toHaveClass('cover');
    expect(frame.style.getPropertyValue('--cover-ratio')).toBe('3 / 4');
    expect(img).toHaveAttribute('src', 'http://api.test/uploads/images/abc.png');
    expect(img).toHaveAttribute('srcset', expect.stringContaining('http://api.test/uploads/v/240/3x4/images/abc.png.webp 240w'));
    expect(img).toHaveAttribute('sizes', '240px');
    expect(img).toHaveAttribute('loading', 'lazy');
});

it('shows the original without srcset when the server cannot cut it, and eagerly above the fold', () => {
    render(<Cover src="http://api.test/uploads/demo-covers/portal-2.svg" title="Portal 2" priority />);

    const img = screen.getByAltText('Portal 2');
    expect(img).not.toHaveAttribute('srcset');
    expect(img).not.toHaveAttribute('sizes');
    expect(img).toHaveAttribute('loading', 'eager');
});

it('falls back to the placeholder and drops the variants when the picture is broken', () => {
    render(<Cover src="http://api.test/uploads/images/gone.png" title="Gone" />);

    const img = screen.getByAltText('Gone');
    expect(img).toHaveAttribute('srcset');
    fireEvent.error(img);

    const fallback = screen.getByAltText('Game cover');
    expect(fallback).toHaveAttribute('src', GAME_COVER_FALLBACK);
    expect(fallback).not.toHaveAttribute('srcset');
});

it('keeps overlays inside the frame and uses a blurred tiny copy as the loading background', () => {
    render(
        <Cover src="http://api.test/uploads/images/abc.png" title="Portal 2" ratio="wide" blur className="hero-cover">
            <span>−78%</span>
        </Cover>,
    );

    const frame = screen.getByText('−78%').parentElement as HTMLElement;
    expect(frame).toHaveClass('cover', 'cover--blur', 'hero-cover');
    expect(frame.style.backgroundImage).toContain('/uploads/v/24/16x9/images/abc.png.webp');
});

/** Пока обложка грузится, рамка закрашена её основным цветом; картинка проявляется, когда загрузилась. */
it('paints the frame with the cover color and reveals the image once it has loaded', () => {
    const { container } = render(<Cover src="/uploads/images/abc.png" title="Game" color="#3a5f8b" />);
    const frame = container.querySelector('.cover') as HTMLElement;
    expect(frame.style.getPropertyValue('--cover-bg')).toBe('#3a5f8b');
    expect(frame).not.toHaveClass('cover--loaded');

    fireEvent.load(container.querySelector('img')!);
    expect(frame).toHaveClass('cover--loaded');
});

it('ignores anything but a #rrggbb color', () => {
    const { container } = render(<Cover src="/uploads/images/abc.png" title="Game" color="red; background:url(x)" />);
    expect((container.querySelector('.cover') as HTMLElement).style.getPropertyValue('--cover-bg')).toBe('');
});

/** Возврат в каталог: картинка уже в кэше браузера и готова до первой отрисовки — сразу видна, а не прозрачна. */
it('shows an image that is already in the browser cache right away', () => {
    const complete = jest.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    const width = jest.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(480);
    try {
        const { container } = render(<Cover src="/uploads/images/abc.png" title="Game" color="#3a5f8b" />);
        expect(container.querySelector('.cover')).toHaveClass('cover--loaded');
    } finally {
        complete.mockRestore();
        width.mockRestore();
    }
});

it('keeps the image visible when its load event fires before the effects run', () => {
    const { container, rerender } = render(<Cover src="/uploads/images/abc.png" title="Game" />);
    fireEvent.load(container.querySelector('img')!);
    rerender(<Cover src="/uploads/images/abc.png" title="Game" />);
    expect(container.querySelector('.cover')).toHaveClass('cover--loaded');

    // Другая картинка в той же рамке — снова ждём её загрузки.
    rerender(<Cover src="/uploads/images/other.png" title="Game" />);
    expect(container.querySelector('.cover')).not.toHaveClass('cover--loaded');
});
