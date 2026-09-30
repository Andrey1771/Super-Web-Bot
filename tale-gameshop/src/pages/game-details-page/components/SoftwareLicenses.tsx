import React from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';
import { Link } from 'react-router-dom';
import type { Edition, GameAvailability, Pricing, SoftwareActivation } from '../../../types/game-details';
import { activationPlace, devicesLabel, licenseTermLabel, licenseText, normalizeActivationTarget } from '../../../utils/software';
import { formatMoney } from '../../../utils/format-money';

/**
 * Лицензии ПО на странице товара. Каждая лицензия — издание со своей ценой, скидкой и складом; покупатель же
 * выбирает не «издание», а две вещи: срок и число устройств. Поэтому издания раскладываются в сетку
 * «срок × устройства», а выбор в одном измерении подбирает ближайшую лицензию в другом.
 */

/** Ключ срока: месяцы, «sub» у подписки без срока, «life» у бессрочной. */
const termKeyOf = (edition: Edition) =>
  edition.licenseTermMonths && edition.licenseTermMonths > 0 ? String(edition.licenseTermMonths) : edition.isSubscription ? 'sub' : 'life';

const termOrder = (key: string) => (key === 'life' ? Number.MAX_SAFE_INTEGER : key === 'sub' ? Number.MAX_SAFE_INTEGER - 1 : Number(key));

const devicesKeyOf = (edition: Edition) => (edition.licenseDevices && edition.licenseDevices > 0 ? edition.licenseDevices : 0);

/** Сетка лицензий работает, только когда у каждого издания заполнены срок или устройства. */
export const hasLicenseGrid = (editions: Edition[]) =>
  editions.length > 1 && editions.every((edition) => edition.licenseTermMonths != null || edition.licenseDevices != null || edition.isSubscription);

/**
 * Подпись лицензии: «1 year · 3 devices». Считаем по полям издания тем же правилом, что сервер
 * (SoftwareCatalog.LicenseLabel), но на языке сайта; готовая английская строка сервера (edition.label)
 * нужна только изданию без срока, устройств и подписки. У подписки — с пометкой «Subscription».
 */
export const licenseLabel = (edition?: Edition | null) => {
  if (!edition) return '';
  if (edition.licenseTermMonths == null && edition.licenseDevices == null && !edition.isSubscription) return edition.label ?? '';
  return licenseText({ termMonths: edition.licenseTermMonths, devices: edition.licenseDevices, isSubscription: edition.isSubscription });
};

const axes = (editions: Edition[]) => {
  const terms = Array.from(new Set(editions.map(termKeyOf))).sort((a, b) => termOrder(a) - termOrder(b));
  const devices = Array.from(new Set(editions.map(devicesKeyOf))).sort((a, b) => a - b);
  return { terms, devices };
};

const termTitle = (key: string, editions: Edition[]) => {
  const sample = editions.find((edition) => termKeyOf(edition) === key);
  return licenseTermLabel(sample?.licenseTermMonths, sample?.isSubscription);
};

type LicensePickerProps = {
  editions: Edition[];
  editionPricing: Record<string, Pricing | null>;
  editionAvailability?: Record<string, GameAvailability>;
  selectedCode: string;
  onSelect: (code: string) => void;
  siteCurrency: string;
};

/**
 * Выбор лицензии кнопками «срок» и «устройства». Комбинации, которой нет, кнопка не скрывает: клик по ней
 * подбирает ближайшую существующую лицензию — так видно, какие варианты вообще продаются.
 */
export const LicensePicker = ({ editions, editionPricing, editionAvailability, selectedCode, onSelect, siteCurrency }: LicensePickerProps) => {
  const { t } = useTranslation();
  const selected = editions.find((edition) => edition.code === selectedCode) ?? editions[0];
  const { terms, devices } = axes(editions);
  const selectedTerm = termKeyOf(selected);
  const selectedDevices = devicesKeyOf(selected);

  const find = (term: string, count: number) => editions.find((edition) => termKeyOf(edition) === term && devicesKeyOf(edition) === count);
  const cheapest = (list: Edition[]) =>
    [...list].sort((a, b) => (editionPricing[a.code]?.price ?? Number.MAX_VALUE) - (editionPricing[b.code]?.price ?? Number.MAX_VALUE))[0];

  const pickTerm = (term: string) => onSelect((find(term, selectedDevices) ?? cheapest(editions.filter((e) => termKeyOf(e) === term))).code);
  const pickDevices = (count: number) => onSelect((find(selectedTerm, count) ?? cheapest(editions.filter((e) => devicesKeyOf(e) === count))).code);

  const note = (edition?: Edition) => {
    if (!edition) return null;
    if (editionAvailability?.[edition.code]?.status === 'outOfStock') return t('common.outOfStock');
    const price = editionPricing[edition.code];
    return price ? formatMoney(price.price, price.currency) : t('product.notInCurrency', { currency: siteCurrency });
  };

  return (
    <div className="license-picker">
      {terms.length > 1 && (
        <div className="license-picker__group">
          <span className="license-picker__label">{t('catalog.licenseTerm')}</span>
          <div className="license-picker__options" role="radiogroup" aria-label={t('catalog.licenseTerm')}>
            {terms.map((term) => {
              const match = find(term, selectedDevices);
              return (
                <button
                  key={term}
                  type="button"
                  role="radio"
                  aria-checked={term === selectedTerm}
                  className={`license-option${term === selectedTerm ? ' is-selected' : ''}${match ? '' : ' is-other'}`}
                  onClick={() => pickTerm(term)}
                >
                  <b>{termTitle(term, editions)}</b>
                  <small>{match ? note(match) : t('licenses.otherDevices')}</small>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {devices.length > 1 && (
        <div className="license-picker__group">
          <span className="license-picker__label">{t('catalog.devices')}</span>
          <div className="license-picker__options" role="radiogroup" aria-label={t('catalog.devices')}>
            {devices.map((count) => {
              const match = find(selectedTerm, count);
              return (
                <button
                  key={count}
                  type="button"
                  role="radio"
                  aria-checked={count === selectedDevices}
                  className={`license-option${count === selectedDevices ? ' is-selected' : ''}${match ? '' : ' is-other'}`}
                  onClick={() => pickDevices(count)}
                >
                  <b>{count > 0 ? count : '—'}</b>
                  <small>{match ? note(match) : t('licenses.otherTerm')}</small>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/** «$10.00 per device per year» — помогает сравнить пакеты; только когда есть и срок, и устройства. */
export const perDeviceYear = (edition: Edition | undefined, pricing: Pricing | null) => {
  if (!edition || !pricing || !edition.licenseDevices || !edition.licenseTermMonths) return null;
  if (edition.licenseDevices < 2 && edition.licenseTermMonths <= 12) return null;
  const perUnit = pricing.price / edition.licenseDevices / (edition.licenseTermMonths / 12);
  return i18n.t('licenses.perDeviceYear', { price: formatMoney(Math.round(perUnit * 100) / 100, pricing.currency) });
};

type CompareProps = {
  editions: Edition[];
  editionPricing: Record<string, Pricing | null>;
  editionAvailability?: Record<string, GameAvailability>;
  selectedCode: string;
  onSelect: (code: string) => void;
};

/** Таблица «срок × устройства»: каждая ячейка — лицензия со своей ценой. Клик выбирает её в карточке покупки. */
export const CompareLicensesCard = ({ editions, editionPricing, editionAvailability, selectedCode, onSelect }: CompareProps) => {
  const { t } = useTranslation();
  if (!hasLicenseGrid(editions)) return null;
  const { terms, devices } = axes(editions);
  if (terms.length < 2 && devices.length < 2) return null;

  return (
    <div className="card" id="licenses">
      <h2>{t('licenses.compare')}</h2>
      <div className="license-compare__scroll">
        <table className="license-compare">
          <thead>
            <tr>
              <th scope="col" />
              {devices.map((count) => (
                <th key={count} scope="col">
                  {count > 0 ? devicesLabel(count) : t('licenses.anyDevice')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {terms.map((term) => (
              <tr key={term}>
                <th scope="row">{termTitle(term, editions)}</th>
                {devices.map((count) => {
                  const edition = editions.find((e) => termKeyOf(e) === term && devicesKeyOf(e) === count);
                  if (!edition) return <td key={count} className="is-empty">—</td>;
                  const price = editionPricing[edition.code];
                  const soldOut = editionAvailability?.[edition.code]?.status === 'outOfStock';
                  return (
                    <td key={count} className={`${edition.code === selectedCode ? 'is-selected' : ''}${soldOut ? ' is-soldout' : ''}`}>
                      <button type="button" onClick={() => onSelect(edition.code)} disabled={!price} aria-pressed={edition.code === selectedCode}>
                        {price ? formatMoney(price.price, price.currency) : '—'}
                        {soldOut && <small>{t('common.outOfStock')}</small>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/**
 * «How activation works» — по месту активации. Общие шаги, без обещаний за конкретного вендора: подробная
 * инструкция живёт в центре поддержки.
 */
export const ActivationCard = ({ activation, subscription }: { activation?: SoftwareActivation | null; subscription: boolean }) => {
  const { t } = useTranslation();
  const target = normalizeActivationTarget(activation?.target);
  const place = activationPlace(activation);
  const link = activation?.url ? (
    <a href={activation.url} target="_blank" rel="noreferrer noopener">
      {place}
    </a>
  ) : (
    <strong>{place}</strong>
  );

  const steps: React.ReactNode[] =
    target === 'MicrosoftAccount'
      ? [
          <>{t('licenses.steps.copy')}</>,
          <>{t('licenses.steps.msSignInBefore')}{link}{t('licenses.steps.msSignInAfter')}</>,
          <>{t('licenses.steps.msEnter')}</>,
        ]
      : target === 'InApp'
        ? [
            <>{t('licenses.steps.copy')}</>,
            <>{t('licenses.steps.downloadBefore')}{activation?.url ? <>{t('licenses.steps.downloadFrom')}{link}</> : null}{t('licenses.steps.downloadAfter')}</>,
            <>{t('licenses.steps.openApp')}</>,
          ]
        : [
            <>{t('licenses.steps.copy')}</>,
            <>{t('licenses.steps.goToBefore')}{link}{t('licenses.steps.goToAfter')}</>,
            <>{t('licenses.steps.enterLicenses')}</>,
          ];

  return (
    <div className="card" id="activation">
      <h2>{t('licenses.howActivation')}</h2>
      <ol className="activation-steps">
        {steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      <p className="activation-note">
        {subscription
          ? t('licenses.subscriptionNote')
          : t('licenses.checkRequirements')}{' '}
        <Link to="/support/docs/software-activation">{t('licenses.activationHelp')}</Link>
      </p>
    </div>
  );
};
