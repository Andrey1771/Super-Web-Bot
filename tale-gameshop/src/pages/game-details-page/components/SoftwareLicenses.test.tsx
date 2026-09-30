import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Edition, Pricing } from '../../../types/game-details';
import { hasLicenseGrid, LicensePicker, licenseLabel, perDeviceYear } from './SoftwareLicenses';

jest.mock('../../../utils/format-money', () => ({
  formatMoney: (value: number) => `$${value.toFixed(2)}`,
}));

/**
 * Выбор лицензии ПО. Покупатель выбирает срок и устройства, а купить можно только существующую лицензию:
 * клик по сроку сохраняет выбранные устройства, если такая лицензия есть, иначе берёт самую дешёвую с этим сроком.
 */

const edition = (code: string, months: number | null, devices: number | null, extra: Partial<Edition> = {}): Edition => ({
  code,
  title: code,
  description: '',
  price: 0,
  licenseTermMonths: months,
  licenseDevices: devices,
  ...extra,
});

const editions = [edition('1y-1', 12, 1), edition('1y-3', 12, 3), edition('2y-3', 24, 3), edition('2y-5', 24, 5), edition('2y-1', 24, 1)];
const price = (value: number): Pricing => ({ price: value, currency: 'USD' });
const pricing: Record<string, Pricing | null> = {
  '1y-1': price(19.99),
  '1y-3': price(29.99),
  '2y-3': price(47.99),
  '2y-5': price(63.99),
  '2y-1': price(32.99),
};

const renderPicker = (selectedCode: string, onSelect = jest.fn()) => {
  render(
    <MemoryRouter>
      <LicensePicker editions={editions} editionPricing={pricing} selectedCode={selectedCode} onSelect={onSelect} siteCurrency="USD" />
    </MemoryRouter>,
  );
  return onSelect;
};

it('keeps the chosen devices when switching the term', async () => {
  const onSelect = renderPicker('1y-3');

  await userEvent.click(screen.getByRole('radio', { name: /2 years/ }));

  expect(onSelect).toHaveBeenCalledWith('2y-3');
});

it('falls back to the cheapest license of that size when the combination does not exist', async () => {
  // «5 устройств» есть только на 2 года.
  const onSelect = renderPicker('1y-1');

  await userEvent.click(screen.getByRole('radio', { name: /^5/ }));

  expect(onSelect).toHaveBeenCalledWith('2y-5');
});

it('shows the price of each option for the current selection', () => {
  renderPicker('1y-3');

  expect(screen.getByRole('radio', { name: /1 year/ })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByRole('radio', { name: /2 years/ })).toHaveTextContent('$47.99');
  // На 1 год лицензии на 5 устройств нет — кнопка подсказывает, что сменится срок.
  expect(screen.getByRole('radio', { name: /^5/ })).toHaveTextContent('other term');
});

it('describes licenses and the per-device price', () => {
  expect(licenseLabel(edition('x', 12, 3))).toBe('1 year · 3 devices');
  expect(licenseLabel(edition('x', null, 1))).toBe('Lifetime · 1 device');
  // Как у сервера: подписка помечена, чтобы касса и письмо называли лицензию одинаково.
  expect(licenseLabel(edition('x', 1, 5, { isSubscription: true }))).toBe('Subscription · 1 month · 5 devices');
  // Подпись считается по полям на языке сайта; английская строка сервера — только у издания без
  // полей лицензии. Издание без лицензии и без строки — без подписи, а не «Lifetime».
  expect(licenseLabel(edition('x', 12, 3, { label: 'From server' }))).toBe('1 year · 3 devices');
  expect(licenseLabel(edition('x', null, null, { label: 'Deluxe' }))).toBe('Deluxe');
  expect(licenseLabel(edition('x', null, null))).toBe('');
  expect(perDeviceYear(edition('x', 24, 3), price(48))).toBe('$8.00 per device per year');
  // Одно устройство на год — считать нечего.
  expect(perDeviceYear(edition('x', 12, 1), price(20))).toBeNull();
});

it('uses the grid only when every edition is a license', () => {
  expect(hasLicenseGrid(editions)).toBe(true);
  expect(hasLicenseGrid([edition('std', null, null), edition('dlx', null, null)])).toBe(false);
  expect(hasLicenseGrid([edition('one', 12, 1)])).toBe(false);
});
