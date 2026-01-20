import React, {useState} from 'react';

type ChangeEmailModalProps = {
    isOpen: boolean;
    isSubmitting: boolean;
    onClose: () => void;
    onSubmit: (payload: { newEmail: string; password: string }) => void;
};

const ChangeEmailModal: React.FC<ChangeEmailModalProps> = ({isOpen, isSubmitting, onClose, onSubmit}) => {
    const [newEmail, setNewEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    if (!isOpen) {
        return null;
    }

    const handleSubmit = () => {
        if (!newEmail) {
            setError('Enter a new email address.');
            return;
        }
        if (!password) {
            setError('Enter your password to confirm.');
            return;
        }
        setError('');
        onSubmit({newEmail, password});
    };

    return (
        <div className="security-modal-overlay">
            <div className="security-modal">
                <div className="security-modal-header">
                    <h3>Change email</h3>
                    <button type="button" className="security-modal-close" onClick={onClose}>
                        ✕
                    </button>
                </div>
                <div className="security-modal-body">
                    <label className="security-field">
                        <span>New email</span>
                        <input
                            className="input"
                            type="email"
                            value={newEmail}
                            onChange={(event) => setNewEmail(event.target.value)}
                            placeholder="you@email.com"
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
                    <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
                        Update email
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChangeEmailModal;
