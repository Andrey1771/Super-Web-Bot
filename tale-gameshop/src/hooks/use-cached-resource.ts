import { useEffect, useState } from 'react';
import { currentLang, useSitePreferences } from '../context/site-preferences';

/**
 * Общий ответ сервера, который спрашивают сразу несколько мест страницы (шапка, подвал, каталог) и который меняется
 * редко: жанры, категории софта. Один запрос на всех и короткий кэш в памяти вкладки; сбой не кэшируется — следующий
 * показ попробует ещё раз и до тех пор живёт с запасным значением.
 */
export const createCachedResource = <T,>(load: () => Promise<T>, fallback: T, cacheMs = 5 * 60 * 1000) => {
  // Ответ зависит от языка сайта (подписи жанров и категорий), поэтому кэш — на каждый язык свой.
  const cached = new Map<string, { at: number; promise: Promise<T> }>();

  const get = () => {
    const lang = currentLang();
    const entry = cached.get(lang);
    if (!entry || Date.now() - entry.at > cacheMs) {
      const promise = load().catch(() => {
        cached.delete(lang);
        return fallback;
      });
      cached.set(lang, { at: Date.now(), promise });
      return promise;
    }
    return entry.promise;
  };

  /** Значение и признак, что ответ уже пришёл. До него — запасное значение. */
  const useResource = () => {
    const [state, setState] = useState<{ data: T; loaded: boolean }>({ data: fallback, loaded: false });
    const { lang } = useSitePreferences();

    useEffect(() => {
      let cancelled = false;
      get().then((data) => {
        if (!cancelled) setState({ data, loaded: true });
      });
      return () => {
        cancelled = true;
      };
    }, [lang]);

    return state;
  };

  return useResource;
};
