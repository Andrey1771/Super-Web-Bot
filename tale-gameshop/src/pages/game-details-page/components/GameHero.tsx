import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { catalogHref } from '../../../utils/software';
import { kindLabels } from '../../../utils/product-kind-labels';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faAndroid, faApple, faLinux, faPlaystation, faWindows, faXbox } from '@fortawesome/free-brands-svg-icons';
import { faCalendarDays, faGamepad, faGlobe, faUserShield } from '@fortawesome/free-solid-svg-icons';
import type { GameDetails, MediaItem } from '../../../types/game-details';
import { formatReleaseDate } from '../../../utils/format-release-date';
import { slugify } from '../../../utils/slugify';
import GameMediaGallery from './GameMediaGallery';
import TitleRating from './TitleRating';
import type { RatingSummaryView } from './shared';
import { controllerSupportLabel } from './shared';

const PLATFORM_ICONS = [
  { key: 'windows', label: 'Windows', icon: faWindows },
  { key: 'mac', label: 'macOS', icon: faApple },
  { key: 'linux', label: 'Linux', icon: faLinux },
  { key: 'playStation', label: 'PlayStation', icon: faPlaystation },
  { key: 'xbox', label: 'Xbox', icon: faXbox },
  { key: 'android', label: 'Android', icon: faAndroid },
  { key: 'ios', label: 'iOS', icon: faApple }
] as const;

/**
 * Порядок медиа в галерее — как в Steam: сначала все видео (помеченные трейлерами впереди),
 * потом скриншоты; внутри каждой группы — порядок загрузки. Раньше непомеченное видео
 * оставалось среди картинок и могло оказаться последним в ленте. Без галереи — обложка
 * как единственный кадр.
 */
export const orderMedia = (game: GameDetails): MediaItem[] => {
  const gallery = game.gallery?.length ? [...game.gallery] : [];
  if (gallery.length === 0) {
    return game.cover?.url ? [{ id: 'cover', type: 'image', url: game.cover.url, thumbUrl: game.cover.url }] : [];
  }
  const byOrder = (a: MediaItem, b: MediaItem) => (a.order ?? 0) - (b.order ?? 0);
  const trailers = gallery.filter((item) => item.type === 'video' && item.isTrailer).sort(byOrder);
  const videos = gallery.filter((item) => item.type === 'video' && !item.isTrailer).sort(byOrder);
  const images = gallery.filter((item) => item.type !== 'video').sort(byOrder);
  return [...trailers, ...videos, ...images];
};

type GameHeroProps = {
  game: GameDetails;
  media: MediaItem[];
  /** Рейтинг под названием (как у Epic): звёзды, оценка, число отзывов, «Top rated». Без него — только заголовок. */
  rating?: { summary: RatingSummaryView; isTopRated?: boolean; onClick?: () => void };
  onMediaPlay?: (item: MediaItem) => void;
  /** Карточка покупки — рендерится справа, на широких экранах прилипает при скролле. */
  purchase: React.ReactNode;
  /** Описание игры. Идёт последним в левой колонке: без него правая колонка обрывалась
   *  сразу за карточкой покупки, оставляя рядом пустую полосу во всю высоту. */
  about?: React.ReactNode;
  /** ПО: «Works on» вместо платформ, «Vendor» вместо разработчика, без контроллера и жанров. */
  software?: boolean;
  /** Подписи жанров и тегов на языке сайта, по позициям game.genres / game.tags. */
  genreLabels?: string[];
  tagLabels?: string[];
};

/**
 * Хиро страницы, две колонки. Слева всё про игру: заголовок, галерея, строка фактов, теги.
 * Справа — только покупка. Раньше колонок было три, и медиа получало 38% ширины против 54%
 * у двух текстовых колонок; факты переехали из колонки в горизонтальную строку под галереей,
 * и освободившаяся ширина ушла галерее.
 */
const GameHero = ({ game, media, rating, onMediaPlay, purchase, about, software = false, genreLabels, tagLabels }: GameHeroProps) => {
  const { t } = useTranslation();
  const labels = kindLabels(software);
  const platforms = PLATFORM_ICONS.filter(({ key }) => Boolean((game.platforms as unknown as Record<string, boolean | undefined>)?.[key]));
  const releaseDate = formatReleaseDate(game.releaseDate);
  const languagesCount = game.languages?.text?.length ?? 0;

  return (
    <section className="gd-hero">
      {/* Порядок внутри левой колонки: кто это → как выглядит → чем характеризуется.
          Факты вынесены из отдельной колонки в горизонтальную строку под галереей:
          плоскому списку пар «ключ — значение» колонка не нужна, а освободившаяся
          ширина отдана медиа — главному содержимому страницы магазина. */}
      {/* Заголовок — над обеими колонками, а не внутри левой. Внутри он продавливал галерею
          на 154 px вниз, и она стартовала заметно ниже карточки покупки. Вынесенный наверх,
          он относится ко всей странице, а медиа и покупка начинаются на одной высоте. */}
      {/* Над заголовком ничего нет — как у Steam, Epic и GOG. Раньше здесь стояли плашки «Top rated»,
          «-80%», «Steam key»: они спорили с названием за внимание и дублировали карточку покупки
          (скидка, площадка ключа). Рейтинг — под названием, как у Epic: он про игру, а не про покупку,
          и в карточке покупки ему было тесно. */}
      <div className="gd-hero__head">
        <h1 className="game-title">{game.title}</h1>
        {game.tagline && <p className="game-tagline">{game.tagline}</p>}
        {rating && <TitleRating summary={rating.summary} isTopRated={rating.isTopRated} onClick={rating.onClick} />}
      </div>

      <div className="gd-hero__main">
        <div className="gd-hero__media">
          <GameMediaGallery media={media} title={game.title} onMediaPlay={onMediaPlay} />
        </div>

        <dl className="gd-facts">
          {platforms.length > 0 && (
            <div className="gd-fact">
              <dt>{labels.platforms}</dt>
              <dd className="gd-fact__platforms">
                {platforms.map((platform) => (
                  <span key={platform.key} className="platform-chip" title={platform.label}>
                    <FontAwesomeIcon icon={platform.icon} />
                    <span>{platform.label}</span>
                  </span>
                ))}
              </dd>
            </div>
          )}
          {releaseDate && (
            <div className="gd-fact">
              <dt>
                <FontAwesomeIcon icon={faCalendarDays} /> {t('product.release')}
              </dt>
              <dd>{releaseDate}</dd>
            </div>
          )}
          {game.developer?.name && (
            <div className="gd-fact">
              <dt>{labels.developer}</dt>
              <dd>{game.developer.name}</dd>
            </div>
          )}
          {game.publisher?.name && game.publisher.name !== game.developer?.name && (
            <div className="gd-fact">
              <dt>{t('product.publisher')}</dt>
              <dd>{game.publisher.name}</dd>
            </div>
          )}
          {game.ageRating?.label && (
            <div className="gd-fact">
              <dt>
                <FontAwesomeIcon icon={faUserShield} /> {t('product.ageRating')}
              </dt>
              <dd>
                {game.ageRating.iconUrl ? <img className="gd-age-icon" src={game.ageRating.iconUrl} alt="" /> : null}
                {game.ageRating.system ? `${game.ageRating.system} ` : ''}
                {game.ageRating.label}
              </dd>
            </div>
          )}
          {languagesCount > 0 && (
            <div className="gd-fact">
              <dt>
                <FontAwesomeIcon icon={faGlobe} /> {t('product.languages')}
              </dt>
              <dd>
                {languagesCount > 2 ? `${game.languages.text.slice(0, 2).join(', ')} ${t('product.moreLanguages', { count: languagesCount - 2 })}` : game.languages.text.join(', ')}
              </dd>
            </div>
          )}
          {!software && (
            <div className="gd-fact">
              <dt>
                <FontAwesomeIcon icon={faGamepad} /> {t('product.controller')}
              </dt>
              <dd>{controllerSupportLabel(game.controllerSupport)}</dd>
            </div>
          )}
        </dl>

        {(game.genres?.length > 0 || game.tags?.length > 0) && (
          <div className="gd-chips">
            {/* Подпись — на языке сайта, адрес и фильтр — по английскому значению. */}
            {!software && game.genres?.map((genre, index) => (
              <Link key={`g-${genre}`} to={`/games/category/${slugify(genre)}`} className="chip chip--link">
                {genreLabels?.[index] ?? genre}
              </Link>
            ))}
            {game.tags
              ?.map((tag, index) => ({ tag, label: tagLabels?.[index] ?? tag }))
              .filter(({ tag }) => !game.genres?.includes(tag))
              .slice(0, 8)
              .map(({ tag, label }) => (
                <Link key={`t-${tag}`} to={catalogHref(software, { tag })} className="chip chip--link chip--tag">
                  #{label}
                </Link>
              ))}
          </div>
        )}

        {about}
      </div>

      <aside className="gd-hero__buy">{purchase}</aside>
    </section>
  );
};

export default GameHero;
