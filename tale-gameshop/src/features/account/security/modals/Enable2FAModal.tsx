import React, {useState} from 'react';
import type {TwoFactorSetup} from '../types';

type Enable2FAModalProps = {
    isOpen: boolean;
    isLoading: boolean;
    setup: TwoFactorSetup | null;
    backupCodes: string[] | null;
    onClose: () => void;
    onConfirm: (payload: { code: string; password: string }) => void;
};

const Enable2FAModal: React.FC<Enable2FAModalProps> = ({
    isOpen,
    isLoading,
    setup,
    backupCodes,
    onClose,
    onConfirm
}) => {
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    if (!isOpen) {
        return null;
    }

    const handleConfirm = () => {
        if (!code || !password) {
            setError('Enter the 6-digit code and your password.');
            return;
        }
        setError('');
        onConfirm({code, password});
    };

    const handleCopyCodes = async () => {
        if (!backupCodes) {
            return;
        }
        await navigator.clipboard.writeText(backupCodes.join('\n'));
    };

    return (
        <div className="security-modal-overlay">
            <div className="security-modal large">
                <div className="security-modal-header">
                    <h3>Enable two-factor authentication</h3>
                    <button type="button" className="security-modal-close" onClick={onClose}>
                        ✕
                    </button>
                </div>
                <div className="security-modal-body">
                    {setup ? (
                        <div className="security-2fa-setup">
                            <div className="security-2fa-qr">
                                <img src={`data:image/png;base64,${setup.qrPngBase64}`} alt="2FA QR code" />
                                <p>Scan this QR code using your authenticator app.</p>
                                <small>Manual key: {setup.manualKey}</small>
                            </div>
                            <div className="security-2fa-form">
                                <label className="security-field">
                                    <span>Enter 6-digit code</span>
                                    <input
                                        className="input"
                                        value={code}
                                        onChange={(event) => setCode(event.target.value)}
                                        placeholder="123456"
                                        maxLength={6}
                                    />
                                </label>
                                <label className="security-field">
                                    <span>Password</span>
                                    <input
                                        className="input"
                                        type="password"
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        placeholder="••••••••"
                                    />
                                </label>
                                {error && <p className="security-error">{error}</p>}
                                <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={isLoading}>
                                    Confirm 2FA
                                </button>
                            </div>
                        </div>
                    ) : (
                        <p>Preparing two-factor setup…</p>
                    )}
                    {backupCodes && backupCodes.length > 0 && (
                        <div className="security-backup-codes">
                            <h4>Backup codes</h4>
                            <p>Save these codes in a secure place. Each can be used once.</p>
                            <div className="security-code-grid">
                                {backupCodes.map((codeItem) => (
                                    <span key={codeItem}>{codeItem}</span>
                                ))}
                            </div>
                            <button type="button" className="btn btn-outline" onClick={handleCopyCodes}>
                                Copy codes
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Enable2FAModal;
