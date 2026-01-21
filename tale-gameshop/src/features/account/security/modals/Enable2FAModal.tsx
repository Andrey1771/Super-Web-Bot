import React from 'react';
import type {SecurityActionResponse} from '../types';

type Enable2FAModalProps = {
    isOpen: boolean;
    isSubmitting: boolean;
    action: SecurityActionResponse | null;
    onClose: () => void;
    onRefresh: () => void;
};

const Enable2FAModal: React.FC<Enable2FAModalProps> = ({
    isOpen,
    isSubmitting,
    action,
    onClose,
    onRefresh
}) => {
    if (!isOpen) {
        return null;
    }

    const handleOpenAccount = () => {
        if (action?.redirectUrl) {
            window.open(action.redirectUrl, '_blank', 'noopener,noreferrer');
        }
        onRefresh();
        onClose();
    };

    return (
        <div className="security-modal-overlay">
            <div className="security-modal">
                <div className="security-modal-header">
                    <h3>Set up two-factor authentication</h3>
                    <button type="button" className="security-modal-close" onClick={onClose}>
                        ✕
                    </button>
                </div>
                <div className="security-modal-body">
                    <p>
                        We&apos;ll guide you through enabling 2FA in your Keycloak security settings.
                    </p>
                    <div className="security-info-banner">
                        {action?.message ?? 'Follow the prompts to configure your authenticator app.'}
                    </div>
                </div>
                <div className="security-modal-footer">
                    <button type="button" className="btn btn-outline" onClick={onClose}>
                        Close
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleOpenAccount}
                        disabled={isSubmitting || !action?.redirectUrl}
                    >
                        Open setup
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Enable2FAModal;
