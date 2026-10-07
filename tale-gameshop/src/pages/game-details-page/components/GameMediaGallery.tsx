import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaItem } from '../../../types/game-details';
import SafeGameImage from '../../../components/common/SafeGameImage';
import MediaLightbox from './MediaLightbox';
import VideoPlayer, { preloadHlsPlayer } from '../../../components/common/VideoPlayer';
import { Chevron, FullscreenGlyph, PlayGlyph, TheaterGlyph } from '../../../components/common/MediaGlyphs';

/**
 * Что из положения ленты нужно React: есть ли прокрутка и упёрлась ли она в края (стрелки).
 * Само положение бегунка в состояние не попадает — см. measureStrip.
 */
type StripFlags = { overflow: boolean; atStart: boolean; atEnd: boolean };

/**
 * Галерея: одно большое окно + лента миниатюр. Порядок задаёт родитель (все видео первыми,
 * трейлеры впереди, потом скриншоты) — галерея его не меняет.
 *
 * Переключение — как в Steam: стрелки по бокам большого кадра (видны при наведении), клик по
 * миниатюре, стрелки клавиатуры. Когда миниатюр больше, чем влезает, под лентой появляется свой
 * скроллер: стрелки и полоса с бегунком, который можно тащить. Пока влезают все — ничего лишнего.
 * Клик по картинке открывает просмотр поверх страницы (MediaLightbox), где те же стрелки листают
 * подряд картинки и видео. В правом нижнем углу кадра — две кнопки, как в Steam: «театр» (тот же
 * просмотр поверх страницы) и полный экран (тот же просмотр, но через Fullscreen API браузера).
 */
const GameMediaGallery = ({
  media,
  title,
  onMediaPlay
}: {
  media: MediaItem[];
  title: string;
  onMediaPlay?: (item: MediaItem) => void;
}) => {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState(media[0]?.id ?? '');
  const [isPlaying, setIsPlaying] = useState(false);
  const [lightbox, setLightbox] = useState<'closed' | 'theater' | 'fullscreen'>('closed');
  const isLightboxOpen = lightbox !== 'closed';
  const thumbnailRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  /** Окно ленты в долях от всей её длины: где начинается и сколько занимает. */
  const geometryRef = useRef({ start: 0, size: 1 });
  const frameRef = useRef<number | null>(null);
  const [strip, setStrip] = useState<StripFlags>({ overflow: false, atStart: true, atEnd: true });

  const selectedIndex = Math.max(
    0,
    media.findIndex((item) => item.id === selectedId)
  );
  const selectedMedia = media[selectedIndex] ?? media[0];

  /**
   * Положение бегунка — прямо в его style, без React: раньше каждое событие прокрутки
   * (десятки в секунду) перерисовывало всю галерею с плеером и миниатюрами, и лента тормозила.
   * В состояние уходят только флаги, которые меняются редко.
   */
  const measureStrip = useCallback(() => {
    frameRef.current = null;
    const node = thumbnailRef.current;
    if (!node) return;
    const { scrollLeft, clientWidth, scrollWidth } = node;
    const overflow = scrollWidth > clientWidth + 1;
    const start = overflow ? scrollLeft / scrollWidth : 0;
    const size = overflow ? clientWidth / scrollWidth : 1;
    geometryRef.current = { start, size };
    const thumb = thumbRef.current;
    if (thumb) {
      thumb.style.left = `${start * 100}%`;
      thumb.style.width = `${size * 100}%`;
    }
    const atStart = start <= 0.001;
    const atEnd = start + size >= 0.999;
    setStrip((previous) =>
      previous.overflow === overflow && previous.atStart === atStart && previous.atEnd === atEnd
        ? previous
        : { overflow, atStart, atEnd }
    );
  }, []);

  /** Не чаще раза за кадр экрана: событий прокрутки бывает больше, чем кадров. */
  const updateStrip = useCallback(() => {
    if (frameRef.current === null) {
      frameRef.current = window.requestAnimationFrame(measureStrip);
    }
  }, [measureStrip]);

  // Трейлеры Steam — потоки HLS: плеер для них грузится отдельно. Прогреваем его, когда страница
  // уже показана и браузер свободен, — тогда play сразу качает ролик, а картинки первого экрана
  // не делят канал с библиотекой.
  const hasStream = media.some((item) => item.type === 'video' && /\.m3u8(\?|#|$)/i.test(item.url ?? ''));
  useEffect(() => {
    if (!hasStream) return;
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) {
      const handle = idle(preloadHlsPlayer, { timeout: 4000 });
      return () => (window as Window & { cancelIdleCallback?: (handle: number) => void }).cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(preloadHlsPlayer, 2000);
    return () => window.clearTimeout(timer);
  }, [hasStream]);

  useEffect(() => {
    measureStrip();
    const node = thumbnailRef.current;
    if (!node) return;
    node.addEventListener('scroll', updateStrip);
    window.addEventListener('resize', updateStrip);
    // Лента меняет ширину не только с окном: колонка галереи сама зависит от вёрстки страницы.
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateStrip) : null;
    observer?.observe(node);
    return () => {
      node.removeEventListener('scroll', updateStrip);
      window.removeEventListener('resize', updateStrip);
      observer?.disconnect();
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [media.length, measureStrip, updateStrip]);

  useEffect(() => {
    // Смена кадра останавливает видео и подтягивает активную миниатюру в окно ленты — только по
    // горизонтали, чтобы страница не дёргалась, если лента сейчас ниже экрана.
    setIsPlaying(false);
    const node = thumbnailRef.current;
    const active = node?.querySelector<HTMLElement>('.thumbnail-item.is-active');
    if (!node || !active) return;
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < node.scrollLeft || right > node.scrollLeft + node.clientWidth) {
      node.scrollTo?.({ left: left - (node.clientWidth - active.offsetWidth) / 2, behavior: 'smooth' });
    }
  }, [selectedId]);

  useEffect(() => {
    if (isPlaying && selectedMedia && selectedMedia.type === 'video') {
      onMediaPlay?.(selectedMedia);
    }
  }, [isPlaying, onMediaPlay, selectedMedia]);

  // По кругу: после последнего кадра — первый. Так стрелки никогда не бывают «мёртвыми».
  const select = (index: number) => {
    const count = media.length;
    if (count === 0) return;
    setSelectedId(media[((index % count) + count) % count].id);
  };

  const openLightbox = (mode: 'theater' | 'fullscreen' = 'theater') => {
    // Два плеера сразу не нужны: встроенное видео останавливается, играет то, что на весь экран.
    setIsPlaying(false);
    setLightbox(mode);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Открытый просмотр слушает клавиатуру сам (события портала всплывают сюда тоже — не дублируем).
    if (isLightboxOpen) return;
    // Стрелки внутри самого видео — перемотка плеера, не наше дело.
    if ((event.target as HTMLElement).tagName === 'VIDEO') return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      select(selectedIndex - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      select(selectedIndex + 1);
    }
  };

  const scrollStrip = (direction: -1 | 1) => {
    const node = thumbnailRef.current;
    if (!node) return;
    node.scrollBy?.({ left: direction * node.clientWidth * 0.8, behavior: 'smooth' });
  };

  // Полоса скроллера: бегунок тащится мышью или пальцем, клик по свободной части листает на экран.
  const handleTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const node = thumbnailRef.current;
    const track = trackRef.current;
    if (!node || !track) return;
    const target = event.target as HTMLElement;
    if (!target.classList.contains('thumbnail-track__thumb')) {
      const rect = track.getBoundingClientRect();
      const ratio = (event.clientX - rect.left) / Math.max(rect.width, 1);
      scrollStrip(ratio < geometryRef.current.start ? -1 : 1);
      return;
    }
    // Бегунок идёт за курсором один к одному: лента прокручивается мгновенно (плавная прокрутка
    // в CSS догоняла каждое движение мыши своей анимацией — бегунок «плыл» за рукой как на резинке),
    // указатель захвачен — курсор, ушедший с полосы, не теряет бегунок и не выделяет текст страницы.
    event.preventDefault();
    target.setPointerCapture?.(event.pointerId);
    track.classList.add('is-dragging');
    const startX = event.clientX;
    const startScroll = node.scrollLeft;
    const scale = node.scrollWidth / Math.max(track.clientWidth, 1);
    const move = (moveEvent: PointerEvent) => {
      node.scrollLeft = startScroll + (moveEvent.clientX - startX) * scale;
    };
    const stop = () => {
      track.classList.remove('is-dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  };

  // Заглушка для игры без медиа стоит после хуков, а не до них: раньше при появлении
  // первого скриншота у уже показанной галереи менялось число хуков и React падал.
  if (media.length === 0) {
    return (
      <div className="game-media-gallery">
        <div className="game-media-main card">
          <div className="game-media-image">
            <div className="media-placeholder">{t('media.none')}</div>
          </div>
        </div>
      </div>
    );
  }

  const { atStart, atEnd } = strip;

  return (
    <div className="game-media-gallery" onKeyDown={handleKeyDown}>
      <div className="game-media-main card">
        {selectedMedia?.type === 'video' ? (
          <div className="game-media-video">
            {isPlaying ? (
              // Свой плеер (см. VideoPlayer): без меню браузера, в стиле сайта. Полный экран — через просмотрщик.
              <VideoPlayer
                src={selectedMedia.url}
                poster={selectedMedia.posterUrl ?? selectedMedia.thumbUrl}
                title={t('media.trailer', { title })}
                autoPlay
                onFullscreen={() => openLightbox('fullscreen')}
                extraControls={
                  <button type="button" className="vp__btn" aria-label={t('media.theater')} title={t('media.theater')} onClick={() => openLightbox('theater')}>
                    <TheaterGlyph />
                  </button>
                }
              />
            ) : (
              <button
                type="button"
                className="video-poster"
                onClick={() => setIsPlaying(true)}
                aria-label={t('media.playTrailer')}
              >
                <SafeGameImage
                  src={selectedMedia.posterUrl ?? selectedMedia.thumbUrl}
                  gameTitle={title}
                  fallbackAlt={t('media.trailerPoster')}
                  fetchPriority="high"
                  decoding="async"
                />
                <span className="video-play" aria-hidden="true">
                  <PlayGlyph size={28} />
                </span>
              </button>
            )}
          </div>
        ) : (
          <div className="game-media-image">
            {/* Картинка — кнопка: клик открывает её на весь экран. */}
            <button type="button" className="game-media-zoom" onClick={() => openLightbox()} aria-label={t('media.openFullscreen')}>
              <SafeGameImage src={selectedMedia?.url} gameTitle={title} fetchPriority="high" decoding="async" />
            </button>
          </div>
        )}
        {/* Пока ролик играет, кинотеатр и полный экран — в панели самого плеера: кнопки поверх кадра
            легли бы на его панель (качество, полный экран) и перехватывали бы клики. */}
        {!(selectedMedia?.type === 'video' && isPlaying) && (
          <div className="game-media-tools">
            <button type="button" className="game-media-tool" aria-label={t('media.theater')} title={t('media.theater')} onClick={() => openLightbox('theater')}>
              <TheaterGlyph />
            </button>
            <button type="button" className="game-media-tool" aria-label={t('media.openFullscreenTool')} title={t('media.fullscreen')} onClick={() => openLightbox('fullscreen')}>
              <FullscreenGlyph />
            </button>
          </div>
        )}
        {media.length > 1 && (
          <>
            <button
              type="button"
              className="game-media-arrow is-prev"
              aria-label={t('media.previous')}
              onClick={() => select(selectedIndex - 1)}
            >
              <Chevron direction="left" />
            </button>
            <button
              type="button"
              className="game-media-arrow is-next"
              aria-label={t('media.next')}
              onClick={() => select(selectedIndex + 1)}
            >
              <Chevron direction="right" />
            </button>
          </>
        )}
      </div>
      <div className="thumbnail-strip-wrapper">
        <div className="thumbnail-strip" ref={thumbnailRef}>
          {media.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`thumbnail-item ${selectedId === item.id ? 'is-active' : ''}`}
              aria-label={t(item.type === 'video' ? 'media.videoNof' : 'media.screenshotNof', { index: index + 1, count: media.length })}
              aria-pressed={selectedId === item.id}
              onClick={() => setSelectedId(item.id)}
            >
              <SafeGameImage src={item.thumbUrl} gameTitle={title} fallbackAlt={t('media.preview')} loading="lazy" fetchPriority="low" decoding="async" />
              {item.type === 'video' && (
                // Только кнопка play, без длительности: в ленте она шумит, а в Steam её тоже нет.
                <span className="thumbnail-video" aria-hidden="true">
                  <span className="play-badge">
                    <PlayGlyph size={16} />
                  </span>
                </span>
              )}
            </button>
          ))}
        </div>
        {strip.overflow && (
          <div className="thumbnail-scroller">
            <button
              className="thumbnail-nav"
              type="button"
              aria-label={t('media.scrollLeft')}
              disabled={atStart}
              onClick={() => scrollStrip(-1)}
            >
              <Chevron direction="left" />
            </button>
            <div className="thumbnail-track" ref={trackRef} onPointerDown={handleTrackPointerDown} aria-hidden="true">
              <div
                ref={thumbRef}
                className="thumbnail-track__thumb"
                style={{ left: `${geometryRef.current.start * 100}%`, width: `${geometryRef.current.size * 100}%` }}
              />
            </div>
            <button
              className="thumbnail-nav"
              type="button"
              aria-label={t('media.scrollRight')}
              disabled={atEnd}
              onClick={() => scrollStrip(1)}
            >
              <Chevron direction="right" />
            </button>
          </div>
        )}
      </div>
      {isLightboxOpen && (
        <MediaLightbox
          media={media}
          index={selectedIndex}
          title={title}
          fullscreen={lightbox === 'fullscreen'}
          onNavigate={select}
          onClose={() => setLightbox('closed')}
          onMediaPlay={onMediaPlay}
        />
      )}
    </div>
  );
};

export default GameMediaGallery;
