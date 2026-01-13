import React from "react";
import {Link, NavLink} from "react-router-dom";
import "../account.css";

type AccountShellProps = {
    title: string;
    subtitle?: string;
    sectionLabel: string;
    children: React.ReactNode;
};

const navItems = [
    {label: "Overview", to: "/account", end: true},
    {label: "Orders", to: "/account/orders"},
    {label: "Keys & activation", to: "/account/keys"},
    {label: "Saved items", to: "/account/saved"},
    {label: "Settings", to: "/account/settings"},
    {label: "Billing", to: "/account/billing"},
    {label: "Security", to: "/account/security"},
    {label: "Help", to: "/account/help"}
];

const AccountShell: React.FC<AccountShellProps> = ({title, subtitle, sectionLabel, children}) => {
    return (
        <section className="account-page">
            <div className="container account-container">
                <div className="account-breadcrumbs">
                    <Link to="/">Home</Link>
                    <span>/</span>
                    <Link to="/account">Account</Link>
                    <span>/</span>
                    <span>{sectionLabel}</span>
                </div>
                <div className="account-layout">
                    <aside className="account-sidebar">
                        <ul className="account-nav">
                            {navItems.map((item) => (
                                <li key={item.to}>
                                    <NavLink
                                        to={item.to}
                                        end={item.end}
                                        className={({isActive}) =>
                                            `account-nav-link${isActive ? " active" : ""}`
                                        }
                                    >
                                        {item.label}
                                    </NavLink>
                                </li>
                            ))}
                        </ul>
                    </aside>
                    <div className="account-main">
                        <div className="account-header">
                            <div>
                                <h1 className="account-title">{title}</h1>
                                {subtitle && <p className="account-subtitle">{subtitle}</p>}
                            </div>
                            <div className="account-header-actions">
                                <Link className="btn btn-primary" to="/account/settings">
                                    Edit profile
                                </Link>
                                <Link className="btn btn-outline" to="/support">
                                    Support
                                </Link>
                            </div>
                        </div>
                        {children}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default AccountShell;
