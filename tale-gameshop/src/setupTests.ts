// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
// Переводы: английский словарь инициализируется синхронно, тесты видят те же строки, что и витрина.
import './i18n';

// jsdom не воспроизводит медиа: play()/pause()/load() у него «not implemented» и сыплют в консоль.
// Подменяем их так, как ведёт себя браузер: play шлёт play и playing, pause — pause. Состояние
// плеера в тестах строится на этих событиях, а не на настоящем воспроизведении.
const media = HTMLMediaElement.prototype as HTMLMediaElement & { play: () => Promise<void>; pause: () => void; load: () => void };
Object.defineProperty(media, 'play', {
  configurable: true,
  writable: true,
  value: jest.fn(function play(this: HTMLMediaElement) {
    this.dispatchEvent(new Event('play'));
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  })
});
Object.defineProperty(media, 'pause', {
  configurable: true,
  writable: true,
  value: jest.fn(function pause(this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'));
  })
});
Object.defineProperty(media, 'load', { configurable: true, writable: true, value: jest.fn() });

// В jsdom нет PointerEvent: без него fireEvent.pointerDown/pointerMove теряют координаты.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
    }
  }
  (window as unknown as { PointerEvent: typeof PointerEventPolyfill }).PointerEvent = PointerEventPolyfill;
}
