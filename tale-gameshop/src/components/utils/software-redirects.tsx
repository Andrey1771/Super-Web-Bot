import React from 'react';
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import TaleGameshopGameList from '../game-list-page/game-list-page';
import { GAMES_TYPE_VALUE, SOFTWARE_TYPE_PARAM, SOFTWARE_TYPE_VALUE, softwareCatalogPath } from '../../utils/software';

/**
 * Отдельного раздела /software больше нет: софт — режим каталога /games (`?type=software`), товар — /games/{slug}.
 * Старые адреса (закладки, внешние ссылки, письма, индекс поисковиков) перенаправляются сюда без потери
 * фильтров из строки запроса. Сервер отдаёт на них 301 (nginx), это — страховка для переходов внутри SPA.
 */

/** Перенос параметров старого адреса (?onSale=1, ?terms=12…) в новый. */
const withQuery = (target: string, search: string) => {
  const extra = new URLSearchParams(search);
  if (Array.from(extra.keys()).length === 0) return target;
  const [path, query = ''] = target.split('?');
  const merged = new URLSearchParams(query);
  extra.forEach((value, key) => merged.set(key, value));
  return `${path}?${merged.toString()}`;
};

/** /software и /software/category/{tag} → каталог в режиме софта. */
export const SoftwareCatalogRedirect: React.FC = () => {
  const { categorySlug } = useParams<{ categorySlug: string }>();
  const { search } = useLocation();
  return <Navigate to={withQuery(softwareCatalogPath(categorySlug), search)} replace />;
};

/** /software/{slug} → /games/{slug}. */
export const SoftwareProductRedirect: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { search, hash } = useLocation();
  return <Navigate to={`/games/${slug ?? ''}${search}${hash}`} replace />;
};

/**
 * Каталог /games: весь товар по умолчанию, `?type=games` — только игры, `?type=software` — только софт.
 *
 * Без key по типу: пересборка компонента при переключении галочки сбрасывала выдачу и фасеты в пустые,
 * сайдбар и сетка схлопывались в заглушки и страница прыгала. Теперь прежняя выдача стоит, пока не придёт
 * новая, — как при любом другом фильтре; устаревший ответ каталог и так отбрасывает.
 */
export const StoreCatalog: React.FC = () => {
  const [searchParams] = useSearchParams();
  const type = searchParams.get(SOFTWARE_TYPE_PARAM);
  const kind = type === SOFTWARE_TYPE_VALUE ? 'software' : type === GAMES_TYPE_VALUE ? 'game' : 'all';
  return <TaleGameshopGameList kind={kind} />;
};
