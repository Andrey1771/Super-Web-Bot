import type { GameDetails, MediaItem } from '../../../types/game-details';
import { orderMedia } from './GameHero';

/** Порядок галереи — как в Steam: трейлеры, потом остальные видео, потом скриншоты; внутри групп — по order. */

const item = (id: string, type: MediaItem['type'], order: number, isTrailer = false): MediaItem => ({
  id,
  type,
  url: `/${id}`,
  thumbUrl: `/${id}-thumb`,
  order,
  isTrailer
});

const game = (gallery: MediaItem[], cover?: string) =>
  ({ gallery, cover: cover ? { url: cover, alt: '' } : undefined } as unknown as GameDetails);

it('puts every video before the screenshots, trailers first', () => {
  const ordered = orderMedia(
    game([
      item('shot-late', 'image', 40),
      item('commentary', 'video', 60),
      item('shot-early', 'image', 10),
      item('launch', 'video', 10, true),
      item('gameplay', 'video', 20, true)
    ])
  );

  expect(ordered.map((media) => media.id)).toEqual(['launch', 'gameplay', 'commentary', 'shot-early', 'shot-late']);
});

it('falls back to the cover when there is no gallery', () => {
  expect(orderMedia(game([], '/cover.jpg')).map((media) => media.url)).toEqual(['/cover.jpg']);
  expect(orderMedia(game([]))).toEqual([]);
});
