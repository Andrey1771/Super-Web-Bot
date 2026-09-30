import React, { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import i18n from '../../../i18n';
import { formatDate as formatLocalDate } from '../../../i18n/format';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBitcoin, faCcMastercard, faCcVisa, faTelegram } from '@fortawesome/free-brands-svg-icons';
import { faBolt, faCircleQuestion, faEarthEurope, faKey, faLocationDot, faPuzzlePiece, faRotateLeft, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import type { Edition, GameAvailability, ParentGameRef, Pricing, RegionInfo, RegionOffer, SoftwareActivation } from '../../../types/game-details';
import { activationPlace } from '../../../utils/software';
import { countryName, regionExclusionsText, regionOfferTitle, regionSummaryText } from '../../../utils/region-text';
import { hasLicenseGrid, LicensePicker, licenseLabel, perDeviceYear } from './SoftwareLicenses';
import { useSitePreferences } from '../../../context/site-preferences';
import { useWishlist } from '../../../context/wishlist-context';
import { useCart } from '../../../context/cart-context';
import { Product, cartLineKey } from '../../../reducers/cart-reducer';
import container from '../../../inversify.config';
import IDENTIFIERS from '../../../constants/identifiers';
import type { IApiClient } from '../../../iterfaces/i-api-client';
import { formatReleaseDate } from '../../../utils/format-release-date';
import { keyTypeLabel } from './shared';
import { GameCashbackBadge } from '../../../components/cashback/CashbackHints';
import { formatMoney } from '../../../utils/format-money';

type PaymentMethodInfo = { method: string; available: boolean };

/** Способы оплаты, включённые для этой валюты, — тот же ответ, что читает чекаут. */
const usePaymentMethods = (currency: string) => {
  const [methods, setMethods] = useState<PaymentMethodInfo[]>([]);
  useEffect(() => {
    let cancelled = false;
    const api = container.get<IApiClient>(IDENTIFIERS.IApiClient).api;
    api
      .get(`/api/storefront/payment-methods?currency=${encodeURIComponent(currency)}`)
      .then(({ data }) => {
        if (cancelled) return;
        const list: PaymentMethodInfo[] = Array.isArray(data?.methods) ? data.methods : [];
        setMethods(list.filter((item) => item.available));
      })
      .catch(() => {
        if (!cancelled) setMethods([]);
      });
    return () => {
      cancelled = true;
    };
  }, [currency]);
  return methods;
};

/** «Скидка до 25 Aug» или «Ends in 5h» для последних суток — дедлайн подталкивает сильнее процента. */
const discountDeadline = (endsAt?: string | null) => {
  if (!endsAt) return null;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return null;
  const diffMs = end.getTime() - Date.now();
  if (diffMs <= 0) return null;
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return i18n.t('purchase.endsSoon');
  if (hours < 24) return i18n.t('purchase.endsInHours', { hours });
  const days = Math.floor(hours / 24);
  if (days < 3) return i18n.t('purchase.endsInDays', { days, hours: hours % 24 });
  return i18n.t('purchase.until', { date: formatLocalDate(end, { month: 'short', day: 'numeric' }) });
};

const AvailabilityPill = ({ availability }: { availability?: GameAvailability }) => {
  const { t } = useTranslation();
  const status = availability?.status ?? 'inStock';
  const map: Record<string, { label: string; mod: string }> = {
    inStock: { label: t('purchase.stock.inStock'), mod: 'ok' },
    lowStock: { label: t('purchase.stock.lowStock'), mod: 'low' },
    outOfStock: { label: t('common.outOfStock'), mod: 'out' },
    comingSoon: { label: t('common.comingSoon'), mod: 'soon' }
  };
  const view = map[status] ?? map.inStock;
  return (
    <span className={`purchase-stock purchase-stock--${view.mod}`}>
      <span className="purchase-stock__dot" aria-hidden="true" />
      {view.label}
    </span>
  );
};

const PaymentIcons = ({ methods }: { methods: PaymentMethodInfo[] }) => {
  const { t } = useTranslation();
  if (methods.length === 0) return null;
  const has = (name: string) => methods.some((m) => m.method === name);
  return (
    <div className="purchase-payments" aria-label={t('footer.paymentMethods')}>
      <span className="purchase-payments__label">{t('purchase.payWith')}</span>
      {has('card') && (
        <>
          <FontAwesomeIcon icon={faCcVisa} title="Visa" />
          <FontAwesomeIcon icon={faCcMastercard} title="Mastercard" />
        </>
      )}
      {has('crypto') && <FontAwesomeIcon icon={faBitcoin} title="Crypto (BTCPay)" />}
      {has('stars') && <FontAwesomeIcon icon={faTelegram} title="Telegram Stars" />}
    </div>
  );
};

export type PurchaseCardProps = {
  gameId: string;
  /** Адрес карточки — уезжает в позицию корзины, чтобы ссылка из корзины вела ровно сюда. */
  slug?: string;
  gameTitle: string;
  coverUrl?: string;
  /** Цена игры (или выбранного издания) в валюте витрины; null — в этой валюте не продаётся. */
  pricing: Pricing | null;
  siteCurrency: string;
  editions: Edition[];
  editionPricing: Record<string, Pricing | null>;
  editionAvailability?: Record<string, GameAvailability>;
  selectedEditionCode: string;
  onSelectEdition: (code: string) => void;
  availability?: GameAvailability;
  /** Для DLC — базовая игра: без неё ключ не активируется, говорим об этом до покупки. */
  parentGame?: ParentGameRef | null;
  /** Регион активации и подходит ли он стране покупателя. */
  regionInfo?: RegionInfo;
  /** Варианты ключа с ценами. Пусто — вариант один, выбирать нечего. */
  regionOffers?: RegionOffer[] | null;
  keyType: number | string;
  isComingSoon?: boolean;
  releaseDate?: string | null;
  /** ПО: издания — лицензии (срок × устройства), ключ активируется у вендора, а не на игровой площадке. */
  software?: boolean;
  activation?: SoftwareActivation | null;
};

/**
 * Карточка покупки — главный блок страницы. Всё, что влияет на решение «беру», собрано здесь:
 * наличие, цена со сроком скидки, выбор издания, где активировать ключ, чем заплатить, доставка и возврат.
 */
const PurchaseCard = ({
  gameId,
  slug,
  gameTitle,
  coverUrl,
  pricing,
  siteCurrency,
  editions,
  editionPricing,
  editionAvailability,
  selectedEditionCode,
  onSelectEdition,
  availability,
  parentGame,
  regionInfo,
  regionOffers,
  keyType,
  isComingSoon,
  releaseDate,
  software = false,
  activation
}: PurchaseCardProps) => {
  const { t } = useTranslation();
  const { isWishlisted, toggle } = useWishlist();
  const { state: cartState, dispatch } = useCart();
  const paymentMethods = usePaymentMethods(siteCurrency);
  const wishlisted = isWishlisted(gameId);
  const selectedEdition = editions.find((edition) => edition.code === selectedEditionCode);
  const showEditions = editions.length > 1;
  // У ПО издания — лицензии: выбираем кнопками «срок» и «устройства», а не списком изданий.
  const licenseGrid = software && hasLicenseGrid(editions);
  // Позиция корзины — игра + издание: Standard в корзине не значит, что Deluxe тоже там.
  /**
   * Выбранный вариант ключа. По умолчанию — самый дешёвый из тех, что работают у покупателя:
   * ставить первым тот, который ему не активировать, значит показывать цену, которой он
   * воспользоваться не может. Список уже отсортирован сервером по цене.
   */
  const offers = regionOffers ?? [];
  const defaultOffer = offers.find((offer) => offer.allowed !== false) ?? offers[0];
  const [selectedOfferKey, setSelectedOfferKey] = useState<string | undefined>(defaultOffer?.offerKey);
  useEffect(() => {
    setSelectedOfferKey(defaultOffer?.offerKey);
  }, [defaultOffer?.offerKey]);

  const selectedOffer = offers.find((offer) => offer.offerKey === selectedOfferKey) ?? defaultOffer;
  /**
   * Цена, которую видит покупатель и которая уезжает в корзину. Цены вариантов сервер считает для базовой игры,
   * поэтому к надстроечному изданию (Deluxe) они не относятся: касса возьмёт цену издания (или его собственную
   * региональную цену). Показывать здесь цену варианта значило бы обещать 46.99 и списать 79.99. Для игры без
   * изданий и для издания по умолчанию цена варианта — та, что спишут.
   */
  const defaultEdition = editions.find((edition) => edition.isDefault) ?? editions[0];
  const offerPriceApplies = !showEditions || !selectedEdition || selectedEdition.code === defaultEdition?.code;
  const unitPrice = offerPriceApplies ? selectedOffer?.price ?? pricing?.price : pricing?.price;

  const lineKey = cartLineKey({
    gameId,
    editionCode: showEditions ? selectedEdition?.code : undefined,
    offerKey: selectedOffer?.offerKey,
  });
  const inCart = cartState.items.some((item) => cartLineKey(item) === lineKey);
  // Наличие — у выбранного издания свой пул ключей; без изданий — общий статус игры.
  const effectiveAvailability = showEditions && selectedEdition ? (editionAvailability?.[selectedEdition.code] ?? availability) : availability;
  const outOfStock = effectiveAvailability?.status === 'outOfStock';
  const keyLabel = keyTypeLabel(keyType);
  const deadline = discountDeadline(pricing?.discountEndsAt);
  const { country, countries, countrySource, ipCountry } = useSitePreferences();
  // Ключ не активируется в стране покупателя — покупку не даём: он не заработает, а возврат — боль обоим.
  const regionBlocked = regionInfo?.allowed === false;
  const nameOf = (code: string | null) => (code ? countryName(code, countries.find((c) => c.code === code)?.name) : null);
  const buyerCountryName = nameOf(country);
  // Страна по IP расходится с той, по которой проверяем регион, — похоже на VPN/прокси:
  // ключ выдаётся под выбранную страну, и активировать его из-под VPN может не получиться.
  const vpnSuspected = Boolean(ipCountry && country && ipCountry !== country);
  const countrySourceLabel =
    countrySource === 'user' ? t('purchase.source.user') : countrySource === 'geo' ? t('purchase.source.geo') : countrySource === 'timezone' ? t('purchase.source.timezone') : null;
  // Страна важна только когда ключ где-то не работает: у полностью глобального ключа она ни на что
  // не влияет, и сообщать «мы решили, что вы в России» без причины — лишнее.
  const regionMatters = Boolean(regionInfo && (regionInfo.mode !== 'Global' || regionInfo.excludedCountries.length > 0));

  const handleCartClick = () => {
    if (inCart) {
      dispatch({ type: 'REMOVE_FROM_CART', payload: lineKey });
      return;
    }
    if (!pricing || unitPrice == null) return;
    const payload: Product = {
      gameId,
      slug,
      name: gameTitle,
      // Ровно та цена, что показана на кнопке: класть в корзину другую значит соврать покупателю до кассы.
      price: unitPrice,
      quantity: 1,
      image: coverUrl ?? '',
      // У ПО в корзине подпись лицензии («1 year · 3 devices»): название издания админ может назвать как угодно.
      ...(selectedEdition && showEditions
        ? { editionCode: selectedEdition.code, editionTitle: licenseGrid ? licenseLabel(selectedEdition) : selectedEdition.title }
        : {}),
      ...(selectedOffer ? { offerKey: selectedOffer.offerKey, offerTitle: selectedOffer.title } : {})
    };
    dispatch({ type: 'ADD_TO_CART', payload });
    // Событие отправляет корзина — одно на все кнопки магазина, см. CartProvider.
  };

  return (
    <div className="purchase-card card">
      {/* Рейтинг здесь не живёт: он под названием игры (TitleRating), в карточке — только наличие. */}
      <div className="purchase-card__top">
        <AvailabilityPill availability={isComingSoon ? { status: 'comingSoon' } : effectiveAvailability} />
      </div>

      {/* Варианты ключа: где активируется и сколько стоит. Дешёвый первым — так их и
          сравнивают. Недоступный вариант не прячем: покупателю важно видеть, что дешёвая
          цена существует, но не для его страны, — иначе он решит, что магазин дороже. */}
      {offers.length > 1 && (
        <div className="purchase-offers" role="radiogroup" aria-label={t('purchase.keyRegion')}>
          {offers.map((offer) => {
            const blocked = offer.allowed === false;
            return (
              <button
                key={offer.offerKey}
                type="button"
                role="radio"
                aria-checked={offer.offerKey === selectedOffer?.offerKey}
                className={`purchase-offer${offer.offerKey === selectedOffer?.offerKey ? ' is-selected' : ''}${blocked ? ' is-blocked' : ''}`}
                onClick={() => setSelectedOfferKey(offer.offerKey)}
              >
                <span className="purchase-offer__main">
                  <span className="purchase-offer__title">{regionOfferTitle(offer)}</span>
                  <span className="purchase-offer__note">
                    {blocked ? (buyerCountryName ? t('purchase.notForCountry', { country: buyerCountryName }) : t('common.notForYourCountry')) : regionSummaryText(offer)}
                    {regionExclusionsText(offer) ? ` · ${regionExclusionsText(offer)}` : ''}
                  </span>
                </span>
                <span className="purchase-offer__price">{formatMoney(offer.price, offer.currency)}</span>
              </button>
            );
          })}
        </div>
      )}

      {pricing ? (
        <div className="purchase-price">
          <div className="price-row">
            <span className="price">{formatMoney(pricing.price, pricing.currency)}</span>
            {!isComingSoon && pricing.oldPrice != null && <span className="old-price">{formatMoney(pricing.oldPrice, pricing.currency)}</span>}
            {!isComingSoon && pricing.discountPercent ? <span className="discount-badge">−{Math.round(pricing.discountPercent)}%</span> : null}
          </div>
          {!isComingSoon && deadline && <span className="discount-deadline">{deadline}</span>}
          {licenseGrid && perDeviceYear(selectedEdition, pricing) && <span className="license-per-unit">{perDeviceYear(selectedEdition, pricing)}</span>}
          {/* До выхода игры заказать нельзя — и обещать с неё кэшбэк рано. */}
          {!isComingSoon && <GameCashbackBadge price={pricing.price} currency={pricing.currency} />}
        </div>
      ) : (
        <div className="purchase-price purchase-price--na">
          <span className="price">{t('purchase.notSoldIn', { currency: siteCurrency })}</span>
          <span className="discount-deadline">{t('purchase.switchCurrency')}</span>
        </div>
      )}

      {licenseGrid && (
        <>
          <LicensePicker
            editions={editions}
            editionPricing={editionPricing}
            editionAvailability={editionAvailability}
            selectedCode={selectedEditionCode}
            onSelect={onSelectEdition}
            siteCurrency={siteCurrency}
          />
          <p className="license-summary">
            {t('purchase.youGet')} <strong>{t('purchase.oneKey', { license: licenseLabel(selectedEdition) })}</strong>
            {selectedEdition?.isSubscription ? t('purchase.subscriptionSuffix') : ''}.
          </p>
        </>
      )}

      {showEditions && !licenseGrid && (
        <div className="purchase-editions" role="radiogroup" aria-label={t('purchase.edition')}>
          {editions.map((edition) => {
            const p = editionPricing[edition.code] ?? null;
            const active = edition.code === selectedEditionCode;
            const stock = editionAvailability?.[edition.code]?.status;
            const soldOut = stock === 'outOfStock';
            return (
              <label key={edition.code} className={`purchase-edition${active ? ' is-active' : ''}${p ? '' : ' is-unavailable'}${soldOut ? ' is-soldout' : ''}`}>
                <input type="radio" name="edition" checked={active} disabled={!p} onChange={() => onSelectEdition(edition.code)} />
                <span className="purchase-edition__body">
                  <span className="purchase-edition__title">
                    {edition.title}
                    {soldOut ? <span className="purchase-edition__stock purchase-edition__stock--out">{t('common.outOfStock')}</span> : stock === 'lowStock' ? <span className="purchase-edition__stock purchase-edition__stock--low">{t('purchase.stock.lowStock')}</span> : null}
                  </span>
                  {edition.includedItems && edition.includedItems.length > 0 ? (
                    <span className="purchase-edition__desc">{edition.includedItems.join(' · ')}</span>
                  ) : edition.description ? (
                    <span className="purchase-edition__desc">{edition.description}</span>
                  ) : null}
                </span>
                <span className="purchase-edition__price">
                  {p ? (
                    <>
                      {formatMoney(p.price, p.currency)}
                      {p.oldPrice != null && <small>{formatMoney(p.oldPrice, p.currency)}</small>}
                    </>
                  ) : (
                    <small>{t('product.notInCurrency', { currency: siteCurrency })}</small>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {regionBlocked && (
        <div className="purchase-region-warning" role="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <span>
            {t('purchase.cantActivateIn')} <strong>{buyerCountryName ?? regionInfo?.buyerCountry}</strong>. {regionInfo ? regionSummaryText(regionInfo) : ''}
            {regionInfo && regionExclusionsText(regionInfo) ? ` · ${regionExclusionsText(regionInfo)}` : ''}. {t('purchase.wrongCountry')}
          </span>
        </div>
      )}

      {/* Страна по IP не совпадает с выбранной — обычно VPN или прокси. Ключ выдаётся под выбранную
          страну, и активировать его, сидя под VPN, может не получиться: предупреждаем до покупки. */}
      {vpnSuspected && regionMatters && !regionBlocked && (
        <div className="purchase-region-notice">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <span>
            <Trans i18nKey="purchase.vpnNotice" values={{ ip: nameOf(ipCountry), country: buyerCountryName }} components={{ b: <strong /> }} />
          </span>
        </div>
      )}

      <div className="purchase-actions">
        {isComingSoon ? (
          <div className="purchase-coming-soon">
            <span className="purchase-coming-soon-chip">{t('common.comingSoon')}</span>
            <span className="purchase-coming-soon-date">
              {formatReleaseDate(releaseDate) ? t('purchase.releases', { date: formatReleaseDate(releaseDate) }) : t('purchase.releaseTba')}
            </span>
          </div>
        ) : (
          <button
            className={`btn ${inCart ? 'btn-outline' : 'btn-primary'} purchase-cta`}
            type="button"
            onClick={handleCartClick}
            disabled={!pricing || ((outOfStock || regionBlocked) && !inCart)}
          >
            {inCart ? t('common.removeFromCart') : regionBlocked ? t('purchase.notAvailableCountry') : outOfStock ? t('common.outOfStock') : t('common.addToCart')}
          </button>
        )}
        <button
          className={`btn ${isComingSoon && !wishlisted ? 'btn-primary' : 'btn-outline'} purchase-wishlist ${wishlisted ? 'is-active' : ''}`}
          type="button"
          onClick={() => toggle(gameId)}
          aria-pressed={wishlisted}
          title={wishlisted ? t('purchase.inYourWishlist') : t('common.addToWishlist')}
        >
          <svg viewBox="0 0 24 24" className="purchase-wishlist-icon" fill={wishlisted ? 'currentColor' : 'none'} aria-hidden="true">
            <path
              d="M12 20.2c-4.4-2.8-7.4-5.5-8.7-8.4-1.4-3.1.5-6.5 3.9-6.8 2.1-.2 3.6.8 4.8 2.2 1.2-1.4 2.7-2.4 4.8-2.2 3.4.3 5.3 3.7 3.9 6.8-1.3 2.9-4.3 5.6-8.7 8.4Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          {wishlisted ? t('purchase.inWishlist') : t('purchase.wishlist')}
        </button>
      </div>

      <ul className="purchase-facts">
        {parentGame && (
          <li className="purchase-facts__dlc">
            <FontAwesomeIcon icon={faPuzzlePiece} />
            <span>
              {t('purchase.requiresBase')} <Link to={`/games/${parentGame.slug}`}>{parentGame.title}</Link>
            </span>
          </li>
        )}
        <li>
          <FontAwesomeIcon icon={faKey} />
          <span>
            {software ? t('purchase.activateOn') : t('catalog.activatesOn')}{' '}
            <strong>{software ? activationPlace(activation) : keyLabel}</strong> ·{' '}
            {software ? <a href="#activation">{t('purchase.howToActivate')}</a> : <Link to="/support/docs/activation-guide">{t('purchase.howToActivate')}</Link>}
          </span>
        </li>
        {regionInfo && (
          <li className={regionBlocked ? 'purchase-facts__region purchase-facts__region--blocked' : 'purchase-facts__region'}>
            <FontAwesomeIcon icon={faEarthEurope} />
            <span>
              {regionSummaryText(regionInfo)}
              {regionExclusionsText(regionInfo) ? <> · <strong>{regionExclusionsText(regionInfo)}</strong></> : null}
            </span>
          </li>
        )}
        {/* Страну показываем только там, где она на что-то влияет (у ключа есть ограничения), и
            всегда говорим, откуда она взялась: «works in Russia» зелёным выглядело так, будто мы
            уверенно знаем, где человек, хотя чаще это догадка по часовому поясу. */}
        {regionMatters && (
          <li className="purchase-facts__country">
            <FontAwesomeIcon icon={faLocationDot} />
            {buyerCountryName ? (
              <span>
                {t('purchase.checkedFor')} <strong>{buyerCountryName}</strong>
                {countrySourceLabel ? <span className="purchase-facts__hint"> — {countrySourceLabel}</span> : null}
                <span className="purchase-facts__hint">{t('purchase.notYourCountry')}</span>
              </span>
            ) : (
              <span>
                {t('purchase.setCountry')}
              </span>
            )}
          </li>
        )}
        <li>
          <FontAwesomeIcon icon={faBolt} />
          <span>{isComingSoon ? t('purchase.deliveredOnRelease') : t('purchase.instantDelivery')}</span>
        </li>
        <li>
          <FontAwesomeIcon icon={faRotateLeft} />
          <span>
            <Link to="/support/docs/refund-policy">{t('purchase.refundPolicy')}</Link>{t('purchase.refundNote')}
          </span>
        </li>
        {/* Вместо публичного Q&A: вопрос уходит в чат поддержки, где на него точно ответят,
            и ничего не висит на странице без ответа. */}
        <li>
          <FontAwesomeIcon icon={faCircleQuestion} />
          <span>
            {t('purchase.haveQuestion')}{' '}
            <button type="button" className="purchase-facts__link" onClick={() => window.dispatchEvent(new Event('taleshop:open-support-chat'))}>
              {t('purchase.askSupport')}
            </button>
          </span>
        </li>
      </ul>

      <PaymentIcons methods={paymentMethods} />
    </div>
  );
};

export default PurchaseCard;
