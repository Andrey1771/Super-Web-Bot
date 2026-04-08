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
                        2FA setup is handled in your Keycloak account security settings.
                    </p>
                    <div className="security-info-banner">
                        {action?.message ?? 'Open Keycloak account console and follow prompts to configure an authenticator app.'}
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
                        Open Keycloak security settings
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Enable2FAModal;
