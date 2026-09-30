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
