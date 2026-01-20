import React, {useState} from 'react';

type Manage2FAModalProps = {
    isOpen: boolean;
    isLoading: boolean;
    backupCodes: string[] | null;
    onClose: () => void;
    onRegenerate: (payload: { code: string; password: string }) => void;
    onDisable: (payload: { code: string; password: string }) => void;
};

const Manage2FAModal: React.FC<Manage2FAModalProps> = ({
    isOpen,
    isLoading,
    backupCodes,
    onClose,
    onRegenerate,
    onDisable
}) => {
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    if (!isOpen) {
        return null;
    }

    const handleSubmit = (action: 'regenerate' | 'disable') => {
        if (!code || !password) {
            setError('Enter your password and 2FA code.');
            return;
        }
        setError('');
        if (action === 'regenerate') {
            onRegenerate({code, password});
        } else {
            onDisable({code, password});
        }
    };

    const handleCopyCodes = async () => {
        if (!backupCodes) {
            return;
        }
        await navigator.clipboard.writeText(backupCodes.join('\n'));
    };

    return (
        <div className="security-modal-overlay">
            <div className="security-modal">
                <div className="security-modal-header">
                    <h3>Manage 2FA</h3>
                    <button type="button" className="security-modal-close" onClick={onClose}>
                        ✕
                    </button>
                </div>
                <div className="security-modal-body">
                    <label className="security-field">
                        <span>2FA code</span>
                        <input
                            className="input"
                            value={code}
                            onChange={(event) => setCode(event.target.value)}
                            placeholder="123456"
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
                    <div className="security-modal-actions">
                        <button type="button" className="btn btn-outline" onClick={() => handleSubmit('regenerate')} disabled={isLoading}>
                            Regenerate backup codes
                        </button>
                        <button type="button" className="btn btn-outline security-danger-btn" onClick={() => handleSubmit('disable')} disabled={isLoading}>
                            Disable 2FA
                        </button>
                    </div>
                    {backupCodes && backupCodes.length > 0 && (
                        <div className="security-backup-codes">
                            <h4>New backup codes</h4>
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

export default Manage2FAModal;
