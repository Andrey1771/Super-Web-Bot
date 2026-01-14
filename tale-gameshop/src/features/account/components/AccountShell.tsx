import React from "react";
import {Link, NavLink} from "react-router-dom";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
    faUser,
    faReceipt,
    faKey,
    faHeart,
    faGear,
    faCreditCard,
    faShield,
    faCircleQuestion
} from "@fortawesome/free-solid-svg-icons";
import "../account.css";

const navItems = [
    {label: "Account overview", to: "/account", icon: faUser},
    {label: "Orders", to: "/account/orders", icon: faReceipt},
    {label: "Keys & activation", to: "/account/keys", icon: faKey},
    {label: "Saved items", to: "/account/saved", icon: faHeart},
    {label: "Settings", to: "/account/settings", icon: faGear},
    {label: "Billing", to: "/account/billing", icon: faCreditCard},
    {label: "Security", to: "/account/security", icon: faShield},
    {label: "Help", to: "/account/help", icon: faCircleQuestion}
];

type AccountShellProps = {
    title: string;
    section: string;
    subtitle?: string;
    children: React.ReactNode;
};

export default function AccountShell({title, section, subtitle, children}: AccountShellProps) {
    return (
        <div className="account-page">
            <div className="container">
                <div className="account-breadcrumbs">
                    <Link to="/">Home</Link>
                    <span>/</span>
                    <Link to="/account">Account</Link>
                    <span>/</span>
                    <span>{section}</span>
                </div>
                <div className="account-layout">
                    <aside className="account-sidebar card">
                        <nav className="account-nav">
                            {navItems.map((item) => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    end={item.to === "/account"}
                                    className={({isActive}) =>
                                        `account-nav-link${isActive ? " active" : ""}`
                                    }
                                >
                                    <FontAwesomeIcon icon={item.icon}/>
                                    <span>{item.label}</span>
                                </NavLink>
                            ))}
                        </nav>
                    </aside>
                    <section className="account-content">
                        <header className="account-header">
                            <div>
                                <h1>{title}</h1>
                                {subtitle && <p className="account-subtitle">{subtitle}</p>}
                            </div>
                            <div className="account-header-actions">
                                <Link className="btn btn-outline" to="/account/settings">Edit profile</Link>
                                <Link className="btn btn-outline" to="/support">Support</Link>
                            </div>
                        </header>
                        {children}
                    </section>
                </div>
            </div>
        </div>
    );
}
