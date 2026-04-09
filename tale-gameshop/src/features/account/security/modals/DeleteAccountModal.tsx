import React, {useState} from 'react';

type DeleteAccountModalProps = {
    isOpen: boolean;
    isSubmitting: boolean;
    onClose: () => void;
    onConfirm: (payload: { confirmation: string; password: string }) => void;
};

const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({
    isOpen,
    isSubmitting,
    onClose,
    onConfirm
}) => {
    const [confirmation, setConfirmation] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    if (!isOpen) {
        return null;
    }

    const handleSubmit = () => {
        if (confirmation !== 'DEACTIVATE') {
            setError('Type DEACTIVATE to confirm.');
            return;
        }
        if (!password) {
            setError('Enter your password.');
            return;
        }
        setError('');
        onConfirm({confirmation, password});
    };

    return (
        <div className="security-modal-overlay">
            <div className="security-modal">
                <div className="security-modal-header">
                    <h3>Deactivate account</h3>
                    <button type="button" className="security-modal-close" onClick={onClose}>
                        ✕
                    </button>
                </div>
                <div className="security-modal-body">
                    <p>This action deactivates your account in Keycloak and signs you out from all sessions.</p>
                    <p>This action is not a permanent data deletion flow.</p>
                    <label className="security-field">
                        <span>Type DEACTIVATE to confirm</span>
                        <input
                            className="input"
                            value={confirmation}
                            onChange={(event) => setConfirmation(event.target.value)}
                            placeholder="DEACTIVATE"
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
                </div>
                <div className="security-modal-footer">
                    <button type="button" className="btn btn-outline" onClick={onClose}>
                        Cancel
                    </button>
                    <button type="button" className="btn btn-outline security-danger-btn" onClick={handleSubmit} disabled={isSubmitting}>
                        Deactivate account
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DeleteAccountModal;
