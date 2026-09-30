import React from 'react';
import { act, render } from '@testing-library/react';
import PageMeta, { languageHref } from './PageMeta';
import { setLang } from '../../context/site-preferences';

/**
 * Языковые версии страницы для поисковика: hreflang на каждый язык, канонический адрес
 * с `?lang=` у неанглийской версии, локаль Open Graph и язык разметки.
 */

const links = (hreflang: string) =>
    document.head.querySelector<HTMLLinkElement>(`link[rel="alternate"][hreflang="${hreflang}"]`)?.getAttribute('href');
const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute('href');
const meta = (property: string) => document.head.querySelector(`meta[property="${property}"]`)?.getAttribute('content');
const jsonLd = () => JSON.parse(document.head.querySelector('script[type="application/ld+json"]')?.textContent ?? 'null');

afterEach(async () => {
    await act(async () => {
        setLang('en');
    });
    // Теги предыдущего теста не должны попадать в следующий — как и при переходе между страницами.
    document.head.querySelectorAll('[data-page-meta]').forEach((element) => element.remove());
});

it('builds language versions with a query parameter and keeps English on the bare address', () => {
    expect(languageHref('/games', 'en')).toBe('/games');
    expect(languageHref('/games', 'ru')).toBe('/games?lang=ru');
    expect(languageHref('/games?type=software', 'pl')).toBe('/games?type=software&lang=pl');
});

it('lists every language as an alternate and marks the English page as default', () => {
    render(<PageMeta title="Catalog" canonicalPath="/games" structuredData={{ '@context': 'https://schema.org', '@type': 'ItemList' }} />);

    expect(links('en')).toBe('http://localhost/games');
    expect(links('ru')).toBe('http://localhost/games?lang=ru');
    expect(links('uk')).toBe('http://localhost/games?lang=uk');
    expect(links('pl')).toBe('http://localhost/games?lang=pl');
    expect(links('x-default')).toBe('http://localhost/games');
    expect(canonical()).toBe('http://localhost/games');
    expect(meta('og:locale')).toBe('en_US');
    expect(jsonLd().inLanguage).toBe('en');
});

it('gives a non-English version its own canonical address, locale and markup language', async () => {
    render(<PageMeta title="Catalog" canonicalPath="/games" structuredData={{ '@context': 'https://schema.org', '@type': 'ItemList' }} />);
    await act(async () => {
        setLang('ru');
    });

    expect(canonical()).toBe('http://localhost/games?lang=ru');
    expect(meta('og:url')).toBe('http://localhost/games?lang=ru');
    expect(meta('og:locale')).toBe('ru_RU');
    // Альтернативы одни и те же с любой версии — поисковик требует полного кластера на каждой.
    expect(links('x-default')).toBe('http://localhost/games');
    expect(links('en')).toBe('http://localhost/games');
    expect(document.head.querySelectorAll('meta[property="og:locale:alternate"]')).toHaveLength(3);
    expect(jsonLd().inLanguage).toBe('ru');
});

it('does not invent a language property for a product', () => {
    render(<PageMeta title="Game" structuredData={{ '@context': 'https://schema.org', '@type': 'Product', name: 'Game' }} />);
    expect(jsonLd().inLanguage).toBeUndefined();
    // Без канонического пути — альтернативы от текущего адреса, канонического адреса нет.
    expect(links('ru')).toBe('http://localhost/?lang=ru');
    expect(canonical()).toBeUndefined();
});
