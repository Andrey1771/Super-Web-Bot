import React from "react";

type AccountPlaceholderPageProps = {
    title: string;
};

const AccountPlaceholderPage: React.FC<AccountPlaceholderPageProps> = ({title}) => {
    return (
        <div className="account-card account-placeholder">
            <h2 className="account-section-title">{title}</h2>
            <p>Скоро будет.</p>
        </div>
    );
};

export default AccountPlaceholderPage;
