import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';

/**
 * Переводы витрины и кабинета.
 *
 * Словари — JSON в src/locales, по одному на язык, с одинаковым набором ключей (за этим следит
 * тест i18n.test.ts). Английский зашит в основной бандл и служит запасным: если в другом языке
 * ключа нет, показывается английская строка, а не сам ключ. Остальные языки подгружаются
 * отдельными чанками при первом выборе.
 *
 * Текущий язык задаёт site-preferences (переключатель в шапке): его setLang вызывает
 * applyLanguage, и все компоненты с useTranslation перерисовываются сами.
 *
 * Ключи — по областям: header.*, footer.*, common.*, home.*, catalog.*, game.*, cart.*,
 * checkout.*, account.*, support.* … Множественное число — суффиксы _one/_few/_many/_other
 * по правилам Intl.PluralRules языка.
 */
export const SUPPORTED_LANGUAGES = ['en', 'ru', 'uk', 'pl'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export type Dictionary = typeof en;

const loaders: Record<Exclude<SupportedLanguage, 'en'>, () => Promise<{ default: Dictionary }>> = {
  ru: () => import(/* webpackChunkName: "lang-ru" */ '../locales/ru.json') as Promise<{ default: Dictionary }>,
  uk: () => import(/* webpackChunkName: "lang-uk" */ '../locales/uk.json') as Promise<{ default: Dictionary }>,
  pl: () => import(/* webpackChunkName: "lang-pl" */ '../locales/pl.json') as Promise<{ default: Dictionary }>,
};

const NAMESPACE = 'translation';

void i18n.use(initReactI18next).init({
  resources: { en: { [NAMESPACE]: en } },
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: [...SUPPORTED_LANGUAGES],
  defaultNS: NAMESPACE,
  interpolation: { escapeValue: false },
  returnNull: false,
  returnEmptyString: false,
  // Синхронная инициализация: английский уже на руках, ждать нечего — и в тестах t() готов сразу.
  initAsync: false,
});

export const isSupportedLanguage = (value: string | null | undefined): value is SupportedLanguage =>
  SUPPORTED_LANGUAGES.includes(value as SupportedLanguage);

/**
 * Переключить язык: догрузить словарь, если его ещё нет, и сменить язык i18next.
 * Ошибка загрузки чанка не роняет сайт — остаётся текущий язык.
 */
export async function applyLanguage(lang: string): Promise<void> {
  const target: SupportedLanguage = isSupportedLanguage(lang) ? lang : 'en';
  if (target !== 'en' && !i18n.hasResourceBundle(target, NAMESPACE)) {
    try {
      const bundle = await loaders[target]();
      i18n.addResourceBundle(target, NAMESPACE, bundle.default, true, true);
    } catch (error) {
      console.error(`Could not load the ${target} dictionary`, error);
      return;
    }
  }
  if (i18n.language !== target) {
    await i18n.changeLanguage(target);
  }
}

export default i18n;
