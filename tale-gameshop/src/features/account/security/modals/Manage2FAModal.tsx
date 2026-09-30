import {useTranslation} from 'react-i18next';
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
    const {t} = useTranslation();
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
                    <h3>{t('account.security.manage2fa.title')}</h3>
                    <button type="button" className="security-modal-close" onClick={onClose}>
                        ✕
                    </button>
                </div>
                <div className="security-modal-body">
                    <p>
                        {t('account.security.manage2fa.text')}
                    </p>
                </div>
                <div className="security-modal-footer">
                    <button type="button" className="btn btn-outline" onClick={onClose}>
                        {t('common.cancel')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleOpenAccount}
                        disabled={isSubmitting || !accountConsoleUrl}
                    >
                        {t('account.security.manage2fa.open')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Manage2FAModal;
