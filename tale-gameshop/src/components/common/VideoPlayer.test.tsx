import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VideoPlayer, { IDLE_HIDE_MS, VIDEO_QUALITY_STORAGE_KEY, VIDEO_VOLUME_STORAGE_KEY, autoCapIndex, formatTime } from './VideoPlayer';

/**
 * Свой видеоплеер. jsdom не воспроизводит видео, поэтому play/pause/load подменены в setupTests:
 * они бросают события play/pause/playing как настоящий браузер. Длительность, текущее время и буфер
 * задаём на конкретном элементе через defineProperty и шлём те же события, что шлёт <video>.
 */

const video = () => document.querySelector<HTMLVideoElement>('video')!;

/** Даёт ролику длительность и управляемое currentTime — как будто метаданные загрузились. */
const loadMetadata = (element: HTMLVideoElement, duration: number, bufferedEnd = 0) => {
  let time = 0;
  Object.defineProperty(element, 'duration', { configurable: true, get: () => duration });
  Object.defineProperty(element, 'currentTime', {
    configurable: true,
    get: () => time,
    set: (value: number) => {
      time = value;
    }
  });
  Object.defineProperty(element, 'buffered', {
    configurable: true,
    get: () => ({ length: bufferedEnd > 0 ? 1 : 0, start: () => 0, end: () => bufferedEnd })
  });
  fireEvent.loadedMetadata(element);
  fireEvent.progress(element);
};

const trackWidth = (track: HTMLElement, width: number) => {
  track.getBoundingClientRect = () => ({ left: 0, top: 0, width, height: 18, right: width, bottom: 18, x: 0, y: 0, toJSON: () => ({}) });
};

afterEach(() => {
  window.localStorage.clear();
});

describe('formatTime', () => {
  it('formats seconds like a player does', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(7)).toBe('0:07');
    expect(formatTime(79)).toBe('1:19');
    expect(formatTime(3723)).toBe('1:02:03');
    expect(formatTime(NaN)).toBe('0:00');
  });
});

describe('playback', () => {
  it('starts paused with a big play button and plays on click, then pauses', async () => {
    render(<VideoPlayer src="/trailer.mp4" poster="/poster.jpg" title="Lanternfall trailer" />);

    expect(video()).not.toHaveAttribute('controls');
    expect(document.querySelector('.vp__big-play')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    expect(document.querySelector('.vp__big-play')).toBeNull();

    // Клик по самому кадру — тоже пауза/play, как в любом плеере.
    await userEvent.click(video());
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('reports the real start to the parent and offers replay at the end', async () => {
    const onPlay = jest.fn();
    const onEnded = jest.fn();
    render(<VideoPlayer src="/trailer.mp4" title="Trailer" onPlay={onPlay} onEnded={onEnded} />);

    await userEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(onPlay).toHaveBeenCalledTimes(1);

    fireEvent.ended(video());
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Replay' })).toBeInTheDocument();
    expect(document.querySelector('.vp__big-play')).not.toBeNull();
  });

  it('autoplays when asked and falls back to paused when the browser refuses', async () => {
    const playSpy = jest.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));
    render(<VideoPlayer src="/trailer.mp4" title="Trailer" autoPlay />);

    expect(playSpy).toHaveBeenCalledTimes(1);
    // Отказ приходит промисом — даём ему разрешиться.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('shows an error with retry when the file fails to load', async () => {
    render(<VideoPlayer src="/missing.mp4" title="Trailer" />);
    fireEvent.error(video());

    expect(screen.getByRole('alert')).toHaveTextContent('Video failed to load.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(1);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner while buffering during playback only', async () => {
    render(<VideoPlayer src="/trailer.mp4" title="Trailer" />);
    fireEvent.waiting(video());
    expect(screen.queryByRole('status')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.waiting(video());
    expect(screen.getByRole('status', { name: 'Loading video' })).toBeInTheDocument();
    fireEvent.playing(video());
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('progress and seeking', () => {
  it('tracks time, buffer and duration from the media events', () => {
    render(<VideoPlayer src="/trailer.mp4" title="Trailer" />);
    loadMetadata(video(), 120, 60);

    expect(screen.getByText('2:00')).toBeInTheDocument();
    expect(document.querySelector<HTMLElement>('.vp__track-loaded')!.style.width).toBe('50%');

    video().currentTime = 30;
    fireEvent.timeUpdate(video());
    const slider = screen.getByRole('slider', { name: 'Seek' });
    expect(slider).toHaveAttribute('aria-valuenow', '30');
    expect(slider).toHaveAttribute('aria-valuemax', '120');
    expect(slider).toHaveAttribute('aria-valuetext', '0:30 of 2:00');
    expect(document.querySelector<HTMLElement>('.vp__track-played')!.style.width).toBe('25%');
  });

  it('seeks with the keyboard on the slider and keeps the arrows away from the parent', () => {
    const parentKeyDown = jest.fn();
    render(
      <div onKeyDown={parentKeyDown}>
        <VideoPlayer src="/trailer.mp4" title="Trailer" />
      </div>
    );
    loadMetadata(video(), 120);
    const slider = screen.getByRole('slider', { name: 'Seek' });

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(video().currentTime).toBe(10);
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(video().currentTime).toBe(5);
    fireEvent.keyDown(slider, { key: 'End' });
    expect(video().currentTime).toBe(120);
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(video().currentTime).toBe(0);
    // Галерея листает кадры теми же стрелками — из ползунка они не должны доходить.
    expect(parentKeyDown).not.toHaveBeenCalled();

    // Пробел на плеере — пауза/play, и он тоже не всплывает (иначе страница прокрутится).
    fireEvent.keyDown(screen.getByRole('region', { name: 'Trailer — video player' }), { key: ' ' });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(parentKeyDown).not.toHaveBeenCalled();
  });

  it('seeks by pointer on the track and shows the hover time', () => {
    render(<VideoPlayer src="/trailer.mp4" title="Trailer" />);
    loadMetadata(video(), 100);
    const slider = screen.getByRole('slider', { name: 'Seek' });
    trackWidth(slider, 200);

    fireEvent.pointerMove(slider, { clientX: 150 });
    expect(screen.getByText('1:15')).toBeInTheDocument();

    fireEvent.pointerDown(slider, { clientX: 50, pointerId: 1 });
    expect(video().currentTime).toBe(25);
    fireEvent.pointerMove(slider, { clientX: 100, pointerId: 1 });
    expect(video().currentTime).toBe(50);
    fireEvent.pointerUp(slider, { clientX: 100, pointerId: 1 });
    // После отпускания движение — только подсказка, не перемотка.
    fireEvent.pointerMove(slider, { clientX: 180, pointerId: 1 });
    expect(video().currentTime).toBe(50);
  });
});

describe('volume', () => {
  it('mutes, restores and remembers the level between players', async () => {
    const { unmount } = render(<VideoPlayer src="/trailer.mp4" title="Trailer" />);

    await userEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(video().muted).toBe(true);
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '0.3' } });
    expect(video().volume).toBeCloseTo(0.3);
    expect(video().muted).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(VIDEO_VOLUME_STORAGE_KEY)!)).toEqual({ volume: 0.3, muted: false });

    unmount();
    render(<VideoPlayer src="/another.mp4" title="Another" />);
    expect(video().volume).toBeCloseTo(0.3);
  });

  it('unmuting at zero volume brings back an audible level', async () => {
    render(<VideoPlayer src="/trailer.mp4" title="Trailer" />);
    fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Unmute' }));
    expect(video().volume).toBeCloseTo(0.5);
    expect(video().muted).toBe(false);
  });
});

describe('fullscreen and idle controls', () => {
  it('shows the fullscreen button only when the parent can handle it', async () => {
    const { rerender } = render(<VideoPlayer src="/trailer.mp4" title="Trailer" />);
    expect(screen.queryByRole('button', { name: 'Fullscreen' })).toBeNull();

    const onFullscreen = jest.fn();
    rerender(<VideoPlayer src="/trailer.mp4" title="Trailer" onFullscreen={onFullscreen} />);
    await userEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
    expect(onFullscreen).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole('region', { name: 'Trailer — video player' }), { key: 'f' });
    expect(onFullscreen).toHaveBeenCalledTimes(2);

    rerender(<VideoPlayer src="/trailer.mp4" title="Trailer" onFullscreen={onFullscreen} isFullscreen />);
    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeInTheDocument();
  });

  it('renders the parent extra controls next to the fullscreen button', () => {
    render(
      <VideoPlayer
        src="/trailer.mp4"
        title="Trailer"
        onFullscreen={() => undefined}
        extraControls={<button type="button">Exit theater</button>}
      />
    );
    const bar = document.querySelector('.vp__bar')!;
    const labels = [...bar.querySelectorAll('button')].map((button) => button.getAttribute('aria-label') ?? button.textContent);
    expect(labels.slice(-2)).toEqual(['Exit theater', 'Fullscreen']);
  });

  it('hides the controls after a pause of inactivity during playback and brings them back on movement', () => {
    jest.useFakeTimers();
    try {
      render(<VideoPlayer src="/trailer.mp4" title="Trailer" />);
      const region = screen.getByRole('region', { name: 'Trailer — video player' });

      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      expect(region).not.toHaveClass('is-idle');

      act(() => {
        jest.advanceTimersByTime(IDLE_HIDE_MS + 10);
      });
      expect(region).toHaveClass('is-idle');

      fireEvent.pointerMove(region);
      expect(region).not.toHaveClass('is-idle');

      // На паузе панель не прячется, сколько ни жди.
      fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
      act(() => {
        jest.advanceTimersByTime(IDLE_HIDE_MS * 2);
      });
      expect(region).not.toHaveClass('is-idle');
    } finally {
      jest.useRealTimers();
    }
  });

  it('blocks the context menu so the browser offers no "Save video as"', () => {
    render(<VideoPlayer src="/trailer.mp4" title="Trailer" />);
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    video().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

// Трейлеры Steam — только потоком HLS. Браузеры без родного HLS получают hls.js отдельным чанком.
const mockHlsSupported = { value: true };
// Уровни — как у трейлеров Steam: hls.js хранит их по возрастанию битрейта.
const mockHandlers: Record<string, (event: string, data: { level: number }) => void> = {};
const mockHls = {
  loadSource: jest.fn(),
  attachMedia: jest.fn(),
  on: jest.fn((event: string, handler: (event: string, data: { level: number }) => void) => {
    mockHandlers[event] = handler;
  }),
  destroy: jest.fn(),
  levels: [
    { height: 360, width: 640 },
    { height: 480, width: 854 },
    { height: 720, width: 1280 },
    { height: 1080, width: 1920 }
  ],
  currentLevel: -1,
  autoLevelCapping: -1
};
jest.mock('hls.js', () => {
  const Hls = jest.fn(() => mockHls) as unknown as { isSupported: () => boolean; Events: Record<string, string> };
  Hls.isSupported = () => mockHlsSupported.value;
  Hls.Events = { MANIFEST_PARSED: 'hlsManifestParsed', ERROR: 'hlsError', LEVEL_SWITCHED: 'hlsLevelSwitched' };
  return { __esModule: true, default: Hls };
});

describe('HLS stream', () => {
  const stream = 'https://video.example/trailer/hls_264_master.m3u8?t=1';

  beforeEach(() => {
    jest.clearAllMocks();
    mockHls.currentLevel = -1;
    mockHls.autoLevelCapping = -1;
  });

  const startStream = async () => {
    render(<VideoPlayer src={stream} title="Trailer" />);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => mockHandlers.hlsManifestParsed('hlsManifestParsed', { level: 0 }));
  };

  it('offers quality levels and switches to the chosen one, remembering it', async () => {
    await startStream();

    await userEvent.click(screen.getByRole('button', { name: /Quality/ }));
    const items = screen.getAllByRole('menuitemradio').map((item) => item.textContent);
    expect(items).toEqual(['Auto', '1080pHD', '720p', '480p', '360p']);

    await userEvent.click(screen.getByRole('menuitemradio', { name: '720p' }));
    expect(mockHls.currentLevel).toBe(2);
    expect(window.localStorage.getItem(VIDEO_QUALITY_STORAGE_KEY)).toBe('720');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: /Quality/ })).toHaveTextContent('720p');
  });

  it('applies the remembered quality to the next stream', async () => {
    window.localStorage.setItem(VIDEO_QUALITY_STORAGE_KEY, '1080');
    await startStream();
    expect(mockHls.currentLevel).toBe(3);
  });

  it('shows the level auto mode is playing', async () => {
    await startStream();
    act(() => mockHandlers.hlsLevelSwitched('hlsLevelSwitched', { level: 2 }));
    expect(screen.getByRole('button', { name: /Quality/ })).toHaveTextContent('Auto · 720p');
  });

  it('plays through hls.js where the browser has no native HLS', async () => {
    const { unmount } = render(<VideoPlayer src={stream} title="Trailer" />);

    // Сам <video> без src: источник подключает hls.js.
    expect(video().getAttribute('src')).toBeNull();
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockHls.loadSource).toHaveBeenCalledWith(stream);
    expect(mockHls.attachMedia).toHaveBeenCalledWith(video());

    unmount();
    expect(mockHls.destroy).toHaveBeenCalled();
  });

  it('prefers hls.js even where the browser plays HLS itself, so quality can be chosen', async () => {
    const canPlay = jest.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('maybe');
    try {
      render(<VideoPlayer src={stream} title="Trailer" />);
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockHls.loadSource).toHaveBeenCalledWith(stream);
      expect(video().getAttribute('src')).toBeNull();
    } finally {
      canPlay.mockRestore();
    }
  });

  it('falls back to native HLS when hls.js cannot run', async () => {
    mockHlsSupported.value = false;
    const canPlay = jest.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('maybe');
    try {
      render(<VideoPlayer src={stream} title="Trailer" />);
      await act(async () => {
        await Promise.resolve();
      });
      expect(video().src).toBe(stream);
      expect(mockHls.loadSource).not.toHaveBeenCalled();
    } finally {
      canPlay.mockRestore();
      mockHlsSupported.value = true;
    }
  });

  it('keeps plain files as a regular source', () => {
    render(<VideoPlayer src="/uploads/media/trailer.mp4" title="Trailer" />);
    expect(video().getAttribute('src')).toBe('/uploads/media/trailer.mp4');
  });
});

describe('autoCapIndex', () => {
  const levels = [{ width: 640 }, { width: 854 }, { width: 1280 }, { width: 1920 }];

  it('caps auto quality one step above the player size', () => {
    // Карточка игры ~800 px: 480p (854) по ширине впритык и мылит — потолок 720p.
    expect(autoCapIndex(levels, 803, 1)).toBe(2);
    expect(autoCapIndex(levels, 400, 1)).toBe(0);
  });

  it('accounts for pixel density and leaves auto uncapped in fullscreen', () => {
    // Экран 2x: карточке в 800 px нужно больше 1080p — без ограничения.
    expect(autoCapIndex(levels, 800, 2)).toBe(-1);
    expect(autoCapIndex(levels, 1400, 1)).toBe(-1);
    expect(autoCapIndex(levels, 1100, 1)).toBe(3);
  });
});
