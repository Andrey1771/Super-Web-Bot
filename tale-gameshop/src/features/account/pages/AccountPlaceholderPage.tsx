import React from "react";
import AccountShell from "../components/AccountShell";

type AccountPlaceholderPageProps = {
    section: string;
};

export default function AccountPlaceholderPage({section}: AccountPlaceholderPageProps) {
    return (
        <AccountShell title={section} section={section}>
            <div className="account-card">
                <h3>Скоро будет</h3>
                <p className="account-muted">Эта секция в разработке. Мы скоро добавим контент.</p>
            </div>
        </AccountShell>
    );
}
