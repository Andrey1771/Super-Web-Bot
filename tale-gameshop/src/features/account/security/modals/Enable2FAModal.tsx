import {useTranslation} from 'react-i18next';
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
    const {t} = useTranslation();
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
                    <h3>{t('account.security.enable2fa.title')}</h3>
                    <button type="button" className="security-modal-close" onClick={onClose}>
                        ✕
                    </button>
                </div>
                <div className="security-modal-body">
                    <p>
                        {t('account.security.enable2fa.text')}
                    </p>
                    <div className="security-info-banner">
                        {action?.message ?? t('account.security.enable2fa.fallback')}
                    </div>
                </div>
                <div className="security-modal-footer">
                    <button type="button" className="btn btn-outline" onClick={onClose}>
                        {t('common.close')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleOpenAccount}
                        disabled={isSubmitting || !action?.redirectUrl}
                    >
                        {t('account.security.enable2fa.open')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Enable2FAModal;
