import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './video-player.css';
import { clamp } from "../../utils/clamp";

/**
 * Свой видеоплеер в стиле магазина — как у Steam и GOG: браузерный <video> без родных контролов,
 * а вся панель управления нарисована нами. Так плеер выглядит одинаково в любом браузере, у него
 * нет меню со «Скачать», «Скорость» и «Картинка в картинке», а стиль — наш.
 *
 * Что умеет: play/pause кликом по кадру, кнопкой, пробелом или K; полоса прогресса с буфером,
 * перемоткой мышью, пальцем и стрелками (только когда полоса в фокусе — иначе стрелки нужны
 * галерее для переключения кадров); громкость с mute (M), запоминается между роликами; полный
 * экран (F) — если родитель дал, куда его открывать; автозапуск с честным откатом в паузу, когда
 * браузер не пускает звук без клика; загрузка, конец ролика и ошибка показываются явно.
 *
 * Панель прячется через IDLE_HIDE_MS бездействия во время воспроизведения и возвращается по движению
 * мыши, касанию или фокусу; на паузе видна всегда.
 */
export type VideoPlayerProps = {
  src: string;
  poster?: string | null;
  /** Название ролика для читалок экрана и подписи кнопок. */
  title: string;
  autoPlay?: boolean;
  /** Ролик реально пошёл (не просто нажали play): для аналитики. */
  onPlay?: () => void;
  onEnded?: () => void;
  /** Куда открывать полный экран решает родитель; без обработчика кнопки нет. */
  onFullscreen?: () => void;
  isFullscreen?: boolean;
  /** Кнопки родителя в правой части панели, перед полным экраном (например, «театр»). */
  extraControls?: React.ReactNode;
  className?: string;
};

export const VIDEO_VOLUME_STORAGE_KEY = 'taleshop:video-volume';
export const IDLE_HIDE_MS = 2500;
export const SEEK_STEP_SEC = 5;

type Status = 'idle' | 'playing' | 'paused' | 'ended' | 'error';

const pad = (value: number) => value.toString().padStart(2, '0');

/** 0:07, 1:19, 1:02:03 — как в плеерах, без миллисекунд и без ведущих нулей у минут. */
export const formatTime = (seconds: number) => {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
};

type StoredVolume = { volume: number; muted: boolean };

// localStorage может быть недоступен (приватный режим, запрет cookie) — тогда громкость просто не запоминается.
const readStoredVolume = (): StoredVolume | null => {
  try {
    const raw = window.localStorage.getItem(VIDEO_VOLUME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredVolume>;
    if (typeof parsed.volume !== 'number' || !Number.isFinite(parsed.volume)) return null;
    return { volume: clamp(parsed.volume, 0, 1), muted: Boolean(parsed.muted) };
  } catch {
    return null;
  }
};

const writeStoredVolume = (value: StoredVolume) => {
  try {
    window.localStorage.setItem(VIDEO_VOLUME_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Молча: запоминание громкости — удобство, а не функция.
  }
};

const Icon = ({ name }: { name: 'play' | 'pause' | 'replay' | 'volume' | 'volume-low' | 'muted' | 'expand' | 'compress' }) => {
  const paths: Record<typeof name, React.ReactNode> = {
    play: <path d="M8 5v14l11-7z" fill="currentColor" />,
    pause: <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" />,
    replay: (
      <path
        d="M12 5a7 7 0 1 1-6.3 4M12 5H8m4 0V1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    volume: (
      <>
        <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" />
        <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
    'volume-low': (
      <>
        <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" />
        <path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
    muted: (
      <>
        <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" />
        <path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
    expand: (
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    ),
    compress: (
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    )
  };
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
};

const VideoPlayer = ({
  src,
  poster,
  title,
  autoPlay = false,
  onPlay,
  onEnded,
  onFullscreen,
  isFullscreen = false,
  extraControls,
  className
}: VideoPlayerProps) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const idleTimer = useRef<number | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [waiting, setWaiting] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  const playing = status === 'playing';

  // ---- панель: показать, спрятать через паузу бездействия ----
  const clearIdleTimer = () => {
    if (idleTimer.current !== null) {
      window.clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  };

  const wakeControls = useCallback(() => {
    setControlsVisible(true);
    clearIdleTimer();
    idleTimer.current = window.setTimeout(() => setControlsVisible(false), IDLE_HIDE_MS);
  }, []);

  useEffect(() => {
    if (!playing) {
      // На паузе, в конце и при ошибке панель нужна всегда.
      clearIdleTimer();
      setControlsVisible(true);
      return;
    }
    wakeControls();
    return clearIdleTimer;
  }, [playing, wakeControls]);

  // ---- громкость: применить запомненную при первом рендере ----
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const stored = readStoredVolume();
    if (stored) {
      video.volume = stored.volume;
      video.muted = stored.muted;
      setVolume(stored.volume);
      setMuted(stored.muted);
    }
  }, []);

  // ---- автозапуск ----
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !autoPlay) return;
    // Браузер может не пустить (нет недавнего клика): честно остаёмся на паузе с большой кнопкой play,
    // а не гоняем ролик без звука.
    video.play?.()?.catch(() => setStatus('paused'));
  }, [autoPlay, src]);

  // ---- управление ----
  const play = () => {
    const video = videoRef.current;
    if (!video) return;
    if (status === 'error') {
      video.load?.();
    }
    video.play?.()?.catch(() => setStatus('paused'));
  };

  const pause = () => videoRef.current?.pause?.();

  const togglePlay = () => (playing ? pause() : play());

  const seekTo = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = clamp(seconds, 0, duration || 0);
    video.currentTime = next;
    setCurrentTime(next);
  };

  const seekBy = (delta: number) => seekTo(currentTime + delta);

  const applyVolume = (nextVolume: number, nextMuted: boolean) => {
    const video = videoRef.current;
    const level = clamp(nextVolume, 0, 1);
    if (video) {
      video.volume = level;
      video.muted = nextMuted;
    }
    setVolume(level);
    setMuted(nextMuted);
    writeStoredVolume({ volume: level, muted: nextMuted });
  };

  const toggleMute = () => {
    // Снять mute при нулевой громкости — вернуть слышимый уровень, иначе кнопка «ничего не делает».
    if (muted || volume === 0) {
      applyVolume(volume === 0 ? 0.5 : volume, false);
    } else {
      applyVolume(volume, true);
    }
  };

  // ---- полоса прогресса ----
  const ratioFromPointer = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
  };

  const handleTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!duration) return;
    event.preventDefault();
    const track = trackRef.current;
    track?.setPointerCapture?.(event.pointerId);
    setScrubbing(true);
    seekTo(ratioFromPointer(event.clientX) * duration);
  };

  const handleTrackPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const ratio = ratioFromPointer(event.clientX);
    setHoverRatio(ratio);
    if (scrubbing && duration) {
      seekTo(ratio * duration);
    }
  };

  const handleTrackPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    trackRef.current?.releasePointerCapture?.(event.pointerId);
    setScrubbing(false);
  };

  const handleTrackKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Стрелки здесь — перемотка. Наружу не отдаём: у галереи и просмотрщика те же клавиши листают кадры.
    const handled: Record<string, () => void> = {
      ArrowLeft: () => seekBy(-SEEK_STEP_SEC),
      ArrowRight: () => seekBy(SEEK_STEP_SEC),
      ArrowDown: () => seekBy(-SEEK_STEP_SEC),
      ArrowUp: () => seekBy(SEEK_STEP_SEC),
      Home: () => seekTo(0),
      End: () => seekTo(duration)
    };
    const action = handled[event.key];
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  };

  // ---- клавиатура плеера: без стрелок, они за галереей ----
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    // Внутри ползунка громкости стрелки — его собственные; пробел на кнопке — её собственный клик.
    if (target.tagName === 'INPUT') return;
    const key = event.key.toLowerCase();
    if (event.key === ' ' || key === 'k') {
      if (target.tagName === 'BUTTON' && event.key === ' ') return;
      event.preventDefault();
      event.stopPropagation();
      togglePlay();
    } else if (key === 'm') {
      event.preventDefault();
      event.stopPropagation();
      toggleMute();
    } else if (key === 'f' && onFullscreen) {
      event.preventDefault();
      event.stopPropagation();
      onFullscreen();
    }
  };

  // ---- события <video> ----
  const syncBuffered = (video: HTMLVideoElement) => {
    const ranges = video.buffered;
    if (!ranges || ranges.length === 0) {
      setBuffered(0);
      return;
    }
    // Диапазон, в котором сейчас стоит курсор, иначе последний: столько уже скачано впереди.
    let end = ranges.end(ranges.length - 1);
    for (let i = 0; i < ranges.length; i++) {
      if (ranges.start(i) <= video.currentTime && video.currentTime <= ranges.end(i)) {
        end = ranges.end(i);
        break;
      }
    }
    setBuffered(end);
  };

  const showBigButton = status !== 'playing' && status !== 'error';
  const bigButtonLabel = status === 'ended' ? t('video.replay') : t('video.play');
  const played = duration > 0 ? clamp(currentTime / duration, 0, 1) : 0;
  const loaded = duration > 0 ? clamp(buffered / duration, 0, 1) : 0;
  const effectiveMuted = muted || volume === 0;
  const volumeIcon = effectiveMuted ? 'muted' : volume < 0.5 ? 'volume-low' : 'volume';
  const idle = playing && !controlsVisible && !scrubbing;

  return (
    <div
      className={`vp${idle ? ' is-idle' : ''}${className ? ` ${className}` : ''}`}
      role="region"
      aria-label={t('video.player', { title })}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerMove={wakeControls}
      onPointerDown={wakeControls}
      onFocus={wakeControls}
      onContextMenu={(event) => event.preventDefault()}
    >
      {/* Без controls: панель ниже — своя. playsInline — на iPhone ролик играет в кадре, а не уводит в свой плеер. */}
      <video
        ref={videoRef}
        className="vp__video"
        src={src}
        poster={poster ?? undefined}
        playsInline
        preload="metadata"
        aria-label={title}
        onClick={togglePlay}
        onPlay={() => {
          setStatus('playing');
          onPlay?.();
        }}
        onPause={() => setStatus((current) => (current === 'ended' ? current : 'paused'))}
        onEnded={() => {
          setStatus('ended');
          onEnded?.();
        }}
        onTimeUpdate={(event) => {
          if (!scrubbing) setCurrentTime(event.currentTarget.currentTime);
        }}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onProgress={(event) => syncBuffered(event.currentTarget)}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onSeeked={() => setWaiting(false)}
        onError={() => {
          setStatus('error');
          setWaiting(false);
        }}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume);
          setMuted(event.currentTarget.muted);
        }}
      />

      {/* Большая кнопка — визуальная подсказка; для клавиатуры и читалок есть кнопка в панели, поэтому эта скрыта от них. */}
      {showBigButton && (
        <button type="button" className="vp__big-play" aria-hidden="true" tabIndex={-1} onClick={togglePlay}>
          <Icon name={status === 'ended' ? 'replay' : 'play'} />
        </button>
      )}

      {waiting && playing && <span className="vp__spinner" role="status" aria-label={t('video.loading')} />}

      {status === 'error' && (
        <div className="vp__error" role="alert">
          <p>{t('video.failed')}</p>
          <button type="button" className="vp__retry" onClick={play}>
            {t('common.tryAgain')}
          </button>
        </div>
      )}

      <div className="vp__controls" aria-hidden={idle}>
        <div
          ref={trackRef}
          className="vp__track"
          role="slider"
          tabIndex={0}
          aria-label={t('video.seek')}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
          onPointerDown={handleTrackPointerDown}
          onPointerMove={handleTrackPointerMove}
          onPointerUp={handleTrackPointerUp}
          onPointerCancel={handleTrackPointerUp}
          onPointerLeave={() => setHoverRatio(null)}
          onKeyDown={handleTrackKeyDown}
        >
          <span className="vp__track-loaded" style={{ width: `${loaded * 100}%` }} />
          <span className="vp__track-played" style={{ width: `${played * 100}%` }} />
          <span className="vp__track-thumb" style={{ left: `${played * 100}%` }} />
          {hoverRatio !== null && duration > 0 && (
            <span className="vp__track-tip" style={{ left: `${hoverRatio * 100}%` }} aria-hidden="true">
              {formatTime(hoverRatio * duration)}
            </span>
          )}
        </div>

        <div className="vp__bar">
          <button type="button" className="vp__btn" aria-label={playing ? t('video.pause') : bigButtonLabel} onClick={togglePlay}>
            <Icon name={playing ? 'pause' : status === 'ended' ? 'replay' : 'play'} />
          </button>

          <div className="vp__volume">
            <button type="button" className="vp__btn" aria-label={effectiveMuted ? t('video.unmute') : t('video.mute')} onClick={toggleMute}>
              <Icon name={volumeIcon} />
            </button>
            <input
              type="range"
              className="vp__volume-range"
              aria-label={t('video.volume')}
              min={0}
              max={1}
              step={0.05}
              value={effectiveMuted ? 0 : volume}
              onChange={(event) => {
                const next = Number(event.target.value);
                applyVolume(next, next === 0);
              }}
            />
          </div>

          <span className="vp__time" aria-live="off">
            <span>{formatTime(currentTime)}</span>
            <span className="vp__time-sep">/</span>
            <span>{formatTime(duration)}</span>
          </span>

          <span className="vp__spacer" />

          {extraControls}

          {onFullscreen && (
            <button
              type="button"
              className="vp__btn"
              aria-label={isFullscreen ? t('media.exitFullscreen') : t('media.fullscreen')}
              onClick={onFullscreen}
            >
              <Icon name={isFullscreen ? 'compress' : 'expand'} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
