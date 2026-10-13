import i18n, { applyLanguage } from '../i18n';
import {
  countryName,
  localizeCountries,
  regionBadgeText,
  regionExclusionsText,
  regionLineText,
  regionOfferTitle,
  regionSummaryText,
  regionTitleText,
} from './region-text';

afterEach(async () => {
  await applyLanguage('en');
});

it('builds the region line from the kind code and the lists, not from the English summary', () => {
  const info = { kind: 'regions', regionNames: ['Europe'], excludedCountries: ['UA'], summary: 'server text', exclusions: 'Not in UA' };
  expect(regionSummaryText(info)).toBe('Activates in Europe');
  expect(regionExclusionsText(info)).toBe('Not in Ukraine');
  expect(regionLineText(info)).toBe('Activates in Europe · Not in Ukraine');
  expect(regionBadgeText({ kind: 'regions', regionNames: ['Europe', 'Asia'] })).toBe('Europe +1');
  expect(regionBadgeText({ kind: 'worldwide' })).toBe('Global');
  expect(regionBadgeText({ kind: 'varies' })).toBe('Varies by key');
  expect(regionSummaryText({ kind: 'locked', regionNames: [] })).toBe('Region-locked');
  // Без исключений — ничего: пустая строка «Not in» хуже отсутствия.
  expect(regionExclusionsText({ kind: 'worldwide', excludedCountries: [] })).toBeNull();
});

it('falls back to the server strings for a response without the kind code', () => {
  const old = { summary: 'Activates in Mars', exclusions: 'Not in XX', badge: 'Mars' };
  expect(regionSummaryText(old)).toBe('Activates in Mars');
  expect(regionExclusionsText(old)).toBe('Not in XX');
  expect(regionBadgeText(old)).toBe('Mars');
  expect(regionOfferTitle({ title: 'Europe, North America' })).toBe('Europe, North America');
});

it('translates built-in region and country names, keeps custom ones', async () => {
  await applyLanguage('ru');
  expect(regionSummaryText({ kind: 'regions', regionNames: ['Europe', 'Narnia'] })).toBe('Активируется: Европа, Narnia');
  expect(regionTitleText('Global')).toBe('Глобальный');
  expect(regionOfferTitle({ title: 'Global', kind: 'worldwide' })).toBe('Глобальный');
  expect(countryName('DE', 'Germany')).toBe('Германия');
  // Каталог стран сортируется по переведённым именам.
  const list = localizeCountries([{ code: 'DE', name: 'Germany' }, { code: 'AT', name: 'Austria' }]);
  expect(list.map((item) => item.name)).toEqual(['Австрия', 'Германия']);
});
