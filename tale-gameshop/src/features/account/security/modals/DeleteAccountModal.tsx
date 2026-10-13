import {useTranslation} from 'react-i18next';
import React, {useState} from 'react';

type DeleteAccountModalProps = {
    isOpen: boolean;
    isSubmitting: boolean;
    onClose: () => void;
    onConfirm: (payload: { confirmation: string; password: string; twoFactorCode?: string }) => void;
};

const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({
    isOpen,
    isSubmitting,
    onClose,
    onConfirm
}) => {
    const {t} = useTranslation();
    const [confirmation, setConfirmation] = useState('');
    const [password, setPassword] = useState('');
    const [twoFactorCode, setTwoFactorCode] = useState('');
    const [error, setError] = useState('');

    if (!isOpen) {
        return null;
    }

    const handleSubmit = () => {
        if (confirmation !== 'DELETE') {
            setError(t('account.security.deleteAccount.errType'));
            return;
        }
        if (!password) {
            setError(t('account.security.deleteAccount.errPassword'));
            return;
        }
        setError('');
        onConfirm({confirmation, password, twoFactorCode: twoFactorCode || undefined});
    };

    return (
        <div className="security-modal-overlay">
            <div className="security-modal">
                <div className="security-modal-header">
                    <h3>{t('account.security.deleteAccount.title')}</h3>
                    <button type="button" className="security-modal-close" onClick={onClose}>
                        ✕
                    </button>
                </div>
                <div className="security-modal-body">
                    <p>{t('account.security.deleteAccount.text')}</p>
                    <label className="security-field">
                        <span>{t('account.security.deleteAccount.typeDelete')}</span>
                        <input
                            className="input"
                            value={confirmation}
                            onChange={(event) => setConfirmation(event.target.value)}
                            placeholder="DELETE"
                        />
                    </label>
                    <label className="security-field">
                        <span>{t('common.password')}</span>
                        <input
                            className="input"
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="••••••••"
                        />
                    </label>
                    <label className="security-field">
                        <span>{t('account.security.deleteAccount.code')}</span>
                        <input
                            className="input"
                            value={twoFactorCode}
                            onChange={(event) => setTwoFactorCode(event.target.value)}
                            placeholder="123456"
                        />
                    </label>
                    {error && <p className="security-error">{error}</p>}
                </div>
                <div className="security-modal-footer">
                    <button type="button" className="btn btn-outline" onClick={onClose}>
                        {t('common.cancel')}
                    </button>
                    <button type="button" className="btn btn-outline security-danger-btn" onClick={handleSubmit} disabled={isSubmitting}>
                        {t('account.security.deleteAccount.confirm')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DeleteAccountModal;
