import type { ReviewReportReason } from '../types/game-details-service';

/**
 * Черновик жалобы на отзыв на время ухода на вход. Сессия истекла посреди заполнения — текст и причина
 * сохраняются в sessionStorage, после возврата на ту же страницу окно открывается с ними снова.
 * sessionStorage, а не localStorage: черновик живёт в этой вкладке и не всплывает через неделю.
 */
export const REVIEW_REPORT_DRAFT_KEY = 'taleshop:review-report-draft';

/** Дольше часа черновик не хранится: человек мог передумать, а окно, всплывшее из ниоткуда, пугает. */
export const REVIEW_REPORT_DRAFT_TTL_MS = 60 * 60 * 1000;

export type ReviewReportDraft = {
  reviewId: string;
  reason: ReviewReportReason | null;
  comment: string;
  savedAt: number;
};

export const saveReportDraft = (draft: Omit<ReviewReportDraft, 'savedAt'>) => {
  try {
    window.sessionStorage.setItem(REVIEW_REPORT_DRAFT_KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // Хранилище недоступно (приватный режим, запрет): жалобу придётся набрать заново — не страшно.
  }
};

export const loadReportDraft = (now = Date.now()): ReviewReportDraft | null => {
  try {
    const raw = window.sessionStorage.getItem(REVIEW_REPORT_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<ReviewReportDraft>;
    if (typeof draft.reviewId !== 'string' || typeof draft.savedAt !== 'number') return null;
    if (now - draft.savedAt > REVIEW_REPORT_DRAFT_TTL_MS) {
      clearReportDraft();
      return null;
    }
    return { reviewId: draft.reviewId, reason: draft.reason ?? null, comment: typeof draft.comment === 'string' ? draft.comment : '', savedAt: draft.savedAt };
  } catch {
    return null;
  }
};

export const clearReportDraft = () => {
  try {
    window.sessionStorage.removeItem(REVIEW_REPORT_DRAFT_KEY);
  } catch {
    // см. saveReportDraft
  }
};
