import React from 'react';
import AccountShell from '../components/AccountShell';

interface AccountPlaceholderPageProps {
    title: string;
}

const AccountPlaceholderPage: React.FC<AccountPlaceholderPageProps> = ({title}) => {
    return (
        <AccountShell title={title} sectionLabel={title}>
            <div className="card">
                <h2>{title}</h2>
                <p>Скоро будет</p>
            </div>
        </AccountShell>
    );
};

export default AccountPlaceholderPage;
