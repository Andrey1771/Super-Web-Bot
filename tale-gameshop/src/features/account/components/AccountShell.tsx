import React from 'react';
import {Link, NavLink} from 'react-router-dom';
import {accountProfile} from '../mockAccountData';
import { useAccountProfile } from '../context/AccountProfileContext';
import './account-shell.css';

interface AccountShellProps {
    title: string;
    sectionLabel: string;
    subtitle?: React.ReactNode;
    actions?: React.ReactNode;
    headerTestId?: string;
    children: React.ReactNode;
}

const navItems = [
    {label: 'Account overview', to: '/account'},
    {label: 'Orders', to: '/account/orders'},
    {label: 'Keys & activation', to: '/account/keys'},
    {label: 'Saved items', to: '/account/saved'},
    {label: 'Settings', to: '/account/settings'},
    {label: 'Billing', to: '/account/billing'},
    {label: 'Security', to: '/account/security'},
    {label: 'Help', to: '/account/help'}
];

const AccountShell: React.FC<AccountShellProps> = ({
    title,
    sectionLabel,
    subtitle,
    actions,
    headerTestId,
    children
}) => {
    const { profile } = useAccountProfile();
    const subtitleContent = subtitle
        ? typeof subtitle === 'string'
            ? <p className="account-subtitle">{subtitle}</p>
            : subtitle
        : null;

    const displayName = profile?.displayName ?? accountProfile.name;
    const email = profile?.email ?? accountProfile.email;
    const initialsSource = displayName || email || accountProfile.name;
    const initials = initialsSource
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase() || accountProfile.initials;

    return (
        <div className="account-page">
            <div className="container account-layout">
                <aside className="account-sidebar">
                    <div className="card account-profile">
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
                            <span className="badge">{accountProfile.badge}</span>
                        </div>
                    </div>
                    <nav className="account-nav">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.to === '/account'}
                                className={({isActive}) =>
                                    `account-nav-link${isActive ? ' active' : ''}`
                                }
                            >
                                {item.label}
                            </NavLink>
                        ))}
                    </nav>
                </aside>
                <div className="account-content">
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
                            {actions ?? (
                                <>
                                    <Link to="/account/settings" className="btn btn-outline account-action-btn">
                                        Edit profile
                                    </Link>
                                    <Link to="/support" className="btn btn-outline account-action-btn">
                                        Support
                                    </Link>
                                </>
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
