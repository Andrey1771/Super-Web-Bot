import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MediaItem } from '../../../types/game-details';
import GameMediaGallery from './GameMediaGallery';

/**
 * Галерея на странице игры: стрелки по бокам листают кадры по кругу, клавиатура тоже,
 * а скроллер под лентой миниатюр появляется только когда миниатюры не влезают.
 */

const item = (id: string, type: MediaItem['type'], extra: Partial<MediaItem> = {}): MediaItem => ({
  id,
  type,
  url: `/${id}.${type === 'video' ? 'mp4' : 'jpg'}`,
  thumbUrl: `/${id}-thumb.jpg`,
  ...extra
});

const media = [item('trailer', 'video', { posterUrl: '/trailer-poster.jpg', durationSec: 65 }), item('shot-1', 'image'), item('shot-2', 'image')];

const mainImageSrc = () => document.querySelector<HTMLImageElement>('.game-media-main img')?.getAttribute('src');

it('flips through media with the side arrows, wrapping around at the ends', async () => {
  render(<GameMediaGallery media={media} title="Lanternfall" />);

  expect(mainImageSrc()).toBe('/trailer-poster.jpg');
  await userEvent.click(screen.getByRole('button', { name: 'Next media' }));
  expect(mainImageSrc()).toBe('/shot-1.jpg');
  expect(screen.getByRole('button', { name: 'Screenshot 2 of 3' })).toHaveAttribute('aria-pressed', 'true');

  await userEvent.click(screen.getByRole('button', { name: 'Previous media' }));
  await userEvent.click(screen.getByRole('button', { name: 'Previous media' }));
  expect(mainImageSrc()).toBe('/shot-2.jpg');
});

it('supports arrow keys and stops a playing video when the frame changes', async () => {
  const onMediaPlay = jest.fn();
  render(<GameMediaGallery media={media} title="Lanternfall" onMediaPlay={onMediaPlay} />);

  await userEvent.click(screen.getByRole('button', { name: 'Play trailer' }));
  expect(document.querySelector('.game-media-main video')).not.toBeNull();
  expect(onMediaPlay).toHaveBeenCalledWith(media[0]);

  fireEvent.keyDown(screen.getByRole('button', { name: 'Next media' }), { key: 'ArrowRight' });
  expect(document.querySelector('.game-media-main video')).toBeNull();
  expect(mainImageSrc()).toBe('/shot-1.jpg');

  fireEvent.keyDown(screen.getByRole('button', { name: 'Next media' }), { key: 'ArrowLeft' });
  expect(screen.getByRole('button', { name: 'Play trailer' })).toBeInTheDocument();
});

it('hides the arrows for a single frame', () => {
  render(<GameMediaGallery media={[media[1]]} title="Lanternfall" />);
  expect(screen.queryByRole('button', { name: 'Next media' })).toBeNull();
});

describe('fullscreen viewer', () => {
  const dialog = () => screen.queryByRole('dialog', { name: 'Lanternfall — media viewer' });

  it('opens on the image, keeps the arrows and walks through images and videos alike', async () => {
    const onMediaPlay = jest.fn();
    render(<GameMediaGallery media={media} title="Lanternfall" onMediaPlay={onMediaPlay} />);

    await userEvent.click(screen.getByRole('button', { name: 'Next media' }));
    await userEvent.click(screen.getByRole('button', { name: 'Open image fullscreen' }));
    const viewer = dialog()!;
    expect(viewer).toBeInTheDocument();
    expect(viewer).toHaveTextContent('2 / 3');
    expect(viewer.querySelector('img')).toHaveAttribute('src', '/shot-1.jpg');

    // Стрелка в просмотре ведёт на видео — оно играет прямо здесь, а не возвращает к постеру.
    await userEvent.click(within(viewer).getByRole('button', { name: 'Previous media' }));
    expect(viewer.querySelector('video')).toHaveAttribute('src', '/trailer.mp4');
    expect(viewer).toHaveTextContent('1 / 3');
    expect(onMediaPlay).toHaveBeenCalledWith(media[0]);

    // Галерея под просмотром идёт следом: закрыли — активен тот же кадр.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(dialog()).toBeNull();
    expect(screen.getByRole('button', { name: 'Video 1 of 3' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the theater and fullscreen buttons in the corner of the picture and leaves the theater by the first one', async () => {
    render(<GameMediaGallery media={media} title="Lanternfall" />);
    await userEvent.click(screen.getByRole('button', { name: 'Next media' }));
    await userEvent.click(screen.getByRole('button', { name: 'Open image fullscreen' }));
    const viewer = dialog()!;

    const tools = viewer.querySelector('.media-lightbox__frame .media-lightbox__tools')!;
    expect(within(tools as HTMLElement).getByRole('button', { name: 'Exit theater' })).toBeInTheDocument();
    // jsdom без Fullscreen API — второй кнопки нет, она появится только там, где есть requestFullscreen.
    expect(within(tools as HTMLElement).queryByRole('button', { name: 'Fullscreen' })).toBeNull();

    await userEvent.click(within(tools as HTMLElement).getByRole('button', { name: 'Exit theater' }));
    expect(dialog()).toBeNull();
  });

  it('opens a video in theater view from the corner button and stops the inline player', async () => {
    render(<GameMediaGallery media={media} title="Lanternfall" />);
    await userEvent.click(screen.getByRole('button', { name: 'Play trailer' }));
    expect(document.querySelector('.game-media-main video')).not.toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Theater view' }));
    expect(document.querySelector('.game-media-main video')).toBeNull();
    expect(dialog()!.querySelector('video')).not.toBeNull();

    await userEvent.click(within(dialog()!).getByRole('button', { name: 'Close viewer' }));
    expect(dialog()).toBeNull();
  });

  it('asks the browser for real fullscreen from the second button and gives it back on close', async () => {
    // jsdom без Fullscreen API: подменяем ровно то, чем пользуется просмотрщик.
    const requestFullscreen = jest.fn().mockResolvedValue(undefined);
    const exitFullscreen = jest.fn().mockResolvedValue(undefined);
    const proto = HTMLElement.prototype as { requestFullscreen?: () => Promise<void> };
    proto.requestFullscreen = requestFullscreen;
    (document as Document & { exitFullscreen: () => Promise<void> }).exitFullscreen = exitFullscreen;

    render(<GameMediaGallery media={media} title="Lanternfall" />);
    await userEvent.click(screen.getByRole('button', { name: 'Open fullscreen' }));
    const viewer = dialog()!;
    expect(requestFullscreen).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => viewer });
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(await within(viewer).findByRole('button', { name: 'Exit fullscreen' })).toBeInTheDocument();

    // В полном экране кнопка «театр» — шаг назад в театр, а не закрытие просмотра.
    await userEvent.click(within(viewer).getByRole('button', { name: 'Theater view' }));
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(dialog()).not.toBeNull();

    await userEvent.click(within(viewer).getByRole('button', { name: 'Close viewer' }));
    expect(exitFullscreen).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
    delete proto.requestFullscreen;
  });
});

describe('thumbnail scroller', () => {
  const layout = (scrollWidth: number, clientWidth: number) => {
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => scrollWidth });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => clientWidth });
  };

  afterEach(() => {
    // jsdom не считает раскладку: обе величины у него 0, вернём как было.
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 0 });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 0 });
  });

  it('is absent while every thumbnail fits', () => {
    layout(600, 600);
    render(<GameMediaGallery media={media} title="Lanternfall" />);
    expect(screen.queryByRole('button', { name: 'Scroll thumbnails right' })).toBeNull();
  });

  it('appears once the strip overflows and pages the strip', async () => {
    layout(1200, 400);
    render(<GameMediaGallery media={media} title="Lanternfall" />);
    const strip = document.querySelector<HTMLDivElement>('.thumbnail-strip')!;
    strip.scrollBy = jest.fn();

    const right = screen.getByRole('button', { name: 'Scroll thumbnails right' });
    expect(screen.getByRole('button', { name: 'Scroll thumbnails left' })).toBeDisabled();
    await userEvent.click(right);
    expect(strip.scrollBy).toHaveBeenCalledWith({ left: 320, behavior: 'smooth' });

    const thumb = document.querySelector<HTMLElement>('.thumbnail-track__thumb')!;
    expect(thumb.style.width).toBe(`${(400 / 1200) * 100}%`);
  });

  it('moves the thumb with the strip once per frame', async () => {
    layout(1200, 400);
    render(<GameMediaGallery media={media} title="Lanternfall" />);
    const strip = document.querySelector<HTMLDivElement>('.thumbnail-strip')!;
    const thumb = document.querySelector<HTMLElement>('.thumbnail-track__thumb')!;

    strip.scrollLeft = 300;
    fireEvent.scroll(strip);
    await act(() => new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined))));
    expect(thumb.style.left).toBe('25%');
    expect(screen.getByRole('button', { name: 'Scroll thumbnails right' })).toBeEnabled();

    // Лента 1200, окно 400: конец — на 800.
    strip.scrollLeft = 800;
    fireEvent.scroll(strip);
    fireEvent.scroll(strip);
    await act(() => new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined))));
    expect(thumb.style.left).toBe(`${(800 / 1200) * 100}%`);
    expect(screen.getByRole('button', { name: 'Scroll thumbnails right' })).toBeDisabled();
  });

  it('drags the strip one to one with the thumb', () => {
    layout(1200, 400);
    render(<GameMediaGallery media={media} title="Lanternfall" />);
    const strip = document.querySelector<HTMLDivElement>('.thumbnail-strip')!;
    const thumb = document.querySelector<HTMLElement>('.thumbnail-track__thumb')!;

    // Полоса шириной 400 (clientWidth из layout) на ленту в 1200: сдвиг бегунка на 50px — 150px ленты.
    fireEvent.pointerDown(thumb, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 150 });
    expect(strip.scrollLeft).toBe(150);
    fireEvent.pointerUp(window);
    fireEvent.pointerMove(window, { clientX: 300 });
    expect(strip.scrollLeft).toBe(150);
  });
});
