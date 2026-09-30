import {useTranslation} from 'react-i18next';
import React, {useEffect, useRef, useState} from 'react';
import {useCart} from '../../../context/cart-context';
import {analyticsClient} from '../../../utils/analytics-client';
import {checkCartRegions, type CartItemRegion} from '../../../api/regionApi';
import {countryName as countryNameOf, regionExclusionsText, regionLineText, regionSummaryText, regionTitleText} from '../../../utils/region-text';
import CountryPickerPopover from './CountryPickerPopover';
import KeyDetailsPopover from './KeyDetailsPopover';
import {gaItemVariant, ITEM_LISTS, trackItemSelect, useItemListView} from '../../../utils/item-list-tracking';
import {productHref} from '../../../utils/software';
import {Link, useSearchParams} from "react-router-dom";
import container from "../../../inversify.config";
import {IUrlService} from "../../../iterfaces/i-url-service";
import {IApiClient} from "../../../iterfaces/i-api-client";
import IDENTIFIERS from "../../../constants/identifiers";
import {useRecommendations} from '../../../hooks/use-recommendations';
import RecommendationsSection from '../../../components/recommendations/recommendations-section';
import type {RecommendationItem} from '../../../models/recommendations';
import {
    faArrowRotateLeft,
    faBolt,
    faCartPlus,
    faCircleCheck,
    faShieldHalved
} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {Product, cartLineKey} from "../../../reducers/cart-reducer";
import Cover from "../../common/Cover";
import HoverTrailer from "../../common/HoverTrailer";
import {useSitePreferences} from "../../../context/site-preferences";
import {formatMoney} from "../../../utils/format-money";
import {CartCashbackNote} from "../../cashback/CashbackHints";
import './cart.css';

type CartItemRowProps = {
    item: Product;
    onIncrease: (id: string) => void;
    onDecrease: (id: string) => void;
    onRemove: (id: string) => void;
    imageBaseUrl: string;
    /** Регион этой позиции. undefined — ещё не загрузили, null — ограничений нет. */
    region?: CartItemRegion | null;
};

type OrderSummaryProps = {
    subtotal: number;
    total: number;
};

const PAYMENT_BADGES = ['Visa', 'Mastercard', 'PayPal', 'Apple Pay', 'Google Pay'];

/** Срок возврата магазина. Одно число на страницу: подсказка у позиции и плашка внизу — про него же. */
const REFUND_DAYS = 14;

const CartItemRow: React.FC<CartItemRowProps> = ({item, onIncrease, onDecrease, onRemove, imageBaseUrl, region}) => {
    const {t} = useTranslation();
    const itemTotal = item.price * item.quantity;
    const {currency} = useSitePreferences();
    // Адрес — по slug позиции, как у карточек каталога; только у старых позиций без slug — из названия.
    const gameHref = productHref({slug: item.slug, name: item.name});

    return (
        <div className="cart-item">
            {/* Из корзины можно вернуться к игре и обратно: обложка и название — обычные ссылки,
                поэтому работают и «в новой вкладке», и кнопка «назад». */}
            <Link className="cart-item-media" to={gameHref}>
                <Cover ratio="square" sizes="104px" src={item.image} title={item.name} baseUrl={imageBaseUrl} />
            </Link>
            <div className="cart-item-body">
                <div className="cart-item-top">
                    <div>
                        <h3 className="cart-item-name">
                            <Link className="cart-item-name-link" to={gameHref}>{item.name}</Link>
                        </h3>
                        {/* Издание — из позиции; захардкоженные «Platform/Region/Edition: Standard» раньше врали для любого товара. */}
                        {item.editionTitle && <p className="cart-item-meta">{t('cart.edition', {edition: item.editionTitle})}</p>}
                        {/* Выбранный вариант ключа: покупатель выбрал именно его и должен видеть,
                            что в корзине лежит он, а не «какой-нибудь» ключ этой игры. */}
                        {item.offerTitle && <p className="cart-item-meta">{t('cart.keyRegion', {region: regionTitleText(item.offerTitle)})}</p>}
                        {/* Регион — такое же свойство ключа, как издание. Показываем здесь, а не
                            прячем до кассы: узнать о запрете после оплаты хуже всего. */}
                        {region?.badge && (
                            <p className={`cart-item-region${region.allowed === false ? ' is-blocked' : ''}`}>
                                {region.allowed === false
                                    // Под запретом причина важнее общего описания: «не активируется у вас —
                                    // Activates worldwide» читается как противоречие, а «Not in RU, BY» объясняет.
                                    ? t('cart.notInCountry', {reason: regionExclusionsText(region) ?? regionSummaryText(region)})
                                    : regionLineText(region)}
                            </p>
                        )}
                    </div>
                    <div className="cart-item-price">{formatMoney(itemTotal, currency)}</div>
                </div>
                <div className="cart-chips">
                    <span className="cart-chip"><FontAwesomeIcon icon={faCircleCheck}/>{t('cart.verifiedKey')}</span>
                    <KeyDetailsPopover
                        region={region}
                        edition={item.editionTitle}
                        offer={item.offerTitle}
                        refundDays={REFUND_DAYS}
                    />
                </div>
                <div className="cart-item-actions">
                    <div className="cart-item-links">
                        <button type="button" className="cart-item-link" onClick={() => onRemove(cartLineKey(item))}>{t('common.remove')}</button>
                        <button type="button" className="cart-item-link">{t('cart.saveForLater')}</button>
                    </div>
                    <div className="qty-control">
                        <button type="button" className="qty-btn" aria-label={t('cart.decrease')} onClick={() => onDecrease(cartLineKey(item))}>−</button>
                        <span className="qty-value">{item.quantity}</span>
                        <button type="button" className="qty-btn" aria-label={t('cart.increase')} onClick={() => onIncrease(cartLineKey(item))}>+</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const OrderSummary: React.FC<OrderSummaryProps> = ({subtotal, total}) => {
    const {t} = useTranslation();
    const {currency} = useSitePreferences();

    return (
        <div className="card cart-summary">
            <div className="cart-summary-head">
                <h2>{t('cart.orderSummary')}</h2>
                <span className="badge">{t('common.secureCheckout')}</span>
            </div>
            <div className="cart-summary-lines">
                <div className="cart-summary-line"><span>{t('common.subtotal')}</span><strong>{formatMoney(subtotal, currency)}</strong></div>
                {/* Цены с налогом: итог корзины и есть сумма к оплате, налог в нём уже учтён. */}
                <div className="cart-summary-line cart-summary-line-muted"><span>{t('common.taxes')}</span><span>{t('common.includedInPrice')}</span></div>
                <div className="cart-summary-line cart-summary-line-muted"><span>{t('cart.promoCode')}</span><span>{t('cart.applyAtCheckout')}</span></div>
            </div>
            <div className="cart-summary-total">
                <span>{t('common.total')}</span>
                <span className="cart-summary-amount">{formatMoney(total, currency)}</span>
            </div>
            {/* Кэшбэк — со всей суммы заказа. От региона активации он не зависит: про регион корзина
                предупреждает отдельно, своей плашкой над позициями. */}
            <CartCashbackNote total={total} currency={currency}/>
            <div className="cart-summary-actions">
                <Link to="/checkout" className="btn btn-primary">{t('cart.checkout')}</Link>
                <Link to="/" className="btn btn-outline">{t('common.continueShopping')}</Link>
            </div>
            <div className="cart-pay-badges">
                {PAYMENT_BADGES.map((label) => <span key={label} className="cart-pay-badge">{label}</span>)}
            </div>
        </div>
    );
};

const TrustStrip: React.FC = () => {
    const {t} = useTranslation();
    return (
    <div className="card cart-trust">
        {[
            {icon: faBolt, title: t('cart.trust.instantTitle'), text: t('cart.trust.instantText')},
            {icon: faShieldHalved, title: t('cart.trust.secureTitle'), text: t('cart.trust.secureText')},
            {icon: faArrowRotateLeft, title: t('cart.trust.refundTitle'), text: t('cart.trust.refundText', {days: REFUND_DAYS})},
        ].map((feature) => (
            <div key={feature.title} className="cart-trust-item">
                <span className="cart-trust-icon"><FontAwesomeIcon icon={feature.icon}/></span>
                <div className="cart-trust-text">
                    <h4>{feature.title}</h4>
                    <p>{feature.text}</p>
                </div>
            </div>
        ))}
    </div>
    );
};

const RecommendedRow: React.FC = () => {
    const {t} = useTranslation();
    const {
        items: recommended,
        isLoading: isRecommendationsLoading,
        error: recommendationsError,
        reload: reloadRecommendations
    } = useRecommendations(4);
    const {state, dispatch} = useCart();
    const {currency} = useSitePreferences();

    // Показ подборки рекомендаций: без него клики по ней не с чем сравнивать.
    useItemListView(
        ITEM_LISTS.recommendationsCart,
        recommended.map((item) => ({ id: item.game.id, title: item.game.title, price: Number(item.game.finalPrice ?? item.game.price) })),
        currency,
    );

    // Добавление в корзину — тот же контракт, что в GameCard: цена с учётом активной скидки.
    const handleAddRecommended = (game: RecommendationItem['game']) => {
        const regularPrice = Number.isFinite(game.price) ? Number(game.price) : 0;
        const finalPrice = Number.isFinite(game.finalPrice ?? game.price) ? Number(game.finalPrice ?? game.price) : regularPrice;

        dispatch({
            type: 'ADD_TO_CART',
            payload: {
                gameId: game.id ?? '',
                slug: game.slug,
                name: game.title ?? game.name,
                price: finalPrice,
                quantity: 1,
                image: game.imagePath
            } as Product,
        });

        // Событие отправляет корзина — одно на все кнопки магазина, см. CartProvider.
    };

    return (
        <div className="card">
            <div className="cart-recs-head">
                <h2>{t('cart.recommended')}</h2>
                <Link to="/games" className="link-arrow">
                    {t('common.browseGames')}
                    <span className="link-arrow__icon" aria-hidden="true">→</span>
                </Link>
            </div>
            <RecommendationsSection
                items={recommended}
                isLoading={isRecommendationsLoading}
                error={recommendationsError}
                onRetry={reloadRecommendations}
                emptyMessage={t('cart.recommendedEmpty')}
                listClassName="cart-recs-grid"
                renderSkeleton={(index) => <div key={`rec-skeleton-${index}`} className="cart-recs-skeleton"/>}
                renderItem={(item, index) => {
                    const game = item.game;
                    const href = productHref(game);
                    const price = Number(game.price);
                    const finalPrice = Number(game.finalPrice ?? game.price);
                    const discounted = Number.isFinite(finalPrice) && Number.isFinite(price) && finalPrice < price;
                    const priceCurrency = game.currency ?? currency;
                    // Уже в корзине — это видно прямо над подборкой, и кнопка «Add» рядом со
                    // списком, где игра уже лежит, сбивает с толку.
                    const inCart = state.items.some((line) => line.gameId === game.id);

                    return (
                        <div
                            key={game.id ?? game.title}
                            className="cart-rec"
                            data-hover-trailer-root=""
                            onClick={() => trackItemSelect(
                                ITEM_LISTS.recommendationsCart,
                                { id: game.id, title: game.title, price: finalPrice },
                                index,
                                currency,
                            )}
                        >
                            {/* Строка ведёт на страницу игры: раньше клик по карточке только
                                считался в аналитике, а внешне она выглядела кликабельной. */}
                            <Link className="cart-rec-media" to={href}>
                                <Cover ratio="square" sizes="76px" src={game.imagePath} title={game.title}>
                                    <HoverTrailer src={game.trailerUrl} poster={game.trailerPosterUrl} title={game.title} />
                                </Cover>
                            </Link>
                            <div className="cart-rec-body">
                                <h3 className="cart-rec-title">
                                    <Link className="cart-rec-title-link" to={href}>{game.title}</Link>
                                </h3>
                                {/* Почему игра здесь оказалась. Раньше на этом месте у всех стояло
                                    «Steam» — площадка, которой в данных рекомендации нет вовсе. */}
                                {item.reason && <p className="cart-rec-reason">{item.reason}</p>}
                            </div>
                            <div className="cart-rec-price">
                                {/* Цена со скидкой — та же, что спишут: карточка показывала
                                    полную, а в корзину клала уже уценённую. */}
                                {discounted && (
                                    <span className="cart-rec-price-old">{formatMoney(price, priceCurrency)}</span>
                                )}
                                <span className="cart-rec-price-now">{formatMoney(finalPrice, priceCurrency)}</span>
                            </div>
                            {inCart ? (
                                // Не кнопка: добавлять нечего, игра уже в заказе выше. Подпись —
                                // в title и для читалки экрана, на строке хватает галочки.
                                <span className="cart-rec-action is-in-cart" title={t('cart.alreadyInCart')}>
                                    <FontAwesomeIcon icon={faCircleCheck}/>
                                    <span className="visually-hidden">{t('cart.alreadyInCart')}</span>
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    className="cart-rec-action"
                                    title={t('cart.addToCartTitle', {title: game.title})}
                                    aria-label={t('cart.addToCartTitle', {title: game.title})}
                                    onClick={() => handleAddRecommended(game)}
                                >
                                    <FontAwesomeIcon icon={faCartPlus}/>
                                </button>
                            )}
                        </div>
                    );
                }}
            />
        </div>
    );
};

const Cart: React.FC = () => {
    const {t} = useTranslation();
    const {state, dispatch} = useCart();
    const viewCartSent = useRef(false);
    const {country, countrySource, countries, setCountry} = useSitePreferences();
    const [regions, setRegions] = useState<Record<string, CartItemRegion>>({});
    const [isCountryOpen, setCountryOpen] = useState(false);
    const countryName = country ? countryNameOf(country, countries.find((option) => option.code === country)?.name) : null;

    /**
     * Регионы позиций. Перезапрашиваются при смене страны — покупатель меняет её прямо здесь,
     * и ответ обязан обновиться сразу, иначе он поменяет страну и увидит прежний запрет.
     */
    useEffect(() => {
        const ids = state.items.map((item) => item.gameId).filter(Boolean);
        if (ids.length === 0) {
            setRegions({});
            return;
        }

        let cancelled = false;
        checkCartRegions(ids)
            .then((response) => {
                if (cancelled) {
                    return;
                }
                const next: Record<string, CartItemRegion> = {};
                for (const row of response.items) {
                    next[row.gameId] = row;
                }
                setRegions(next);
            })
            // Молча: регион — подсказка, а не условие показа корзины. Отказ сервера не должен
            // прятать товары, которые покупатель уже выбрал.
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [state.items, country]);

    const blockedCount = state.items.filter((item) => regions[item.gameId]?.allowed === false).length;
    const [searchParams, setSearchParams] = useSearchParams();
    const seededRef = useRef<Set<string>>(new Set());
    const {currency} = useSitePreferences();

    // Валюта сменилась — цены в корзине выражены в прежней и больше ничего не значат.
    // Помечаем корзину новой валютой (позиции обнулятся) и перезапрашиваем товары:
    // пересчитывать на фронте нечем и не нужно, цену в каждой валюте назначает каталог.
    useEffect(() => {
        if (state.currency === currency) {
            return;
        }

        dispatch({type: 'SET_CURRENCY', payload: currency});
        // Позволяем дозагрузить цены заново тем же путём, что и deep-link из бота.
        seededRef.current.clear();
    }, [currency, dispatch, state.currency, state.items.length]);

    /**
     * Просмотр корзины. Отправляется один раз за визит на страницу и только когда в корзине
     * что-то есть: пустая корзина — не шаг воронки, и считать её намерением купить значит
     * завышать шаг для всех, кто просто кликнул по иконке.
     *
     * Цены позиций подгружаются с сервера уже после открытия страницы, поэтому ждём, пока
     * сумма перестанет быть нулевой, — иначе в аналитику ушла бы корзина на ноль.
     */
    useEffect(() => {
        if (viewCartSent.current || state.items.length === 0) {
            return;
        }
        const value = state.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        if (value <= 0) {
            return;
        }

        viewCartSent.current = true;
        analyticsClient.trackEcommerce('view_cart', {
            currency: state.currency ?? currency,
            value,
            items: state.items.map((item) => ({
                item_id: item.gameId,
                item_name: item.name,
                price: item.price,
                quantity: item.quantity,
                ...(item.category ? { item_category: item.category } : {}),
                ...(gaItemVariant(item) ? { item_variant: gaItemVariant(item) } : {}),
            })),
        });
    }, [state.items, state.currency, currency]);

    // Позиции с обнулённой ценой (после смены валюты) добираем из каталога — уже в новой валюте.
    useEffect(() => {
        const stale = state.items.filter((item) => item.price === 0 && !seededRef.current.has(cartLineKey(item)));
        if (stale.length === 0) {
            return;
        }

        stale.forEach((item) => seededRef.current.add(cartLineKey(item)));

        (async () => {
            const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
            for (const item of stale) {
                try {
                    // У позиции с изданием — цена издания: тот же эндпоинт с editionCode.
                    const editionQuery = item.editionCode ? `&editionCode=${encodeURIComponent(item.editionCode)}` : '';
                    // Вариант ключа тоже: у европейского своя цена, и спрашивать цену игры
                    // значит подменить выбранную покупателем строку на более дорогую.
                    const offerQuery = item.offerKey ? `&offerKey=${encodeURIComponent(item.offerKey)}` : '';
                    const {data} = await apiClient.api.get(`/api/game/${item.gameId}?currency=${encodeURIComponent(currency)}${editionQuery}${offerQuery}`);
                    if (data?.id) {
                        // Только эта позиция и поверх текущего состояния: список, собранный из
                        // снимка на начало цикла, затирал бы цены, пришедшие до неё.
                        dispatch({
                            type: 'SET_ITEM_PRICES',
                            payload: {[cartLineKey(item)]: Number(data.finalPrice ?? data.price ?? 0)},
                        });
                    }
                } catch (error) {
                    console.error('Failed to refresh cart price after currency change', error);
                }
            }
        })();
    }, [currency, dispatch, state.items]);

    const subtotal = state.items.reduce((total, item) => total + item.price * item.quantity, 0);
    const total = subtotal;
    const itemCount = state.items.length;

    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);

    // Deep-link из бота: /cart?add=<gameId> кладёт игру в корзину и убирает параметр из URL.
    useEffect(() => {
        const gameId = searchParams.get('add');
        if (!gameId || seededRef.current.has(gameId)) {
            return;
        }
        seededRef.current.add(gameId);

        (async () => {
            try {
                const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
                // В валюте корзины: без неё в позицию легла бы цена в базовой валюте,
                // а показана она была бы со значком выбранной.
                const {data} = await apiClient.api.get(`/api/game/${gameId}?currency=${encodeURIComponent(currency)}`);
                if (data?.id) {
                    dispatch({
                        type: 'ADD_TO_CART',
                        payload: {
                            gameId: data.id,
                            slug: data.slug,
                            name: data.title ?? data.name ?? 'Game',
                            price: Number(data.finalPrice ?? data.price ?? 0),
                            quantity: 1,
                            image: data.imagePath ?? '',
                        },
                    });
                }
            } catch (error) {
                console.error('Failed to add game from deep-link', error);
            } finally {
                const next = new URLSearchParams(searchParams);
                next.delete('add');
                setSearchParams(next, {replace: true});
            }
        })();
    }, [searchParams, dispatch, setSearchParams]);

    const handleIncreaseQuantity = (id: string) => dispatch({type: 'INCREASE_QUANTITY', payload: id});
    const handleDecreaseQuantity = (id: string) => dispatch({type: 'DECREASE_QUANTITY', payload: id});

    return (
        <div className="cart-shell">
            <div className="cart-head">
                <div>
                    <p className="cart-eyebrow">{t('cart.eyebrow')}</p>
                    <h1 className="cart-title">{t('cart.title')}</h1>
                    <p className="cart-sub">{t('cart.subtitle')}</p>
                </div>
                <span className="badge">{t('cart.items', {count: itemCount})}</span>
            </div>


            {/* Страна активации — строкой, а не формой. Большинству покупателей она угадана
                верно и трогать её не нужно; список открывается только тем, кто активирует ключ
                в другой стране. Форма на видном месте пугает и заставляет что-то решать там,
                где решать нечего. */}
            <div className="cart-region-line">
                <span>
                    {t('cart.activatingIn')} <strong>{countryName ?? t('cart.notSelected')}</strong>
                    {' · '}
                    <button
                        type="button"
                        className="cart-region-change"
                        aria-expanded={isCountryOpen}
                        onClick={() => setCountryOpen((open) => !open)}
                    >
                        {t('common.change')}
                    </button>
                </span>
                {/* Панель раскрывается под строкой и не двигает её: подмена «change» на список
                    прямо в тексте меняла ширину строки и норовила закрыться от промаха. */}
                {isCountryOpen && (
                    <CountryPickerPopover
                        countries={countries}
                        value={country}
                        onSelect={setCountry}
                        onClose={() => setCountryOpen(false)}
                    />
                )}
            </div>

            {state.items.length === 0 ? (
                <div className="card cart-empty">
                    <h3>{t('cart.empty')}</h3>
                    <p>{t('cart.emptyText')}</p>
                    <Link to="/" className="btn btn-primary">{t('common.continueShopping')}</Link>
                </div>
            ) : (
                <div className="cart-layout">
                    <div className="card cart-items-card">
                        {blockedCount > 0 && (
                            <div className="cart-region-warning">
                                {t('cart.blocked', {count: blockedCount})}
                            </div>
                        )}

                        {state.items.map((item) => (
                            <CartItemRow
                                key={cartLineKey(item)}
                                item={item}
                                imageBaseUrl={urlService.apiBaseUrl}
                                onIncrease={handleIncreaseQuantity}
                                onDecrease={handleDecreaseQuantity}
                                onRemove={(id) => dispatch({type: 'REMOVE_FROM_CART', payload: id})}
                                region={regions[item.gameId] ?? null}
                            />
                        ))}
                    </div>

                    <aside className="cart-aside">
                        <OrderSummary subtotal={subtotal} total={total}/>
                        <TrustStrip/>
                    </aside>
                </div>
            )}

            <RecommendedRow/>
        </div>
    );
};

export default Cart;
