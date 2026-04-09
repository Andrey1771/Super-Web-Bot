import React from 'react';

type Manage2FAModalProps = {
    isOpen: boolean;
    isSubmitting: boolean;
    accountConsoleUrl: string;
    onClose: () => void;
};

const Manage2FAModal: React.FC<Manage2FAModalProps> = ({
    isOpen,
    isSubmitting,
    accountConsoleUrl,
    onClose
}) => {
    if (!isOpen) {
        return null;
    }

    const handleOpenAccount = () => {
        if (accountConsoleUrl) {
            window.open(accountConsoleUrl, '_blank', 'noopener,noreferrer');
        }
        onClose();
    };

    return (
        <div className="security-modal-overlay">
            <div className="security-modal">
                <div className="security-modal-header">
                    <h3>Manage two-factor authentication</h3>
                    <button type="button" className="security-modal-close" onClick={onClose}>
                        ✕
                    </button>
                </div>
                <div className="security-modal-body">
                    <p>
                        2FA management is delegated to Keycloak account console, including authenticator devices and backup codes.
                    </p>
                </div>
                <div className="security-modal-footer">
                    <button type="button" className="btn btn-outline" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleOpenAccount}
                        disabled={isSubmitting || !accountConsoleUrl}
                    >
                        Open Keycloak security settings
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Manage2FAModal;
