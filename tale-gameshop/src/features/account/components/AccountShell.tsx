import React, {useEffect, useState} from 'react';
import {Link, NavLink} from 'react-router-dom';
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
const navGroups: NavGroup[] = [
    {
        title: 'Purchases',
        items: [
            {label: 'Overview', to: '/account'},
            {label: 'Orders', to: '/account/orders', counter: 'orders'},
            {label: 'Keys & activation', to: '/account/keys', counter: 'keys'},
            {label: 'Saved items', to: '/account/saved', counter: 'saved'}
        ]
    },
    {
        title: 'Account',
        items: [
            {label: 'Settings', to: '/account/settings'},
            {label: 'Billing', to: '/account/billing'},
            {label: 'Security', to: '/account/security'}
        ]
    },
    {
        title: 'Support',
        items: [
            {label: 'Help', to: '/account/help', counter: 'help'}
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
    const displayName = profile?.displayName ?? tokenClaims.name ?? tokenClaims.preferred_username ?? 'My account';
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
                <aside className="account-sidebar">
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
                                        <img src={profile.avatarUrl} alt={`${displayName} avatar`} />
                                    ) : (
                                        initials
                                    )}
                                </div>
                                <div className="account-profile-details">
                                    <strong>{displayName}</strong>
                                    <span className="account-email">{email}</span>
                                    {isVerifiedBuyer && <span className="badge">Verified buyer</span>}
                                </div>
                            </>
                        )}
                    </div>
                    <nav className="account-nav">
                        {navGroups.map((group) => (
                            <div key={group.title} className="account-nav-group">
                                <div className="account-nav-group-title">{group.title}</div>
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
                                            <span>{item.label}</span>
                                            {count > 0 && (
                                                <span
                                                    className={`account-nav-count${item.counter === 'help' ? ' is-attention' : ''}`}
                                                    title={item.counter === 'help' ? 'Support replied — reply needed' : undefined}
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
                        Sign out
                    </button>
                </aside>
                <div className="account-content">
                    {pendingRecovery?.exists && (
                        <div className="account-recovery-alert" role="alert">
                            <div className="account-recovery-alert-text">
                                <strong>Account recovery was requested ({pendingRecovery.publicId}).</strong>
                                <span>
                                    {pendingRecovery.status === 'Approved' && pendingRecovery.executeAfter
                                        ? ` Two-factor authentication will be reset after ${new Date(pendingRecovery.executeAfter).toLocaleString()}.`
                                        : ' The request is being reviewed by support.'}
                                    {' '}If this wasn’t you, cancel it now.
                                </span>
                            </div>
                            <button
                                type="button"
                                className="btn account-recovery-alert-btn"
                                onClick={handleCancelRecovery}
                                disabled={isCancellingRecovery}
                            >
                                {isCancellingRecovery ? 'Cancelling…' : 'Cancel request'}
                            </button>
                        </div>
                    )}
                    <div className="account-breadcrumbs">
                        <Link to="/">Home</Link>
                        <span>/</span>
                        <Link to="/account">Account</Link>
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
                                в сайдбаре (Settings) и в карточке на Overview, без дублей. */}
                            {actions ?? (
                                <Link to="/account/help" className="btn btn-primary account-action-btn">
                                    Help
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
