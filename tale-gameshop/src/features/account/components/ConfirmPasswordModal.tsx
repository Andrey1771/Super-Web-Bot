import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { serverErrorText } from '../../../utils/api-error';
import ReactDOM from 'react-dom';
import { CloseGlyph } from '../../../components/common/MediaGlyphs';
import './confirm-password-modal.css';

/**
 * Повторный ввод пароля перед чувствительным действием (показ ключей). Пароль уходит только в
 * `onConfirm`; ошибку сервера («Invalid password. 3 attempts left.») окно показывает под полем
 * и не закрывается, чтобы человек попробовал ещё раз. Escape и клик по фону — отмена.
 */
const ConfirmPasswordModal: React.FC<{
  title?: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: (password: string) => Promise<void>;
  onClose: () => void;
}> = ({ title, description, confirmLabel, onConfirm, onClose }) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(password);
    } catch (err: any) {
      setError(serverErrorText(err, t('account.confirmPassword.failed')));
      setPassword('');
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="confirm-password" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <form className="confirm-password__card" role="dialog" aria-modal="true" aria-labelledby="confirm-password-title" onSubmit={submit}>
        <div className="confirm-password__head">
          <h3 id="confirm-password-title">{title ?? t('account.confirmPassword.title')}</h3>
          <button type="button" className="confirm-password__close" aria-label={t('common.close')} onClick={onClose} disabled={busy}>
            <CloseGlyph size={20} />
          </button>
        </div>
        <p className="confirm-password__text">{description ?? t('account.confirmPassword.text')}</p>
        <label className="confirm-password__label" htmlFor="confirm-password-input">{t('common.password')}</label>
        <input
          id="confirm-password-input"
          ref={inputRef}
          className="input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
        />
        {error && <p className="confirm-password__error" role="alert">{error}</p>}
        <div className="confirm-password__actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !password}>{busy ? t('common.checking') : confirmLabel ?? t('account.confirmPassword.confirm')}</button>
        </div>
      </form>
    </div>,
    document.body
  );
};

export default ConfirmPasswordModal;
