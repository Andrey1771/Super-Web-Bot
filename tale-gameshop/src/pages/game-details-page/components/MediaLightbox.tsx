import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import type { MediaItem } from '../../../types/game-details';
import SafeGameImage from '../../../components/common/SafeGameImage';
import VideoPlayer from '../../../components/common/VideoPlayer';
import { Chevron, CloseGlyph, CompressGlyph, FullscreenGlyph, TheaterExitGlyph, TheaterGlyph } from '../../../components/common/MediaGlyphs';

type MediaLightboxProps = {
  media: MediaItem[];
  index: number;
  title: string;
  /** Открыть сразу на весь экран (Fullscreen API), а не только поверх страницы. */
  fullscreen?: boolean;
  onNavigate: (index: number) => void;
  onClose: () => void;
  onMediaPlay?: (item: MediaItem) => void;
};

/**
 * Просмотр галереи — как в Steam, в двух режимах. «Театр»: тёмный фон поверх страницы, кадр во
 * всё окно. Полный экран: то же самое, но через Fullscreen API браузера.
 *
 * Две кнопки режимов стоят в правом нижнем углу самого кадра, как у Steam: «театр» и «полный
 * экран». В театре первая закрывает просмотр (вернуться на страницу), в полном экране — выходит
 * из него обратно в театр. У видео те же две кнопки живут в панели плеера. Стрелки по бокам
 * остаются и листают подряд и картинки, и видео; видео играет прямо здесь. Закрывается крестиком,
 * Esc и кликом по фону (в полном экране первый Esc отдаёт браузер, второй закрывает просмотр).
 * Рисуется порталом в body.
 */
const MediaLightbox = ({ media, index, title, fullscreen = false, onNavigate, onClose, onMediaPlay }: MediaLightboxProps) => {
  const { t } = useTranslation();
  const item = media[index];
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [isFullscreen, setFullscreen] = useState(false);
  const fullscreenSupported = typeof document !== 'undefined' && typeof document.documentElement?.requestFullscreen === 'function';

  const enterFullscreen = () => rootRef.current?.requestFullscreen?.().catch(() => undefined);
  const exitFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => undefined);
    }
  };
  const toggleFullscreen = () => (isFullscreen ? exitFullscreen() : enterFullscreen());
  // «Театр» в полном экране — шаг назад в театр; в театре — на страницу.
  const theaterButton = () => (isFullscreen ? exitFullscreen() : onClose());

  useEffect(() => {
    // Узел запоминаем сразу: к моменту cleanup React уже обнулил ref, а сравнивать надо с тем же элементом.
    const node = rootRef.current;
    // Клик по кнопке только что был — браузер ещё считает это действием пользователя и пускает в полный экран.
    if (fullscreen) enterFullscreen();
    const handleChange = () => setFullscreen(document.fullscreenElement === node);
    document.addEventListener('fullscreenchange', handleChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
      // Закрыли просмотр, пока он был на весь экран — возвращаем браузеру окно.
      if (node && document.fullscreenElement === node) {
        document.exitFullscreen?.().catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const count = media.length;
  const go = (next: number) => onNavigate(((next % count) + count) % count);

  useEffect(() => {
    // Пока открыт просмотр, страница под ним не крутится, а клавиатура работает на него.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        go(index - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        go(index + 1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, count, onClose]);

  useEffect(() => {
    if (item?.type === 'video') {
      onMediaPlay?.(item);
    }
  }, [item, onMediaPlay]);

  if (!item || typeof document === 'undefined') return null;

  const theaterLabel = isFullscreen ? t('media.theater') : t('media.exitTheater');
  const fullscreenLabel = isFullscreen ? t('media.exitFullscreen') : t('media.fullscreen');

  // Кнопка «театр» — одна и та же и на картинке, и в панели плеера (className задаёт, где она живёт).
  const theaterControl = (className: string) => (
    <button type="button" className={className} aria-label={theaterLabel} title={theaterLabel} onClick={theaterButton}>
      {isFullscreen ? <TheaterGlyph /> : <TheaterExitGlyph />}
    </button>
  );

  return createPortal(
    <div
      className="media-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={t('media.viewer', { title })}
      ref={rootRef}
      onClick={(event) => {
        // Клик по фону закрывает; клик по кадру, стрелкам и плееру — нет.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button type="button" className="media-lightbox__close" aria-label={t('media.closeViewer')} onClick={onClose} ref={closeRef}>
        <CloseGlyph />
      </button>

      {count > 1 && (
        <button type="button" className="media-lightbox__arrow is-prev" aria-label={t('media.previous')} onClick={() => go(index - 1)}>
          <Chevron direction="left" size={26} />
        </button>
      )}

      <figure className="media-lightbox__stage" key={item.id}>
        {/* Рамка нужна, чтобы кнопки режимов стояли в углу самого кадра, а не экрана. */}
        <div className="media-lightbox__frame">
          {item.type === 'video' ? (
            <VideoPlayer
              src={item.url}
              poster={item.posterUrl ?? item.thumbUrl}
              title={t('media.video', { title })}
              autoPlay
              extraControls={theaterControl('vp__btn')}
              onFullscreen={fullscreenSupported ? toggleFullscreen : undefined}
              isFullscreen={isFullscreen}
            />
          ) : (
            <>
              <SafeGameImage src={item.url} gameTitle={title} fallbackAlt={item.title ?? t('media.screenshot')} />
              <div className="media-lightbox__tools">
                {theaterControl('media-lightbox__tool')}
                {fullscreenSupported && (
                  <button
                    type="button"
                    className="media-lightbox__tool"
                    aria-label={fullscreenLabel}
                    title={fullscreenLabel}
                    onClick={toggleFullscreen}
                  >
                    {isFullscreen ? <CompressGlyph /> : <FullscreenGlyph />}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        {(item.title || item.caption) && (
          <figcaption className="media-lightbox__caption">
            {item.title && <b>{item.title}</b>}
            {item.caption && <span>{item.caption}</span>}
          </figcaption>
        )}
      </figure>

      {count > 1 && (
        <button type="button" className="media-lightbox__arrow is-next" aria-label={t('media.next')} onClick={() => go(index + 1)}>
          <Chevron direction="right" size={26} />
        </button>
      )}

      <div className="media-lightbox__counter" aria-live="polite">
        {index + 1} / {count}
      </div>
    </div>,
    document.body
  );
};

export default MediaLightbox;
