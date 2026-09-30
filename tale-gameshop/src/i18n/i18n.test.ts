import i18n, { applyLanguage, SUPPORTED_LANGUAGES } from './index';
import en from '../locales/en.json';
import ru from '../locales/ru.json';
import uk from '../locales/uk.json';
import pl from '../locales/pl.json';
import { formatDate } from './format';

/**
 * Словари четырёх языков должны совпадать по набору ключей: пропущенный перевод показал бы
 * английскую строку посреди русского интерфейса, а лишний — мёртвый текст, который никто не видит.
 * Формы множественного числа (_one/_few/_many/_other) сравниваются по основе ключа.
 */

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const flatten = (node: unknown, prefix = ''): string[] => {
  if (typeof node !== 'object' || node === null) return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => flatten(value, prefix ? `${prefix}.${key}` : key));
};

const baseKeys = (dictionary: unknown) => new Set(flatten(dictionary).map((key) => key.replace(PLURAL_SUFFIX, '')));

const dictionaries: Record<string, unknown> = { ru, uk, pl };

it.each(Object.keys(dictionaries))('%s dictionary has exactly the keys of the English one', (lang) => {
  const expected = [...baseKeys(en)].sort();
  const actual = [...baseKeys(dictionaries[lang])].sort();
  const missing = expected.filter((key) => !actual.includes(key));
  const extra = actual.filter((key) => !expected.includes(key));
  expect({ missing, extra }).toEqual({ missing: [], extra: [] });
});

it('every plural key carries the forms its language needs', () => {
  const needs: Record<string, string[]> = { en: ['one', 'other'], ru: ['one', 'few', 'many'], uk: ['one', 'few', 'many'], pl: ['one', 'few', 'many'] };
  for (const lang of SUPPORTED_LANGUAGES) {
    const keys = flatten({ en, ru, uk, pl }[lang]);
    const bases = new Set(keys.filter((key) => PLURAL_SUFFIX.test(key)).map((key) => key.replace(PLURAL_SUFFIX, '')));
    for (const base of bases) {
      for (const form of needs[lang]) {
        expect(keys).toContain(`${base}_${form}`);
      }
    }
  }
});

it('switches the interface language and comes back to English', async () => {
  expect(i18n.t('common.nav.home')).toBe('Home');
  await applyLanguage('ru');
  expect(i18n.t('common.nav.home')).toBe('Главная');
  expect(i18n.t('header.gamesOnSale', { count: 3 })).toBe('3 игры со скидкой');
  expect(i18n.t('header.gamesOnSale', { count: 11 })).toBe('11 игр со скидкой');
  expect(formatDate('2026-09-13T00:00:00Z')).toMatch(/сент/);
  await applyLanguage('pl');
  expect(i18n.t('header.gamesOnSale', { count: 2 })).toBe('2 gry w promocji');
  await applyLanguage('en');
  expect(i18n.t('header.gamesOnSale', { count: 1 })).toBe('1 game on sale');
});

it('falls back to English for an unknown language code', async () => {
  await applyLanguage('de');
  expect(i18n.language).toBe('en');
});
