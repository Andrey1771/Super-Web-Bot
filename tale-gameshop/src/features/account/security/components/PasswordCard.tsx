import {useTranslation} from 'react-i18next';
import React, {useState} from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faEye, faEyeSlash} from '@fortawesome/free-solid-svg-icons';

type PasswordCardProps = {
    isSubmitting: boolean;
    lastUpdatedLabel: string | null;
    onSubmit: (payload: { currentPassword: string; newPassword: string; confirmPassword: string }) => void;
    onReset: () => void;
};

const PasswordCard: React.FC<PasswordCardProps> = ({isSubmitting, lastUpdatedLabel, onSubmit, onReset}) => {
    const {t} = useTranslation();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [errors, setErrors] = useState<{ current?: string; new?: string; confirm?: string }>({});

    const handleSubmit = () => {
        const nextErrors: { current?: string; new?: string; confirm?: string } = {};
        if (!currentPassword) {
            nextErrors.current = t('account.security.password.errCurrent');
        }
        if (newPassword.length < 8) {
            nextErrors.new = t('account.security.password.errLength');
        }
        if (newPassword !== confirmPassword) {
            nextErrors.confirm = t('account.security.password.errMatch');
        }
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) {
            return;
        }
        onSubmit({currentPassword, newPassword, confirmPassword});
    };

    return (
        <div className="card security-password" data-testid="security-password-card">
            <div className="security-password-grid">
                <div className="security-password-form">
                    <div className="security-password-header">
                        <h3>{t('account.security.password.title')}</h3>
                        <button type="button" className="security-inline-link" onClick={onReset}>
                            {t('account.security.password.forgot')}
                        </button>
                    </div>
                    <label className="security-field">
                        <span>{t('account.security.password.current')}</span>
                        <div className="security-input">
                            <input
                                type={showCurrent ? 'text' : 'password'}
                                value={currentPassword}
                                onChange={(event) => setCurrentPassword(event.target.value)}
                                placeholder="••••••••"
                            />
                            <button type="button" className="security-input-icon" onClick={() => setShowCurrent((prev) => !prev)}>
                                <FontAwesomeIcon icon={showCurrent ? faEyeSlash : faEye} />
                            </button>
                        </div>
                        {errors.current && <span className="security-error">{errors.current}</span>}
                    </label>
                    <label className="security-field">
                        <span>{t('account.security.password.new')}</span>
                        <div className="security-input">
                            <input
                                type={showNew ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(event) => setNewPassword(event.target.value)}
                                placeholder="••••••••"
                            />
                            <button type="button" className="security-input-icon" onClick={() => setShowNew((prev) => !prev)}>
                                <FontAwesomeIcon icon={showNew ? faEyeSlash : faEye} />
                            </button>
                        </div>
                        {errors.new && <span className="security-error">{errors.new}</span>}
                    </label>
                    <label className="security-field">
                        <span>{t('account.security.password.confirm')}</span>
                        <div className="security-input">
                            <input
                                type={showConfirm ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                                placeholder="••••••••"
                            />
                            <button type="button" className="security-input-icon" onClick={() => setShowConfirm((prev) => !prev)}>
                                <FontAwesomeIcon icon={showConfirm ? faEyeSlash : faEye} />
                            </button>
                        </div>
                        {errors.confirm && <span className="security-error">{errors.confirm}</span>}
                    </label>
                    <button type="button" className="btn btn-primary security-update-btn" onClick={handleSubmit} disabled={isSubmitting}>
                        {t('account.security.password.update')}
                    </button>
                </div>
                <div className="security-password-info">
                    <div className="security-info-card">
                        <div>
                            {lastUpdatedLabel && <p>{t('account.security.password.updatedAt', {when: lastUpdatedLabel})}</p>}
                            <p>{t('account.security.password.resetNote')}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PasswordCard;
