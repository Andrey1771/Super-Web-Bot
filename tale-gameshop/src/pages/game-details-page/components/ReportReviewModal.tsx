import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import type { ReviewReportPayload, ReviewReportReason } from '../../../types/game-details-service';
import { describeApiError, type ApiErrorDescription } from '../../../utils/api-error';
import { saveReportDraft, type ReviewReportDraft } from '../../../utils/review-report-draft';
import { acknowledgeSessionExpired } from '../../../components/session-expired/SessionExpiredNotice';
import { CloseGlyph } from '../../../components/common/MediaGlyphs';

/** Причины — те же, что у Steam и Amazon: короткий список, свободный текст отдельно. Порядок — от частого к редкому. */
export const REPORT_REASONS: Array<{ value: ReviewReportReason; label: string; hint: string }> = [
  { value: 'Spam', label: 'Spam or advertising', hint: 'Links, promo codes, unrelated products.' },
  { value: 'Abusive', label: 'Abusive or offensive', hint: 'Insults, harassment, hate speech.' },
  { value: 'OffTopic', label: 'Not about the game', hint: 'About delivery, the store or something else.' },
  { value: 'PersonalData', label: 'Personal information', hint: 'Names, contacts, keys or other private data.' },
  { value: 'Malware', label: 'Malicious links', hint: 'Phishing, cheats, cracked copies.' },
  { value: 'Other', label: 'Other', hint: 'Tell us what is wrong below.' }
];

export const REPORT_COMMENT_MAX = 500;

type ReportReviewModalProps = {
  reviewId: string;
  reviewAuthor: string;
  /** Черновик после возврата со входа: окно открывается с прежними причиной и текстом. */
  initialDraft?: Pick<ReviewReportDraft, 'reason' | 'comment'> | null;
  onSubmit: (payload: ReviewReportPayload) => Promise<void>;
  onClose: () => void;
  /** Сессия истекла посреди жалобы: черновик уже сохранён, родитель уводит на вход с возвратом сюда. */
  onSignIn?: () => void;
};

/**
 * Окно жалобы на отзыв. Жалоба — заявка модератору, а не действие над отзывом, поэтому без причины
 * её не отправить, а случайный клик по «Report» закрывается крестиком или Esc и ничего не делает.
 * Для «Other» комментарий обязателен: без него модератору нечего разбирать. Если сессия истекла,
 * окно говорит об этом прямо, сохраняет черновик и предлагает войти — ничего набранного не теряется.
 */
const ReportReviewModal = ({ reviewId, reviewAuthor, initialDraft, onSubmit, onClose, onSignIn }: ReportReviewModalProps) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState<ReviewReportReason | null>(initialDraft?.reason ?? null);
  const [comment, setComment] = useState(initialDraft?.comment ?? '');
  const [isSending, setSending] = useState(false);
  const [error, setError] = useState<ApiErrorDescription | null>(null);
  const firstRadioRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    firstRadioRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const commentRequired = reason === 'Other';
  const sessionLost = error?.kind === 'session';
  const canSend = reason !== null && (!commentRequired || comment.trim().length > 0) && !isSending && !sessionLost;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSend || !reason) return;
    setSending(true);
    setError(null);
    try {
      await onSubmit({ reason, comment: comment.trim() || undefined });
    } catch (err) {
      const described = describeApiError(err, t('report.sendFailed'));
      if (described.kind === 'session') {
        // Причина и текст переживут вход; общая плашка внизу не нужна — подсказка уже здесь.
        saveReportDraft({ reviewId, reason, comment });
        acknowledgeSessionExpired();
      }
      setError(described);
      setSending(false);
    }
  };

  const signIn = () => {
    saveReportDraft({ reviewId, reason, comment });
    onSignIn?.();
  };

  return createPortal(
    <div
      className="report-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form className="report-modal__card card" onSubmit={handleSubmit}>
        <div className="report-modal__head">
          <h3 id="report-modal-title">{t('reviews.reportThis')}</h3>
          {/* SVG, а не символ «×»: у текстового глифа своя посадка в строке, и в круге он стоял не по центру. */}
          <button type="button" className="report-modal__close" aria-label={t('common.close')} onClick={onClose}>
            <CloseGlyph size={20} />
          </button>
        </div>
        <p className="report-modal__subtitle">
          {t('report.subtitle', { author: reviewAuthor })}
        </p>
        <fieldset className="report-modal__reasons">
          <legend>{t('report.whatWrong')}</legend>
          {REPORT_REASONS.map((item, index) => (
            <label key={item.value} className={`report-modal__reason${reason === item.value ? ' is-selected' : ''}`}>
              <input
                ref={index === 0 ? firstRadioRef : undefined}
                type="radio"
                name="report-reason"
                value={item.value}
                checked={reason === item.value}
                onChange={() => setReason(item.value)}
              />
              <span>
                <span className="report-modal__reason-label">{t(`report.reasons.${item.value}.label`)}</span>
                <span className="report-modal__reason-hint">{t(`report.reasons.${item.value}.hint`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="report-modal__comment">
          <span>
            {t('report.details')} {commentRequired ? t('common.required') : t('common.optional')}
            <span className="report-modal__counter">
              {comment.length}/{REPORT_COMMENT_MAX}
            </span>
          </span>
          <textarea
            className="input"
            maxLength={REPORT_COMMENT_MAX}
            rows={3}
            placeholder={t('report.placeholder')}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </label>
        {error && (
          <div className={`report-modal__error${sessionLost ? ' report-modal__error--session' : ''}`} role="alert">
            <span>{error.message}</span>
            {sessionLost && (
              <>
                <span className="report-modal__error-hint">{t('report.draftSaved')}</span>
                <button type="button" className="btn btn-primary" onClick={signIn}>
                  {t('common.signIn')}
                </button>
              </>
            )}
          </div>
        )}
        <div className="report-modal__actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={isSending}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!canSend}>
            {isSending ? t('common.sending') : t('report.send')}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
};

export default ReportReviewModal;
