import { renderHook, waitFor } from '@testing-library/react';

let mockLang = 'en';
jest.mock('../context/site-preferences', () => ({
  currentLang: () => mockLang,
  useSitePreferences: () => ({ lang: mockLang }),
}));

import { createCachedResource } from './use-cached-resource';

/**
 * Общий кэш ответов сервера. Подписи жанров зависят от языка — их запрашиваем заново на новом языке;
 * ответ без текстов (ссылки на соцсети) смена языка не перезапрашивает.
 */

beforeEach(() => {
  mockLang = 'en';
});

it('asks again in the new language for language-dependent answers', async () => {
  const load = jest.fn().mockResolvedValue(['Action']);
  const useResource = createCachedResource(load, [] as string[]);

  const { rerender } = renderHook(() => useResource());
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

  mockLang = 'ru';
  rerender();
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
});

it('keeps one answer for all languages when the answer has no text', async () => {
  const load = jest.fn().mockResolvedValue(['https://t.me/taleshop']);
  const useResource = createCachedResource(load, [] as string[], undefined, { perLanguage: false });

  const { result, rerender } = renderHook(() => useResource());
  await waitFor(() => expect(result.current.loaded).toBe(true));

  mockLang = 'pl';
  rerender();
  renderHook(() => useResource());
  await waitFor(() => expect(result.current.loaded).toBe(true));

  expect(load).toHaveBeenCalledTimes(1);
});
