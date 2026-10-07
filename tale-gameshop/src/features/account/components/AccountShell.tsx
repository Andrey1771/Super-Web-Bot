import React, {useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {formatDateTime} from '../../../i18n/format';
import {Link, NavLink, useLocation} from 'react-router-dom';
import {useKeycloak} from '@react-keycloak/web';
import { useAccountProfile } from '../context/AccountProfileContext';
import { cancelPendingRecovery, getPendingRecovery } from '../../../api/accountRecoveryApi';
import type { PendingRecovery } from '../../../api/accountRecoveryApi';
import { useAccountCounters } from '../../../hooks/use-account-counters';
import { useWishlist } from '../../../context/wishlist-context';
import container from '../../../inversify.config';
import IDENTIFIERS from '../../../constants/identifiers';
import type { IKeycloakAuthService } from '../../../iterfaces/i-keycloak-auth-service';
import './account-shell.css';

interface AccountShellProps {
    title: string;
    sectionLabel: string;
    subtitle?: React.ReactNode;
    actions?: React.ReactNode;
    headerTestId?: string;
    children: React.ReactNode;
}

type NavItem = {
    label: string;
    to: string;
    // Ключ счётчика: заполняется живыми данными (заказы/ключи/вишлист/ответы поддержки).
    counter?: 'orders' | 'keys' | 'saved' | 'help';
};

type NavGroup = {
    title: string;
    items: NavItem[];
};

// Ментальная модель покупателя: «мои покупки» → «мой аккаунт» → «помощь».
// label/title — ключи словаря account.nav.*.
const navGroups: NavGroup[] = [
    {
        title: 'purchases',
        items: [
            {label: 'overview', to: '/account'},
            {label: 'orders', to: '/account/orders', counter: 'orders'},
            {label: 'keys', to: '/account/keys', counter: 'keys'},
            {label: 'cashback', to: '/account/rewards'},
            {label: 'saved', to: '/account/saved', counter: 'saved'}
        ]
    },
    {
        title: 'account',
        items: [
            {label: 'settings', to: '/account/settings'},
            {label: 'billing', to: '/account/billing'},
            {label: 'security', to: '/account/security'}
        ]
    },
    {
        title: 'support',
        items: [
            {label: 'help', to: '/account/help', counter: 'help'}
        ]
    }
];

const AccountShell: React.FC<AccountShellProps> = ({
    title,
    sectionLabel,
    subtitle,
    actions,
    headerTestId,
    children
}) => {
    const {t} = useTranslation();
    const { profile, isLoading: isProfileLoading } = useAccountProfile();
    const counters = useAccountCounters();
    const { count: wishlistCount } = useWishlist();
    const { keycloak } = useKeycloak();
    const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);

    const subtitleContent = subtitle
        ? typeof subtitle === 'string'
            ? <p className="account-subtitle">{subtitle}</p>
            : subtitle
        : null;

    // Пока профиль грузится — скелетон; фолбэк после загрузки — данные из токена, не моки.
    const showProfileSkeleton = isProfileLoading && !profile;
    const tokenClaims = (keycloak?.tokenParsed ?? {}) as {
        name?: string;
        preferred_username?: string;
        email?: string;
    };
    const displayName = profile?.displayName ?? tokenClaims.name ?? tokenClaims.preferred_username ?? t('account.myAccount');
    const email = profile?.email ?? tokenClaims.email ?? '';
    const initialsSource = displayName || email;
    const initials = initialsSource
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase() || '?';

    // Честный бейдж: «Verified buyer» только при наличии завершённых покупок.
    const isVerifiedBuyer = (counters?.orders ?? 0) > 0;

    const counterValue = (key?: NavItem['counter']): number => {
        switch (key) {
            case 'orders':
                return counters?.orders ?? 0;
            case 'keys':
                return counters?.keys ?? 0;
            case 'saved':
                return wishlistCount;
            case 'help':
                return counters?.ticketsAwaitingReply ?? 0;
            default:
                return 0;
        }
    };

    const handleSignOut = async () => {
        await keycloakAuthService.logoutWithRedirect(keycloak, window.location.origin);
    };

    /**
     * Меню разделов на узком экране.
     *
     * Раньше оно превращалось в ленту чипов с горизонтальной прокруткой: половина
     * разделов была за краем экрана, и догадаться, что ленту можно листать, было неоткуда.
     * Теперь это выдвижная панель — та же вертикальная навигация, что и на десктопе,
     * с заголовками групп, профилем и выходом.
     */
    const location = useLocation();
    const [isNavOpen, setIsNavOpen] = useState(false);
    const navToggleRef = useRef<HTMLButtonElement | null>(null);
    const navCloseRef = useRef<HTMLButtonElement | null>(null);

    // Подпись на кнопке — раздел, в котором человек сейчас. Считаем по адресу, а не по
    // sectionLabel страницы: на кнопке должно стоять ровно то же слово, что и в меню.
    const currentNavLabel =
        navGroups
            .flatMap((group) => group.items)
            .filter((item) => (item.to === '/account' ? location.pathname === '/account' : location.pathname.startsWith(item.to)))
            .sort((a, b) => b.to.length - a.to.length)[0]?.label;
    const currentNavLabelText = currentNavLabel ? t(`account.nav.${currentNavLabel}`) : sectionLabel;

    // Переход по ссылке закрывает панель. Отдельным эффектом, а не обработчиком на каждой
    // ссылке: адрес меняется и от «назад» в браузере.
    useEffect(() => {
        setIsNavOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (!isNavOpen) {
            return;
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsNavOpen(false);
            }
        };

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', onKeyDown);
        navCloseRef.current?.focus();

        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previousOverflow;
            // Фокус возвращаем туда, откуда панель открыли, — иначе после закрытия он
            // улетает в начало страницы.
            navToggleRef.current?.focus();
        };
    }, [isNavOpen]);

    // Живая сессия — главный канал «уведомить владельца»: если кто-то запросил
    // восстановление доступа (сброс 2FA), показываем баннер с отменой в один клик.
    const [pendingRecovery, setPendingRecovery] = useState<PendingRecovery | null>(null);
    const [isCancellingRecovery, setIsCancellingRecovery] = useState(false);
    useEffect(() => {
        getPendingRecovery().then(setPendingRecovery).catch(() => {
            // Не критично: баннер — дополнительная защита, страница работает и без него.
        });
    }, []);

    const handleCancelRecovery = async () => {
        setIsCancellingRecovery(true);
        try {
            await cancelPendingRecovery();
            setPendingRecovery({exists: false});
        } catch {
            // Оставляем баннер — пользователь сможет повторить.
        } finally {
            setIsCancellingRecovery(false);
        }
    };

    return (
        <div className="account-page">
            <div className="container account-layout">
                {/* Кнопка видна только на узких экранах: на десктопе меню и так на виду. */}
                <button
                    type="button"
                    className="account-nav-toggle"
                    ref={navToggleRef}
                    onClick={() => setIsNavOpen(true)}
                    aria-expanded={isNavOpen}
                    aria-controls="account-sections"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    <span className="account-nav-toggle-label">{currentNavLabelText}</span>
                    <span className="account-nav-toggle-hint">{t('account.sections')}</span>
                </button>

                <div
                    className={`account-nav-backdrop${isNavOpen ? ' is-open' : ''}`}
                    onClick={() => setIsNavOpen(false)}
                    aria-hidden="true"
                />

                <aside id="account-sections" className={`account-sidebar${isNavOpen ? ' is-open' : ''}`}>
                    <button
                        type="button"
                        className="account-nav-close"
                        ref={navCloseRef}
                        onClick={() => setIsNavOpen(false)}
                        aria-label={t('account.closeSections')}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                    </button>
                    <div className="card account-profile">
                        {showProfileSkeleton ? (
                            <>
                                <div className="account-avatar is-skeleton" aria-hidden="true" />
                                <div className="account-profile-details" aria-busy="true">
                                    <span className="account-skeleton-line" />
                                    <span className="account-skeleton-line is-short" />
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="account-avatar">
                                    {profile?.avatarUrl ? (
                                        <img src={profile.avatarUrl} alt={t('account.avatarAlt', {name: displayName})} />
                                    ) : (
                                        initials
                                    )}
                                </div>
                                <div className="account-profile-details">
                                    <strong>{displayName}</strong>
                                    <span className="account-email">{email}</span>
                                    {isVerifiedBuyer && <span className="badge">{t('account.verifiedBuyer')}</span>}
                                </div>
                            </>
                        )}
                    </div>
                    <nav className="account-nav">
                        {navGroups.map((group) => (
                            <div key={group.title} className="account-nav-group">
                                <div className="account-nav-group-title">{t(`account.nav.${group.title}`)}</div>
                                {group.items.map((item) => {
                                    const count = counterValue(item.counter);
                                    return (
                                        <NavLink
                                            key={item.to}
                                            to={item.to}
                                            end={item.to === '/account'}
                                            className={({isActive}) =>
                                                `account-nav-link${isActive ? ' active' : ''}`
                                            }
                                        >
                                            <span>{t(`account.nav.${item.label}`)}</span>
                                            {count > 0 && (
                                                <span
                                                    className={`account-nav-count${item.counter === 'help' ? ' is-attention' : ''}`}
                                                    title={item.counter === 'help' ? t('account.replyNeeded') : undefined}
                                                >
                                                    {count}
                                                </span>
                                            )}
                                        </NavLink>
                                    );
                                })}
                            </div>
                        ))}
                    </nav>
                    <button type="button" className="account-signout" onClick={handleSignOut}>
                        {t('account.signOut')}
                    </button>
                </aside>
                <div className="account-content">
                    {pendingRecovery?.exists && (
                        <div className="account-recovery-alert" role="alert">
                            <div className="account-recovery-alert-text">
                                <strong>{t('account.recoveryRequested', {id: pendingRecovery.publicId})}</strong>
                                <span>
                                    {pendingRecovery.status === 'Approved' && pendingRecovery.executeAfter
                                        ? t('account.recoveryReset', {date: formatDateTime(pendingRecovery.executeAfter)})
                                        : t('account.recoveryReview')}
                                    {' '}{t('account.recoveryNotYou')}
                                </span>
                            </div>
                            <button
                                type="button"
                                className="btn account-recovery-alert-btn"
                                onClick={handleCancelRecovery}
                                disabled={isCancellingRecovery}
                            >
                                {isCancellingRecovery ? t('account.cancelling') : t('account.cancelRequest')}
                            </button>
                        </div>
                    )}
                    <div className="account-breadcrumbs">
                        <Link to="/">{t('common.nav.home')}</Link>
                        <span>/</span>
                        <Link to="/account">{t('common.account')}</Link>
                        <span>/</span>
                        <span>{sectionLabel}</span>
                    </div>
                    <div className="account-header" data-testid={headerTestId}>
                        <div>
                            <h1>{title}</h1>
                            {subtitleContent}
                        </div>
                        <div className="account-header-actions">
                            {/* Единое действие шапки: помощь (тикеты/FAQ). Редактирование профиля —
                                в сайдбаре (Settings) и в карточке на Overview, без дублей. Тихим значком без рамки:
                                яркая кнопка, а потом круг с обводкой спорили с заголовком страницы, хотя это не главное её действие.
                                Точка — поддержка ответила и ждёт ответа (тот же счётчик, что у «Help» в меню). */}
                            {actions ?? (
                                <Link
                                    to="/account/help"
                                    className="account-help-link"
                                    aria-label={counterValue('help') > 0 ? `${t('account.nav.help')}: ${t('account.replyNeeded')}` : t('account.nav.help')}
                                    title={counterValue('help') > 0 ? t('account.replyNeeded') : t('account.nav.help')}
                                >
                                    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
                                        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.7" />
                                        <path
                                            d="M9.7 9.5a2.4 2.4 0 0 1 4.6.8c0 1.6-2.3 2.1-2.3 3.6"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="1.7"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                        <circle cx="12" cy="16.9" r="1.05" fill="currentColor" />
                                    </svg>
                                    {counterValue('help') > 0 && <span className="account-help-link__dot" aria-hidden="true" />}
                                </Link>
                            )}
                        </div>
                    </div>
                    {children}
                </div>
            </div>
        </div>
    );
};

export default AccountShell;
