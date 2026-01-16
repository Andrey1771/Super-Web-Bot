import React from 'react';
import {Link, NavLink} from 'react-router-dom';
import {accountProfile} from '../mockAccountData';
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
    const subtitleContent = subtitle
        ? typeof subtitle === 'string'
            ? <p className="account-subtitle">{subtitle}</p>
            : subtitle
        : null;

    return (
        <div className="account-page">
            <div className="container account-layout">
                <aside className="account-sidebar">
                    <div className="card account-profile">
                        <div className="account-avatar">{accountProfile.initials}</div>
                        <div className="account-profile-details">
                            <strong>{accountProfile.name}</strong>
                            <span className="account-email">{accountProfile.email}</span>
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
