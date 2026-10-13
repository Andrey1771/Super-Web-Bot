import { getGameGenres, type GameGenre } from '../api/catalogApi';
import { slugify } from '../utils/slugify';
import { createCachedResource } from './use-cached-resource';

/** Подвал и страница жанра спрашивают одно и то же, а жанры меняются редко — один общий ответ. */
const useGenresResource = createCachedResource(getGameGenres, [] as GameGenre[]);

/** Жанры игр в порядке настроек, с числом опубликованных игр. Пока не загрузились — пустой список. */
export const useGameGenres = () => {
  const { data, loaded } = useGenresResource();
  return { genres: data, loaded };
};

/**
 * Жанр по адресу страницы. Адрес — код жанра, но принимаем и slug названия: так строятся ссылки из названий
 * (теги на странице товара), и сервер отвечает на оба.
 */
export const findGenreBySlug = (genres: GameGenre[], slug: string | undefined) =>
  slug ? genres.find((genre) => genre.tag === slug || slugify(genre.title) === slug) : undefined;
