import React from 'react';

type SecurityBannerProps = {
    show: boolean;
    onSetup2fa: () => void;
};

const SecurityBanner: React.FC<SecurityBannerProps> = ({show, onSetup2fa}) => {
    if (!show) {
        return null;
    }

    return (
        <section className="card security-alert" data-testid="security-alert">
            <div className="security-alert-content">
                <h2>Your account is not fully protected</h2>
                <p>Enable two-factor authentication (2FA) to enhance the security of your account.</p>
            </div>
            <button type="button" className="btn btn-primary security-alert-btn" onClick={onSetup2fa}>
                Set up 2FA
            </button>
        </section>
    );
};

export default SecurityBanner;
