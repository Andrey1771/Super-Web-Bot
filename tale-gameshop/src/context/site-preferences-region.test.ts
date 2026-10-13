import React from 'react';
import { act, renderHook } from '@testing-library/react';

/**
 * Каталог ждёт, пока определится страна покупателя: раньше первый запрос уходил с догадкой по часовому поясу
 * и сразу повторялся со страной от сервера. «Определилась» — выбрана самим покупателем, пришла от сервера
 * или сервер не ответил за 1,5 с.
 */
type Prefs = typeof import('./site-preferences');

/** Свежий модуль (его состояние живёт на уровне модуля), но с тем же React, что у renderHook. */
const loadModule = (): Prefs => {
  let mod: Prefs | undefined;
  jest.isolateModules(() => {
    jest.doMock('react', () => React);
    mod = jest.requireActual('./site-preferences');
  });
  return mod!;
};

beforeEach(() => {
  localStorage.clear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  // @ts-expect-error — fetch подменяется только в этих тестах
  delete global.fetch;
});

it('waits for the server before saying the country is settled', async () => {
  let answer: (value: unknown) => void = () => undefined;
  global.fetch = jest.fn((url: string) =>
    String(url).includes('/storefront/region')
      ? new Promise((resolve) => { answer = resolve; })
      : Promise.reject(new Error('offline'))) as unknown as typeof fetch;

  const { useSitePreferences } = loadModule();
  const { result } = renderHook(() => useSitePreferences());
  expect(result.current.regionSettled).toBe(false);

  await act(async () => {
    answer({ ok: true, json: async () => ({ countries: [{ code: 'PL', name: 'Poland' }], detectedCountry: 'PL' }) });
  });
  expect(result.current.regionSettled).toBe(true);
  expect(result.current.country).toBe('PL');
});

it('does not wait longer than 1.5 s for a silent server', async () => {
  global.fetch = jest.fn(() => new Promise(() => undefined)) as unknown as typeof fetch;

  const { useSitePreferences } = loadModule();
  const { result } = renderHook(() => useSitePreferences());
  expect(result.current.regionSettled).toBe(false);

  await act(async () => {
    jest.advanceTimersByTime(1500);
  });
  expect(result.current.regionSettled).toBe(true);
});

it('is settled right away when the buyer picked the country', () => {
  localStorage.setItem('site_country', 'DE');
  global.fetch = jest.fn(() => new Promise(() => undefined)) as unknown as typeof fetch;

  const { useSitePreferences } = loadModule();
  const { result } = renderHook(() => useSitePreferences());
  expect(result.current.regionSettled).toBe(true);
  expect(result.current.country).toBe('DE');
});
