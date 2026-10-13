import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import HoverTrailer, { HOVER_TRAILER_DELAY_MS } from './HoverTrailer';

/**
 * Превью-ролик при наведении на плитку. Запускается после паузы, чтобы проезд мышью не дёргал видео; уход мыши
 * возвращает обложку; на телефонах, при «меньше движения» и экономии трафика превью нет вовсе.
 */

let media: Record<string, boolean> = {};
const setMedia = (overrides: Record<string, boolean>) => {
    media = { '(hover: hover) and (pointer: fine)': true, '(prefers-reduced-motion: reduce)': false, ...overrides };
};

beforeAll(() => {
    window.matchMedia = ((query: string) => ({ matches: Boolean(media[query]), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
    // jsdom не умеет играть видео — только чтобы autoPlay не падал.
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: () => Promise.resolve() });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: () => {} });
});

beforeEach(() => {
    jest.useFakeTimers();
    setMedia({});
});

afterEach(() => {
    jest.useRealTimers();
});

const show = (props: Partial<React.ComponentProps<typeof HoverTrailer>> = {}) => render(
    <article data-testid="card">
        <div className="cover">
            <img alt="cover" src="cover.png" />
            <HoverTrailer src="http://cdn.test/trailer.mp4" poster="http://cdn.test/poster.jpg" title="Portal 2" {...props} />
        </div>
    </article>,
);

it('starts the muted trailer after a pause on the card and stops it when the mouse leaves', () => {
    show();
    const card = screen.getByTestId('card');

    fireEvent.pointerEnter(card);
    expect(screen.queryByTestId('hover-trailer')).toBeNull();          // ещё пауза

    act(() => { jest.advanceTimersByTime(HOVER_TRAILER_DELAY_MS); });
    const video = screen.getByTestId('hover-trailer') as HTMLVideoElement;
    expect(video).toHaveAttribute('src', 'http://cdn.test/trailer.mp4');
    expect(video).toHaveAttribute('poster', 'http://cdn.test/poster.jpg');
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute('loop');
    expect(video).toHaveAttribute('preload', 'none');

    fireEvent.playing(video);
    expect(video).toHaveClass('is-ready');

    fireEvent.pointerLeave(card);
    expect(screen.queryByTestId('hover-trailer')).toBeNull();
});

it('does nothing on a quick pass over the card', () => {
    show();
    const card = screen.getByTestId('card');

    fireEvent.pointerEnter(card);
    act(() => { jest.advanceTimersByTime(HOVER_TRAILER_DELAY_MS - 100); });
    fireEvent.pointerLeave(card);
    act(() => { jest.advanceTimersByTime(1000); });

    expect(screen.queryByTestId('hover-trailer')).toBeNull();
});

it('stays quiet without a trailer, on touch devices and when motion is unwanted', () => {
    const { unmount } = show({ src: null });
    fireEvent.pointerEnter(screen.getByTestId('card'));
    act(() => { jest.advanceTimersByTime(HOVER_TRAILER_DELAY_MS); });
    expect(screen.queryByTestId('hover-trailer')).toBeNull();
    unmount();

    setMedia({ '(hover: hover) and (pointer: fine)': false });
    const touch = show();
    fireEvent.pointerEnter(screen.getByTestId('card'));
    act(() => { jest.advanceTimersByTime(HOVER_TRAILER_DELAY_MS); });
    expect(screen.queryByTestId('hover-trailer')).toBeNull();
    touch.unmount();

    setMedia({ '(prefers-reduced-motion: reduce)': true });
    show();
    fireEvent.pointerEnter(screen.getByTestId('card'));
    act(() => { jest.advanceTimersByTime(HOVER_TRAILER_DELAY_MS); });
    expect(screen.queryByTestId('hover-trailer')).toBeNull();
});

it("also listens on a link-based card marked with data-hover-trailer-root", () => {
    render(
        <a href="/games/portal-2" data-testid="link-card" data-hover-trailer-root="">
            <HoverTrailer src="http://cdn.test/trailer.mp4" title="Portal 2" />
        </a>,
    );
    fireEvent.pointerEnter(screen.getByTestId("link-card"));
    act(() => { jest.advanceTimersByTime(HOVER_TRAILER_DELAY_MS); });
    expect(screen.getByTestId("hover-trailer")).toHaveAttribute("src", "http://cdn.test/trailer.mp4");
});
