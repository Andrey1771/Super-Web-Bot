import React, {useState} from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faEye, faEyeSlash} from '@fortawesome/free-solid-svg-icons';

type PasswordCardProps = {
    isSubmitting: boolean;
    lastUpdatedLabel: string;
    canChangeInline: boolean;
    canSendResetEmail: boolean;
    unavailableReason?: string;
    onSubmit: (payload: { currentPassword: string; newPassword: string; confirmPassword: string }) => void;
    onReset: () => void;
};

const PasswordCard: React.FC<PasswordCardProps> = ({
    isSubmitting,
    lastUpdatedLabel,
    canChangeInline,
    canSendResetEmail,
    unavailableReason,
    onSubmit,
    onReset
}) => {
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
            nextErrors.current = 'Enter your current password.';
        }
        if (newPassword.length < 8) {
            nextErrors.new = 'Password must be at least 8 characters.';
        }
        if (newPassword !== confirmPassword) {
            nextErrors.confirm = 'Passwords do not match.';
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
                        <h3>Password</h3>
                        <button type="button" className="security-inline-link" onClick={onReset}>
                            Forgot password? Reset
                        </button>
                    </div>
                    <label className="security-field">
                        <span>Current password</span>
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
                        <span>New password</span>
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
                        <span>Confirm new password</span>
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
                    <button type="button" className="btn btn-primary security-update-btn" onClick={handleSubmit} disabled={isSubmitting || !canChangeInline}>
                        Update password
                    </button>
                    {!canChangeInline && unavailableReason && <p className="security-muted">{unavailableReason}</p>}
                </div>
                <div className="security-password-info">
                        <div className="security-info-card">
                            <div>
                                <h4>Password</h4>
                                <p>{lastUpdatedLabel}</p>
                                <p>Resetting your password signs you out of active sessions.</p>
                            </div>
                        <button type="button" className="btn btn-outline security-secondary-btn" onClick={onReset} disabled={!canSendResetEmail}>
                            Reset
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PasswordCard;
