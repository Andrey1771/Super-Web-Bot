import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SafeGameImage from '../../components/common/SafeGameImage';
import { useSitePreferences } from '../../context/site-preferences';
import { formatMoney } from '../../utils/format-money';
import './miniapp-page.css';

// --- Минимальный контракт Telegram WebApp SDK (грузится динамически, только на этой странице) ---
type TgButton = {
    setText: (text: string) => void;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
};

type TgBackButton = {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
};

type TelegramWebApp = {
    ready: () => void;
    expand: () => void;
    initData: string;
    colorScheme: 'light' | 'dark';
    themeParams: Record<string, string>;
    openInvoice: (url: string, callback: (status: string) => void) => void;
    showAlert: (message: string) => void;
    MainButton: TgButton;
    BackButton: TgBackButton;
    HapticFeedback?: {
        notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
        impactOccurred: (style: 'light' | 'medium' | 'heavy') => void;
    };
};

type MiniAppGame = {
    id: string;
    name: string;
    title: string;
    imagePath?: string;
    description?: string;
    price: number;
    finalPrice?: number;
    discountActive?: boolean;
    discountPercent?: number;
    genres?: string[];
    /** Валюта цены. Не доллары — звёздами такую игру не продать, сервер откажет. */
    currency?: string;
    /** Статус релиза считает сервер; невышедшие показываем, но не продаём (бэкенд всё равно откажет). */
    isComingSoon?: boolean;
    releaseDate?: string;
};

// Дата релиза по-русски (Mini App — русская витрина), «скоро» — если даты нет/не парсится.
const releaseLabel = (game: MiniAppGame): string => {
    const parsed = game.releaseDate ? new Date(game.releaseDate) : null;
    return parsed && !Number.isNaN(parsed.getTime())
        ? parsed.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'скоро';
};

// Честные сигналы доверия (не выдуманное соцдоказательство) — реальные ценностные обещания магазина.
const TRUST_POINTS: { icon: string; label: string }[] = [
    { icon: '⚡', label: 'Моментальная выдача' },
    { icon: '✅', label: 'Официальные ключи' },
    { icon: '🛡️', label: 'Гарантия возврата' },
    { icon: '⭐', label: 'Оплата Telegram Stars' },
];

const genreOf = (game: MiniAppGame): string | null => game.genres?.find((g) => g && g.trim().length > 0) ?? null;

const gamesWord = (n: number): string => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'игра';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'игры';
    return 'игр';
};

type CartLine = { game: MiniAppGame; qty: number };
type View = 'catalog' | 'product' | 'cart';

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js';
const CART_STORAGE_KEY = 'taleshop_miniapp_cart_v1';
const MAX_QTY = 10;

const getWebApp = (): TelegramWebApp | null => (window as any)?.Telegram?.WebApp ?? null;

const loadSdk = (): Promise<TelegramWebApp | null> =>
    new Promise((resolve) => {
        const existing = getWebApp();
        if (existing) {
            resolve(existing);
            return;
        }
        const script = document.createElement('script');
        script.src = SDK_URL;
        script.async = true;
        script.onload = () => resolve(getWebApp());
        script.onerror = () => resolve(null);
        document.head.appendChild(script);
    });

// Красим страницу под тему клиента Telegram (переменные читает miniapp-page.css).
const applyTheme = (webApp: TelegramWebApp) => {
    const params = webApp.themeParams ?? {};
    const root = document.documentElement;
    const map: Record<string, string> = {
        '--tg-bg': params.bg_color ?? '#0f0f14',
        '--tg-text': params.text_color ?? '#ffffff',
        '--tg-hint': params.hint_color ?? '#8a8a99',
        '--tg-card': params.secondary_bg_color ?? '#1c1c26',
        '--tg-button': params.button_color ?? '#7c5cff',
        '--tg-button-text': params.button_text_color ?? '#ffffff',
    };
    Object.entries(map).forEach(([key, value]) => root.style.setProperty(key, value));
};

const priceOf = (game: MiniAppGame): number => Number(game.finalPrice ?? game.price ?? 0);
// Валюта витрины, а не символ в шаблоне: мини-апп показывает ту же цену, что и сайт.
const money = (value: number, currency: string): string => formatMoney(value, currency);
/**
 * USD→Stars по той же формуле, что на сервере (`StarPrice.FromUsd`): max(1, round(usd × ставка))
 * на позицию. Это ПРЕДПРОСМОТР — итоговую сумму инвойса считает сервер, и расходиться они
 * не должны, поэтому формула повторена дословно и правится только вместе с серверной.
 *
 * Ставка привязана к доллару, поэтому цена не в долларах здесь не считается: сервер в таком
 * случае откажет в оплате звёздами, и показывать цифру, которой не будет в инвойсе, нельзя.
 */
const starsOfUsd = (amount: number, rate: number, currency?: string): number | null => {
    if (currency && currency.toUpperCase() !== 'USD') {
        return null;
    }
    return Math.max(1, Math.round(amount * rate));
};

const readStoredCart = (): CartLine[] => {
    try {
        const raw = localStorage.getItem(CART_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((line) => line?.game?.id && line.qty > 0) : [];
    } catch {
        return [];
    }
};

const MiniAppPage: React.FC = () => {
    const { currency } = useSitePreferences();
    const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
    const [games, setGames] = useState<MiniAppGame[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [view, setView] = useState<View>('catalog');
    const [selected, setSelected] = useState<MiniAppGame | null>(null);
    const [search, setSearch] = useState('');
    const [cart, setCart] = useState<CartLine[]>(() => readStoredCart());
    const [checkingOut, setCheckingOut] = useState(false);
    const [starsPerUsd, setStarsPerUsd] = useState(50);

    // Инициализация SDK.
    useEffect(() => {
        loadSdk().then((app) => {
            if (app) {
                app.ready();
                app.expand();
                applyTheme(app);
                setWebApp(app);
            }
        });
    }, []);

    // Каталог.
    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const response = await fetch('/api/game');
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                setGames((await response.json()) as MiniAppGame[]);
            } catch (fetchError) {
                console.error('Failed to load catalog', fetchError);
                setError('Не удалось загрузить каталог.');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // Курс USD→Stars (реальная валюта оплаты в Telegram) — для показа цены в звёздах.
    useEffect(() => {
        fetch('/api/miniapp/config')
            .then((response) => (response.ok ? response.json() : null))
            .then((config) => {
                if (config?.starsPerUsd > 0) {
                    setStarsPerUsd(config.starsPerUsd);
                }
            })
            .catch(() => { /* остаётся дефолт 50 */ });
    }, []);

    // Корзина живёт в localStorage — переживает переоткрытие Mini App.
    useEffect(() => {
        try {
            localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
        } catch {
            /* приватный режим — просто не сохраняем */
        }
    }, [cart]);

    const haptic = useCallback((type: 'success' | 'warning' | 'error') => {
        webApp?.HapticFeedback?.notificationOccurred(type);
    }, [webApp]);

    // --- Операции с корзиной ---
    const cartCount = useMemo(() => cart.reduce((sum, line) => sum + line.qty, 0), [cart]);
    const cartTotal = useMemo(() => cart.reduce((sum, line) => sum + priceOf(line.game) * line.qty, 0), [cart]);
    // Звёзды считаем по позициям (как бэкенд), а не от итоговой суммы — чтобы цифра совпала с инвойсом.
    const cartStars = useMemo(
        () => cart.reduce((sum, line) => sum + (starsOfUsd(priceOf(line.game), starsPerUsd, line.game.currency) ?? 0) * line.qty, 0),
        [cart, starsPerUsd]);
    const qtyInCart = useCallback((id: string) => cart.find((line) => line.game.id === id)?.qty ?? 0, [cart]);

    const addToCart = useCallback((game: MiniAppGame, quantity = 1) => {
        if (game.isComingSoon) {
            haptic('warning');
            return;
        }
        setCart((prev) => {
            const existing = prev.find((line) => line.game.id === game.id);
            if (existing) {
                return prev.map((line) =>
                    line.game.id === game.id
                        ? { ...line, qty: Math.min(MAX_QTY, line.qty + quantity) }
                        : line);
            }
            return [...prev, { game, qty: Math.min(MAX_QTY, quantity) }];
        });
        haptic('success');
    }, [haptic]);

    const setQty = useCallback((id: string, qty: number) => {
        setCart((prev) => prev
            .map((line) => (line.game.id === id ? { ...line, qty: Math.max(0, Math.min(MAX_QTY, qty)) } : line))
            .filter((line) => line.qty > 0));
    }, []);

    const removeLine = useCallback((id: string) => {
        setCart((prev) => prev.filter((line) => line.game.id !== id));
    }, []);

    // --- Оформление всей корзины: один Stars-инвойс на заказ ---
    const checkout = useCallback(async () => {
        if (cart.length === 0) return;
        if (!webApp) {
            setError('Откройте магазин через бота в Telegram, чтобы оплатить.');
            return;
        }
        try {
            setCheckingOut(true);
            const response = await fetch('/api/miniapp/cart-invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    initData: webApp.initData,
                    items: cart.map((line) => ({ gameId: line.game.id, quantity: line.qty })),
                }),
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const { invoiceLink } = await response.json();
            webApp.openInvoice(invoiceLink, (status) => {
                if (status === 'paid') {
                    haptic('success');
                    setCart([]);
                    setView('catalog');
                    webApp.showAlert('Оплата прошла! Ключи придут в чат бота.');
                } else if (status === 'failed') {
                    haptic('error');
                    webApp.showAlert('Платёж не удался. Попробуйте ещё раз.');
                }
            });
        } catch (checkoutError) {
            console.error('Checkout failed', checkoutError);
            webApp.showAlert('Не удалось начать оплату. Попробуйте позже.');
        } finally {
            setCheckingOut(false);
        }
    }, [cart, webApp, haptic]);

    // --- Навигация ---
    const openProduct = useCallback((game: MiniAppGame) => {
        setSelected(game);
        setView('product');
    }, []);

    const goCatalog = useCallback(() => setView('catalog'), []);
    const goCart = useCallback(() => setView('cart'), []);

    // Держим актуальные обработчики нативных кнопок Telegram в ref, чтобы не переподписываться на каждый рендер.
    const mainActionRef = useRef<() => void>(() => {});
    const backActionRef = useRef<() => void>(() => {});

    useEffect(() => {
        if (!webApp) return;
        const onMain = () => mainActionRef.current();
        const onBack = () => backActionRef.current();
        webApp.MainButton.onClick(onMain);
        webApp.BackButton.onClick(onBack);
        return () => {
            webApp.MainButton.offClick(onMain);
            webApp.BackButton.offClick(onBack);
        };
    }, [webApp]);

    // Настройка нативных кнопок под текущий экран/корзину.
    useEffect(() => {
        if (!webApp) return;
        const main = webApp.MainButton;
        const back = webApp.BackButton;

        // BackButton — на всех экранах, кроме каталога.
        if (view === 'catalog') {
            back.hide();
        } else {
            backActionRef.current = view === 'cart' ? goCatalog : goCatalog;
            back.show();
        }

        // MainButton — контекстное действие.
        if (view === 'cart') {
            if (cart.length === 0) {
                main.hide();
            } else {
                mainActionRef.current = checkout;
                main.setText(`Оплатить · ⭐ ${cartStars}`);
                if (checkingOut) main.showProgress(); else main.hideProgress();
                main.show();
            }
        } else if (cartCount > 0) {
            mainActionRef.current = goCart;
            main.setText(`Корзина · ${cartCount} · ${money(cartTotal, currency)}`);
            main.hideProgress();
            main.show();
        } else {
            main.hide();
        }
    }, [webApp, view, cart, cartCount, cartTotal, cartStars, checkingOut, checkout, goCart, goCatalog, currency]);

    const filteredGames = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return games;
        return games.filter((game) =>
            (game.title || '').toLowerCase().includes(query) ||
            (game.name || '').toLowerCase().includes(query));
    }, [games, search]);

    // ---------- Рендер ----------
    const renderCatalog = () => (
        <>
            <header className="miniapp__topbar">
                <span className="miniapp__logo">Tale Shop</span>
                <button className="miniapp__carticon" onClick={goCart} aria-label="Корзина">
                    🛒{cartCount > 0 && <span className="miniapp__cartbadge">{cartCount}</span>}
                </button>
            </header>

            <section className="miniapp__hero">
                <span className="miniapp__herobadge">⚡ Моментальная выдача</span>
                <h1 className="miniapp__herotitle">Твои игры — за пару тапов</h1>
                <p className="miniapp__herosub">Официальные ключи Steam. Оплата звёздами Telegram — ключ приходит в чат сразу после покупки.</p>
            </section>

            {!webApp && (
                <p className="miniapp__note">Откройте магазин через бота в Telegram, чтобы оплатить звёздами.</p>
            )}

            <div className="miniapp__trust">
                {TRUST_POINTS.map((point) => (
                    <div key={point.label} className="miniapp__trustitem">
                        <span className="miniapp__trusticon">{point.icon}</span>
                        <span>{point.label}</span>
                    </div>
                ))}
            </div>

            <div className="miniapp__searchbar">
                <span className="miniapp__searchicon" aria-hidden="true">🔍</span>
                <input
                    type="text"
                    inputMode="search"
                    placeholder="Поиск игр…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
            </div>

            {!loading && !error && filteredGames.length > 0 && (
                <div className="miniapp__sectionhead">
                    <h2>Каталог</h2>
                    <span>{filteredGames.length} {gamesWord(filteredGames.length)}</span>
                </div>
            )}

            {loading ? (
                <div className="miniapp__grid">
                    {[0, 1, 2, 3].map((i) => <div key={i} className="miniapp__skeleton" />)}
                </div>
            ) : error ? (
                <div className="miniapp__empty">{error}</div>
            ) : filteredGames.length === 0 ? (
                <div className="miniapp__empty">{games.length === 0 ? 'Каталог пуст.' : 'Ничего не найдено.'}</div>
            ) : (
                <div className="miniapp__grid">
                    {filteredGames.map((game) => {
                        const inCart = qtyInCart(game.id);
                        const discounted = game.discountActive && game.finalPrice != null && game.finalPrice < game.price;
                        return (
                            <article key={game.id} className="miniapp__card">
                                <button className="miniapp__coverbtn" onClick={() => openProduct(game)}>
                                    <SafeGameImage src={game.imagePath} gameTitle={game.title} baseUrl={window.location.origin} />
                                    {game.discountActive && game.discountPercent ? (
                                        <span className="miniapp__badge">−{Number(game.discountPercent).toFixed(0)}%</span>
                                    ) : null}
                                    {genreOf(game) ? <span className="miniapp__genre">{genreOf(game)}</span> : null}
                                </button>
                                <div className="miniapp__body">
                                    <h3 title={game.title} onClick={() => openProduct(game)}>{game.title || game.name}</h3>
                                    <div className="miniapp__price">
                                        <span className="miniapp__pricestars">⭐ {starsOfUsd(priceOf(game), starsPerUsd, game.currency) ?? "—"}</span>
                                        <span className="miniapp__priceusd">
                                            {money(priceOf(game), currency)}
                                            {discounted ? <s>{money(game.price, currency)}</s> : null}
                                        </span>
                                    </div>
                                    {game.isComingSoon ? (
                                        <span className="miniapp__soon">Выйдет {releaseLabel(game)}</span>
                                    ) : inCart > 0 ? (
                                        <div className="miniapp__stepper miniapp__stepper--card">
                                            <button onClick={() => setQty(game.id, inCart - 1)} aria-label="Меньше">−</button>
                                            <span>{inCart}</span>
                                            <button onClick={() => setQty(game.id, inCart + 1)} aria-label="Больше">+</button>
                                        </div>
                                    ) : (
                                        <button className="miniapp__buy" onClick={() => addToCart(game)}>
                                            <span className="miniapp__buyplus">+</span> В корзину
                                        </button>
                                    )}
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </>
    );

    const renderProduct = () => {
        if (!selected) return null;
        const inCart = qtyInCart(selected.id);
        const selectedGenre = genreOf(selected);
        const similar = selectedGenre
            ? games.filter((g) => g.id !== selected.id && genreOf(g) === selectedGenre).slice(0, 6)
            : [];
        return (
            <div className="miniapp__product">
                <div className="miniapp__producthero">
                    <SafeGameImage src={selected.imagePath} gameTitle={selected.title} baseUrl={window.location.origin} />
                    {selected.discountActive && selected.discountPercent ? (
                        <span className="miniapp__badge">-{Number(selected.discountPercent).toFixed(0)}%</span>
                    ) : null}
                </div>
                <h2>{selected.title || selected.name}</h2>
                {genreOf(selected) ? <span className="miniapp__genre">{genreOf(selected)}</span> : null}
                <div className="miniapp__productprice">
                    <span>⭐ {starsOfUsd(priceOf(selected), starsPerUsd, selected.currency) ?? "—"}</span>
                    <span className="miniapp__productusd">{money(priceOf(selected), currency)}</span>
                    {selected.discountActive && selected.finalPrice != null && selected.finalPrice < selected.price ? (
                        <span className="miniapp__strike">{money(selected.price, currency)}</span>
                    ) : null}
                </div>
                {selected.description ? (
                    <p className="miniapp__productdesc">{selected.description}</p>
                ) : null}

                <ul className="miniapp__perks">
                    <li><span>⚡</span> Ключ придёт в чат бота сразу после оплаты</li>
                    <li><span>✅</span> Официальный ключ для активации в Steam</li>
                    <li><span>🛡️</span> Не активировался — вернём звёзды</li>
                </ul>

                {selected.isComingSoon ? (
                    <span className="miniapp__soon miniapp__soon--wide">Выйдет {releaseLabel(selected)} — покупка откроется в день релиза</span>
                ) : inCart > 0 ? (
                    <div className="miniapp__productcart">
                        <div className="miniapp__stepper">
                            <button onClick={() => setQty(selected.id, inCart - 1)} aria-label="Меньше">−</button>
                            <span>{inCart}</span>
                            <button onClick={() => setQty(selected.id, inCart + 1)} aria-label="Больше">+</button>
                        </div>
                        <button className="miniapp__buy" onClick={goCart}>В корзине · перейти</button>
                    </div>
                ) : (
                    <button className="miniapp__buy miniapp__buy--wide" onClick={() => addToCart(selected)}>Добавить в корзину</button>
                )}

                {similar.length > 0 && (
                    <div className="miniapp__similar">
                        <h3>Похожие игры</h3>
                        <div className="miniapp__similarrow">
                            {similar.map((g) => (
                                <button key={g.id} className="miniapp__similarcard" onClick={() => openProduct(g)}>
                                    <div className="miniapp__similarcover">
                                        <SafeGameImage src={g.imagePath} gameTitle={g.title} baseUrl={window.location.origin} />
                                    </div>
                                    <span className="miniapp__similartitle">{g.title || g.name}</span>
                                    <span className="miniapp__similarprice">⭐ {starsOfUsd(priceOf(g), starsPerUsd, g.currency) ?? "—"}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {!webApp && (
                    <button className="miniapp__backlink" onClick={goCatalog}>← Назад к каталогу</button>
                )}
            </div>
        );
    };

    const renderCart = () => {
        const recommendations = games.filter((g) => !cart.some((line) => line.game.id === g.id)).slice(0, 6);
        return (
        <div className="miniapp__cartview">
            <h1>Корзина</h1>

            {cart.length === 0 ? (
                <div className="miniapp__empty">
                    <span className="miniapp__emptyicon">🛒</span>
                    Здесь пока пусто. Выберите игру из каталога.
                    <button className="miniapp__buy miniapp__buy--wide" onClick={goCatalog}>Перейти в каталог</button>
                </div>
            ) : (
                <>
                    <div className="miniapp__cartlist">
                        {cart.map((line) => (
                            <div key={line.game.id} className="miniapp__cartline">
                                <div className="miniapp__cartcover">
                                    <SafeGameImage src={line.game.imagePath} gameTitle={line.game.title} baseUrl={window.location.origin} />
                                </div>
                                <div className="miniapp__cartinfo">
                                    <h4>{line.game.title || line.game.name}</h4>
                                    <div className="miniapp__price">
                                        <span className="miniapp__pricestars">⭐ {(starsOfUsd(priceOf(line.game), starsPerUsd, line.game.currency) ?? 0) * line.qty}</span>
                                        <span className="miniapp__priceusd">{money(priceOf(line.game) * line.qty, currency)}</span>
                                    </div>
                                </div>
                                <div className="miniapp__cartactions">
                                    <div className="miniapp__stepper">
                                        <button onClick={() => setQty(line.game.id, line.qty - 1)} aria-label="Меньше">−</button>
                                        <span>{line.qty}</span>
                                        <button onClick={() => setQty(line.game.id, line.qty + 1)} aria-label="Больше">+</button>
                                    </div>
                                    <button className="miniapp__remove" onClick={() => removeLine(line.game.id)} aria-label="Удалить">✕</button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="miniapp__total">
                        <span>Итого</span>
                        <span className="miniapp__totalvalue">⭐ {cartStars}<small>{money(cartTotal, currency)}</small></span>
                    </div>

                    {/* В Telegram платит нативная MainButton (внизу) — второй кнопки не даём.
                        Внутристраничная — только фолбэк для обычного браузера (превью). */}
                    {!webApp && (
                        <button className="miniapp__checkout" disabled={checkingOut} onClick={checkout}>
                            {checkingOut ? 'Открываем оплату…' : `Оплатить ⭐ ${cartStars}`}
                        </button>
                    )}

                    <p className="miniapp__secure">🔒 Безопасная оплата через Telegram Stars · ключи придут в чат сразу</p>

                    <button className="miniapp__continue" onClick={goCatalog}>← Продолжить покупки</button>

                    {recommendations.length > 0 && (
                        <div className="miniapp__similar">
                            <h3>Добавьте к заказу</h3>
                            <div className="miniapp__similarrow">
                                {recommendations.map((g) => (
                                    <button key={g.id} className="miniapp__similarcard" onClick={() => addToCart(g)}>
                                        <div className="miniapp__similarcover">
                                            <SafeGameImage src={g.imagePath} gameTitle={g.title} baseUrl={window.location.origin} />
                                        </div>
                                        <span className="miniapp__similartitle">{g.title || g.name}</span>
                                        <span className="miniapp__similaradd"><span>+</span> ⭐ {starsOfUsd(priceOf(g), starsPerUsd, g.currency) ?? "—"}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
        );
    };

    return (
        <div className="miniapp">
            {view === 'catalog' && renderCatalog()}
            {view === 'product' && renderProduct()}
            {view === 'cart' && renderCart()}
        </div>
    );
};

export default MiniAppPage;
