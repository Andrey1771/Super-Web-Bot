import { clearReportDraft, loadReportDraft, REVIEW_REPORT_DRAFT_TTL_MS, saveReportDraft } from './review-report-draft';

/** Черновик жалобы переживает уход на вход, но не дольше часа и не в другой вкладке. */

afterEach(() => window.sessionStorage.clear());

it('round-trips the draft and clears it', () => {
  saveReportDraft({ reviewId: 'r1', reason: 'Spam', comment: 'Promo code inside.' });
  expect(loadReportDraft()).toMatchObject({ reviewId: 'r1', reason: 'Spam', comment: 'Promo code inside.' });
  clearReportDraft();
  expect(loadReportDraft()).toBeNull();
});

it('forgets a draft older than an hour', () => {
  saveReportDraft({ reviewId: 'r1', reason: null, comment: 'x' });
  expect(loadReportDraft(Date.now() + REVIEW_REPORT_DRAFT_TTL_MS + 1)).toBeNull();
  expect(window.sessionStorage.getItem('taleshop:review-report-draft')).toBeNull();
});

it('ignores garbage in storage', () => {
  window.sessionStorage.setItem('taleshop:review-report-draft', '{not json');
  expect(loadReportDraft()).toBeNull();
  window.sessionStorage.setItem('taleshop:review-report-draft', JSON.stringify({ reason: 'Spam' }));
  expect(loadReportDraft()).toBeNull();
});
