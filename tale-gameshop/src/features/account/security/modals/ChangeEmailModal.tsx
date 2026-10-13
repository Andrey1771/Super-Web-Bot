import {useTranslation} from 'react-i18next';
import React, {useState} from 'react';

type ChangeEmailModalProps = {
    isOpen: boolean;
    isSubmitting: boolean;
    onClose: () => void;
    onSubmit: (payload: { newEmail: string; password: string }) => void;
};

const ChangeEmailModal: React.FC<ChangeEmailModalProps> = ({isOpen, isSubmitting, onClose, onSubmit}) => {
    const {t} = useTranslation();
    const [newEmail, setNewEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    if (!isOpen) {
        return null;
    }

    const handleSubmit = () => {
        if (!newEmail) {
            setError(t('account.security.changeEmail.errEmail'));
            return;
        }
        if (!password) {
            setError(t('account.security.changeEmail.errPassword'));
            return;
        }
        setError('');
        onSubmit({newEmail, password});
    };

    return (
        <div className="security-modal-overlay">
            <div className="security-modal">
                <div className="security-modal-header">
                    <h3>{t('account.security.changeEmail.title')}</h3>
                    <button type="button" className="security-modal-close" onClick={onClose}>
                        ✕
                    </button>
                </div>
                <div className="security-modal-body">
                    <label className="security-field">
                        <span>{t('account.security.changeEmail.newEmail')}</span>
                        <input
                            className="input"
                            type="email"
                            value={newEmail}
                            onChange={(event) => setNewEmail(event.target.value)}
                            placeholder="you@email.com"
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
                    {error && <p className="security-error">{error}</p>}
                </div>
                <div className="security-modal-footer">
                    <button type="button" className="btn btn-outline" onClick={onClose}>
                        {t('common.cancel')}
                    </button>
                    <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
                        {t('account.security.changeEmail.update')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChangeEmailModal;
