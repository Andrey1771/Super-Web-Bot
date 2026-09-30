import { activationLabel, activationPlace, catalogHref, devicesLabel, productHref, softwareCatalogPath, termLabel } from './software';

/**
 * Адреса и подписи ПО. Отдельного раздела /software нет: софт — режим каталога /games?type=software,
 * товар любого вида — /games/{slug}. Подписи должны совпадать с тем, что пишет сервер.
 */

it('links every product, software included, to /games/{slug}', () => {
  expect(productHref({ kind: 'Software', slug: 'Nova Security' })).toBe('/games/nova-security');
  expect(productHref({ kind: 'Game', slug: 'elden-ring' })).toBe('/games/elden-ring');
  // Старые ответы без вида — игры.
  expect(productHref({ title: 'Hades II' })).toBe('/games/hades-ii');
});

it('builds the software view of the catalog with its category and filters', () => {
  expect(softwareCatalogPath()).toBe('/games?type=software');
  expect(softwareCatalogPath('security')).toBe('/games?type=software&softwareCategory=security');
  expect(softwareCatalogPath(undefined, { onSale: '1' })).toBe('/games?type=software&onSale=1');
  // Склейка параметров: у софта в адресе уже есть «?», второй «?» ломал бы фильтр.
  expect(catalogHref(true, { tag: 'vpn' })).toBe('/games?type=software&tag=vpn');
  expect(catalogHref(false, { studio: 'Hempuli' })).toBe('/games?studio=Hempuli');
  expect(catalogHref(false)).toBe('/games');
});

it('labels license terms and devices', () => {
  expect(termLabel('1')).toBe('1 month');
  expect(termLabel('12')).toBe('1 year');
  expect(termLabel('24')).toBe('2 years');
  expect(termLabel('18')).toBe('18 months');
  expect(termLabel('lifetime')).toBe('Lifetime');
  expect(devicesLabel('1')).toBe('1 device');
  expect(devicesLabel(3)).toBe('3 devices');
  expect(devicesLabel('10+')).toBe('10+ devices');
});

it('names the activation place from the label, then the link host, then the target', () => {
  expect(activationPlace({ target: 'VendorWebsite', label: 'Nova account', url: 'https://nova.example/licenses' })).toBe('Nova account');
  expect(activationPlace({ target: 0, url: 'https://www.nova.example/licenses' })).toBe('nova.example');
  // В карточке товара перечисление приходит числом.
  expect(activationPlace({ target: 1 })).toBe('Microsoft account');
  expect(activationLabel('InApp')).toBe('In the app');
  expect(activationPlace(null)).toBe('Vendor website');
});
