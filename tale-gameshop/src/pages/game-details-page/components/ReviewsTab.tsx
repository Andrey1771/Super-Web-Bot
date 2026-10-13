import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import type { GameUserContext, RatingBreakdownItem, Review, ReviewTag } from '../../../types/game-details';
import type { IGameDetailsService } from '../../../iterfaces/i-game-details-service';
import type { GameReviewFilters, ReviewPayload, ReviewReportPayload, ReviewReportResult } from '../../../types/game-details-service';
import ReportReviewModal from './ReportReviewModal';
import Pagination from '../../../components/common/Pagination';
import SortSelect from '../../../components/common/SortSelect';
import { describeApiError, serverErrorText, type ApiErrorDescription } from '../../../utils/api-error';
import { clearReportDraft, loadReportDraft, type ReviewReportDraft } from '../../../utils/review-report-draft';
import { acknowledgeSessionExpired } from '../../../components/session-expired/SessionExpiredNotice';
import container from '../../../inversify.config';
import IDENTIFIERS from '../../../constants/identifiers';
import type { IKeycloakService } from '../../../iterfaces/i-keycloak-service';
import type { IKeycloakAuthService } from '../../../iterfaces/i-keycloak-auth-service';
import { StarRating, type RatingSummaryView } from './shared';
import { formatDate } from '../../../i18n/format';

/** По 10 на страницу, как у Amazon и Metacritic; страница живёт в адресе (`?page=2`). */
export const PAGE_SIZE = 10;
/** По умолчанию — самые полезные, как у Steam и Amazon: свежий отзыв редко самый содержательный. */
export const DEFAULT_SORT = 'helpful:desc';
// Подписи — в словаре: reviews.sort.<key> и reviews.listTitle.<key>.
const SORT_OPTIONS = [
  { value: 'helpful:desc', key: 'helpful' },
  { value: 'createdAt:desc', key: 'newest' },
  { value: 'rating:desc', key: 'highest' },
  { value: 'rating:asc', key: 'lowest' }
];

/** Номер страницы из адреса: целое от 1, иначе первая. */
const readPage = (raw: string | null) => {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 ? value : 1;
};
/** Короткие отзывы показываем целиком — «Read more» только там, где есть что раскрывать. */
const LONG_REVIEW_CHARS = 260;
/** Сколько строк видно в свёрнутом отзыве — столько же стоит в CSS (-webkit-line-clamp). */
const COLLAPSED_LINES = 5;

/** Переносы автора сохраняются, но больше одной пустой строки подряд не оставляем. */
const normalizeReviewText = (text?: string | null) => (text ?? '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');

/* Одна шкала — звёзды: средняя, распределение, теги. Отдельного «N% recommend» нет: он был второй
   оценкой того же самого и спорил со звёздами. */
const ReviewsSummary = ({
  ratingSummary,
  breakdown,
  tags,
  cta
}: {
  ratingSummary: RatingSummaryView;
  breakdown: RatingBreakdownItem[];
  tags: ReviewTag[];
  /** Блок «Review this game» внизу сводки: что может сделать этот человек — написать, войти, править. */
  cta?: React.ReactNode;
}) => {
  const { t } = useTranslation();
  return (
  <div className="card review-summary">
    {/* Как у Amazon: крупная оценка, рядом звёзды и число оценок; словесная метка — в заголовке секции. */}
    <div className="review-summary__score">
      <span className="review-score">{ratingSummary.totalReviews > 0 ? ratingSummary.average.toFixed(1) : '—'}</span>
      <div>
        <StarRating rating={ratingSummary.average} size={16} />
        <p className="review-count">{t('reviews.ratings', { count: ratingSummary.totalReviews })}</p>
      </div>
    </div>
    <div className="review-breakdown">
      {breakdown.map((item) => (
        <div key={item.rating} className="review-bar">
          <span>{item.rating}</span>
          <div className="bar-track">
            <span className="bar-fill" style={{ width: `${item.percent}%` }} />
          </div>
          <span>{item.percent}%</span>
        </div>
      ))}
    </div>
    {tags.length > 0 && (
      <div className="review-tags">
        {tags.map((tag) => (
          <span key={tag.id} className="tag-chip">
            {tag.label}
          </span>
        ))}
      </div>
    )}
    {cta && <div className="review-summary__cta">{cta}</div>}
  </div>
  );
};

/** Аватар отзыва: картинка, а без неё — инициалы, а не сломанная иконка с alt-текстом. */
const ReviewAvatar = ({ name, url }: { name: string; url?: string }) => {
  const [broken, setBroken] = useState(false);
  const initials = (name || '?')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  if (!url || broken) {
    return <span className="review-avatar review-avatar--initials" aria-hidden="true">{initials}</span>;
  }
  return <img className="review-avatar" src={url} alt={name} onError={() => setBroken(true)} />;
};

/** Палец вверх — контурный, чтобы в пустом состоянии не спорить с оранжевыми звёздами. */
const ThumbGlyph = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
    <path
      d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Zm0 0 4.2-7.4a1.5 1.5 0 0 1 2.8.8V9h4.5a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 17.3 19H7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/* Флаг нарисован симметрично вокруг центра 12,12: раньше древко стояло у левого края, и в круглой
   подсветке иконка казалась сдвинутой. */
const FlagGlyph = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
    <path d="M6.5 21V3.5m0 0h10.5l-1.6 4.25 1.6 4.25H6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Карточка отзыва. «Helpful» и «Report» — настоящие действия с видимым результатом: голос
 * подсвечивает кнопку и меняет счётчик, жалоба меняет кнопку на «Reported» (отзыв уходит на
 * модерацию и после перезагрузки пропадёт с витрины), ошибка сети пишется под кнопками. Гость
 * кнопки видит и по клику уходит на вход — раньше они были просто выключены, и это выглядело как
 * поломка. Экспорт — ради теста.
 */
export const ReviewCard = ({
  review,
  onHelpful,
  onReport,
  canInteract,
  onSignIn,
  initialReportDraft,
  isMine,
  onEdit
}: {
  review: Review;
  /** Возвращает, стоит ли теперь голос пользователя (toggle). */
  onHelpful: (reviewId: string) => Promise<boolean | void> | void;
  /** Жалоба с причиной; результат говорит, ушёл ли отзыв с витрины. */
  onReport: (reviewId: string, payload: ReviewReportPayload) => Promise<ReviewReportResult | void> | void;
  canInteract: boolean;
  /** Что делать гостю по клику на действие: обычно — увести на вход. */
  onSignIn?: () => void;
  /** Черновик жалобы после возврата со входа: окно открывается сразу, с прежними причиной и текстом. */
  initialReportDraft?: ReviewReportDraft | null;
  isMine?: boolean;
  onEdit?: () => void;
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [voted, setVoted] = useState(false);
  const [busy, setBusy] = useState<'helpful' | 'report' | null>(null);
  const [reported, setReported] = useState<'no' | 'sent' | 'hidden'>('no');
  const [reportOpen, setReportOpen] = useState(false);
  const [actionError, setActionError] = useState<ApiErrorDescription | null>(null);
  const text = normalizeReviewText(review.text);
  const textRef = useRef<HTMLParagraphElement | null>(null);
  // «Read more» нужен, когда текст не влез в три строки. По одной длине не угадать: пять коротких
  // строк через Enter тоже не влезают — поэтому свёрнутый абзац ещё и измеряется.
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || expanded) return undefined;
    const check = () => setOverflows(element.scrollHeight > element.clientHeight + 1);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [expanded, text]);
  const isLong = overflows || text.length > LONG_REVIEW_CHARS || (text.match(/\n/g)?.length ?? 0) >= COLLAPSED_LINES;

  // Вернулись со входа с недописанной жалобой — открываем окно с ней и забываем черновик.
  useEffect(() => {
    if (initialReportDraft && canInteract) {
      clearReportDraft();
      setReportOpen(true);
    }
  }, [initialReportDraft, canInteract]);

  const guard = (action: () => Promise<void>) => async () => {
    if (!canInteract) {
      onSignIn?.();
      return;
    }
    setActionError(null);
    try {
      await action();
    } catch (err) {
      // Причина словами: сессия истекла (и кнопка входа), сеть, текст сервера — а не общее «попробуйте ещё раз».
      const described = describeApiError(err, t('common.couldNotSave'));
      if (described.kind === 'session') acknowledgeSessionExpired();
      setActionError(described);
    } finally {
      setBusy(null);
    }
  };

  const handleHelpful = guard(async () => {
    setBusy('helpful');
    const result = await onHelpful(review.id);
    if (typeof result === 'boolean') setVoted(result);
  });

  // Жалоба — только через окно с причиной: случайный клик по «Report» ничего не делает.
  const openReport = () => {
    if (!canInteract) {
      onSignIn?.();
      return;
    }
    setReportOpen(true);
  };

  const submitReport = async (payload: ReviewReportPayload) => {
    const result = await onReport(review.id, payload);
    setReportOpen(false);
    setReported(result && result.hidden ? 'hidden' : 'sent');
  };

  // Раскладка как у Steam: аватар — своя колонка, имя, оценка, текст и действия — колонка справа,
  // выровненная по имени; флажок жалобы — в правом верхнем углу карточки.
  return (
    <div className={`card review-card${isMine ? ' review-card--mine' : ''}`}>
      <ReviewAvatar name={review.userName} url={review.avatarUrl} />
      <div className="review-body">
        {/* Шапка в две строки, как у Amazon и App Store: имя слева и дата справа, под ними звёзды
            и часы. Оценка — только звёзды: подпись «Recommended» дублировала их и была убрана. */}
        <div className="review-header">
          <div className="review-header__top">
            <p className="review-name">
              {review.userName}
              {isMine && (
                <>
                  <span className="review-mine-badge">{t('reviews.yourReview')}</span>
                  <button type="button" className="review-edit-link" onClick={onEdit}>{t('common.edit')}</button>
                </>
              )}
            </p>
            {/* Дата — когда написан; ниже, если автор правил, — когда. Как у Steam: «Posted / Updated». */}
            <div className="review-dates">
              <time className="review-date" dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
              {review.editedAt && (
                <time className="review-date review-date--edited" dateTime={review.editedAt} title={t('reviews.editedOn', { date: formatDate(review.editedAt) })}>
                  {t('reviews.edited', { date: formatDate(review.editedAt) })}
                </time>
              )}
            </div>
          </div>
          <div className="review-meta">
            <StarRating rating={review.rating} size={16} />
            {review.playtimeHours ? <span className="review-meta__item">{t('reviews.hoursPlayed', { hours: review.playtimeHours.toFixed(1) })}</span> : null}
            {/* Как у Steam: отзыв после возврата остаётся, читателю честно говорят, что покупку вернули. */}
            {review.refunded && (
              <span className="review-meta__item">
                <span className="review-refunded" title={t('reviews.refundedHint')}>{t('reviews.refunded')}</span>
              </span>
            )}
          </div>
          <div className="review-header__side">
            {!isMine && reported === 'no' && (
              <button
                type="button"
                className="review-flag"
                aria-label={t('reviews.report')}
                disabled={busy !== null}
                onClick={openReport}
                title={canInteract ? t('reviews.reportThis') : t('reviews.signInToReport')}
              >
                <FlagGlyph />
              </button>
            )}
          </div>
        </div>
        {/* Свёрнутый текст растворяется книзу, а на границе висит круглая кнопка со стрелкой, как у
            Notion и Medium: слов нет, но жест очевиден. Раскрыто — та же кнопка стрелкой вверх под текстом. */}
        <div className={`review-text-wrap${isLong && !expanded ? ' is-clamped' : ''}`}>
          <p ref={textRef} className={`review-text ${expanded || !isLong ? 'is-expanded' : ''}`}>{text}</p>
        </div>
        {isLong && (
          <div className={`review-more${expanded ? ' is-expanded' : ''}`}>
            <button
              type="button"
              className="review-more__btn"
              aria-expanded={expanded}
              aria-label={expanded ? t('common.showLess') : t('common.showMore')}
              title={expanded ? t('common.showLess') : t('common.showMore')}
              onClick={() => setExpanded((prev) => !prev)}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" className={expanded ? 'is-up' : undefined}>
                <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
        {/* Голос — вопросом, как у Amazon: «Was this review helpful?» и пилюля «Yes · N». Одинокая
            иконка с числом читалась как лайк, а не как оценка полезности. */}
        {!isMine && (
        <div className="review-actions">
            <>
              <span className="review-actions__prompt">{voted ? t('reviews.youFoundHelpful') : t('reviews.wasHelpful')}</span>
              <button
                type="button"
                className={`review-vote${voted ? ' is-active' : ''}`}
                aria-label={t('reviews.helpfulAria', { count: review.helpfulCount })}
                aria-pressed={voted}
                disabled={busy !== null}
                onClick={handleHelpful}
                title={canInteract ? (voted ? t('reviews.takeVoteBack') : t('reviews.markHelpful')) : t('reviews.signInToVote')}
              >
                <ThumbGlyph size={15} />
                {t('reviews.yes')} <span className="review-vote__count">{review.helpfulCount}</span>
              </button>
              {reported !== 'no' && (
                <span className="review-action-note">
                  <FlagGlyph />
                  {reported === 'hidden'
                    ? t('reviews.reportedHidden')
                    : t('reviews.reportedSent')}
                </span>
              )}
            </>
        </div>
        )}
        {actionError && (
          <p className="review-action-error">
            {actionError.message}
            {actionError.kind === 'session' && (
              <button type="button" className="btn btn-primary review-action-signin" onClick={onSignIn}>
                {t('common.signIn')}
              </button>
            )}
          </p>
        )}
      </div>
      {reportOpen && (
        <ReportReviewModal
          reviewId={review.id}
          reviewAuthor={review.userName}
          initialDraft={initialReportDraft ?? null}
          onSubmit={submitReport}
          onClose={() => setReportOpen(false)}
          onSignIn={onSignIn}
        />
      )}
    </div>
  );
};

/**
 * Форма отзыва. Кто может писать — решает контекст покупателя: гость → войти, не покупал →
 * подсказка (отзывы только от покупателей, сервер это тоже проверяет), уже писал → редактирование.
 */
/**
 * Форма отзыва. Тем, кому писать нельзя (гость, не покупал), форма не рисуется вовсе — только
 * короткая плашка с причиной: выключенные звёзды и пустое поле на полэкрана выглядели как поломка,
 * у Steam для таких посетителей формы просто нет. Экспорт — ради теста.
 */
export const WriteReviewCard = ({
  isAuthenticated,
  hasPurchased,
  existing,
  onSubmit,
  onCancel
}: {
  isAuthenticated: boolean;
  hasPurchased: boolean;
  existing?: Review | null;
  onSubmit: (payload: ReviewPayload) => Promise<void>;
  onCancel?: () => void;
}) => {
  const { t } = useTranslation();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [text, setText] = useState(existing?.text ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <div className="card write-review write-review--locked" data-testid="write-review-locked">
        <p className="muted">{t('reviews.signInToLeave')}</p>
        <Link to="/logIn" className="btn btn-primary">
          {t('common.signIn')}
        </Link>
      </div>
    );
  }
  if (!hasPurchased) {
    return (
      <div className="card write-review write-review--locked" data-testid="write-review-locked">
        <p className="muted">{t('reviews.customersOnly')}</p>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!text.trim() || rating === 0) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSubmit({ rating, text: text.trim() });
      if (!existing) {
        setText('');
        setRating(0);
      }
    } catch (err: any) {
      setError(serverErrorText(err, t('reviews.saveFailed')));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="card write-review">
      <h2>{existing ? t('reviews.editYour') : t('reviews.write')}</h2>
      <div className="write-stars" aria-label={t('reviews.selectRating')}>
        {Array.from({ length: 5 }).map((_, index) => (
          <button
            key={index}
            type="button"
            className={`star-button ${rating >= index + 1 ? 'is-active' : ''}`}
            onClick={() => setRating(index + 1)}
            aria-label={t('reviews.stars', { count: index + 1 })}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        className="input review-textarea"
        placeholder={t('reviews.placeholder')}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {error && <p className="write-review-error">{error}</p>}
      <div className="write-review-buttons">
        <button type="button" className="btn btn-primary" disabled={!text.trim() || rating === 0 || isSaving} onClick={handleSubmit}>
          {isSaving ? t('common.saving') : existing ? t('common.saveChanges') : t('reviews.submit')}
        </button>
        {existing && onCancel && (
          <button type="button" className="btn btn-outline" onClick={onCancel} disabled={isSaving}>
            {t('common.cancel')}
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Вкладка «Reviews»: грузит отзывы при открытии, фильтрует, подгружает страницами. Свой отзыв —
 * первым и с кнопкой «Edit»; форма — только для купивших (`userContext.hasPurchased`).
 */
const ReviewsTab = ({
  gameId,
  service,
  ratingSummary,
  breakdown,
  tags,
  isAuthenticated,
  userContext,
  onReviewsChanged
}: {
  gameId: string;
  service: IGameDetailsService;
  ratingSummary: RatingSummaryView;
  breakdown: RatingBreakdownItem[];
  tags: ReviewTag[];
  isAuthenticated: boolean;
  userContext?: GameUserContext;
  /** Отзыв создан/изменён — родитель перечитывает сводку (средняя, распределение, % рекомендуют). */
  onReviewsChanged?: () => void;
}) => {
  const { t } = useTranslation();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  // Страница — в адресе, а не в состоянии: ссылка ведёт на нужную страницу, «назад» возвращает
  // на предыдущую. Раньше «Show more» дописывал отзывы в конец, и ни того, ни другого не было.
  const [searchParams, setSearchParams] = useSearchParams();
  const page = readPage(searchParams.get('page'));
  const setPage = (next: number, { replace = false }: { replace?: boolean } = {}) => {
    const params = new URLSearchParams(searchParams);
    if (next <= 1) {
      params.delete('page');
    } else {
      params.set('page', String(next));
    }
    setSearchParams(params, { replace });
  };
  const [filters, setFilters] = useState<Omit<GameReviewFilters, 'page' | 'pageSize'>>({ sort: DEFAULT_SORT });
  const listRef = useRef<HTMLDivElement | null>(null);
  const writeFormRef = useRef<HTMLDivElement | null>(null);
  // Прокрутка к началу списка — только после клика по странице, не при открытии по ссылке.
  const scrollOnNextLoad = useRef(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [myReview, setMyReview] = useState<Review | null>(userContext?.myReview ?? null);
  const [editing, setEditing] = useState(false);
  // Черновик жалобы читаем один раз при открытии вкладки: он мог остаться от ухода на вход.
  const [reportDraft] = useState(() => loadReportDraft());

  // Вход с возвратом на эту же страницу (с вкладкой): страница /logIn возвращает на главную,
  // и человек терял бы место, откуда ушёл.
  const signIn = () => {
    const keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);
    const authService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);
    void authService.loginWithRedirect(keycloakService.keycloak, window.location.href);
  };

  useEffect(() => {
    setMyReview(userContext?.myReview ?? null);
  }, [userContext?.myReview]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    service
      .getReviews(gameId, { ...filters, page, pageSize: PAGE_SIZE })
      .then((response) => {
        if (cancelled) return;
        setReviews(response.items);
        setTotal(response.total);
        if (scrollOnNextLoad.current) {
          scrollOnNextLoad.current = false;
          listRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
        }
      })
      .catch((err) => console.error('Failed to load reviews', err))
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, service, filters, page, reloadKey]);

  const applyFilter = (patch: Partial<typeof filters>) => {
    setPage(1, { replace: true });
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  const goToPage = (next: number) => {
    scrollOnNextLoad.current = true;
    setPage(next);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Адрес вёл за последнюю страницу (отзывы удалили, фильтр сузил выдачу) — тихо встаём на последнюю.
  useEffect(() => {
    if (!isLoading && total > 0 && page > totalPages) {
      setPage(totalPages, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, total, page, totalPages]);

  // Все отзывы здесь — от покупателей (иначе сервер их не принимает), поэтому фильтра
  // «только подтверждённые покупки» и плашки на карточке нет: отмечать «все» — бессмысленно.
  const visible = reviews.filter((review) => !myReview || review.id !== myReview.id);
  const hasPurchased = Boolean(userContext?.hasPurchased);
  const rangeFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeTo = Math.min(total, page * PAGE_SIZE);

  const refresh = () => {
    setPage(1, { replace: true });
    setReloadKey((prev) => prev + 1);
    onReviewsChanged?.();
  };

  // Заголовок списка говорит, по чему он отсортирован: «Top reviews», «Newest reviews»…
  const sortKey = SORT_OPTIONS.find((option) => option.value === (filters.sort ?? DEFAULT_SORT))?.key;
  const listTitle = sortKey ? t(`reviews.listTitle.${sortKey}`) : t('product.tabs.reviews');
  const sortOptions = SORT_OPTIONS.map((option) => ({ value: option.value, label: t(`reviews.sort.${option.key}`) }));
  const rangeText = total === 0 ? t('reviews.none') : total <= PAGE_SIZE ? t('common.reviewsCount', { count: total }) : rangeFrom === rangeTo ? t('reviews.showingOne', { index: rangeFrom, total }) : t('reviews.showingRange', { from: rangeFrom, to: rangeTo, total });

  // Что может сделать этот человек — в сводке, как у Amazon: написать, войти, править или ничего.
  const scrollTo = (node: HTMLElement | null) => node?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  const summaryCta = myReview ? (
    <>
      <h4>{t('reviews.yourReview')}</h4>
      <p className="review-summary__hint">{t('reviews.changedMind')}</p>
      <button type="button" className="btn btn-outline review-summary__btn" onClick={() => { setEditing(true); scrollTo(listRef.current); }}>
        {t('reviews.editYour')}
      </button>
    </>
  ) : !isAuthenticated ? (
    <>
      <h4>{t('reviews.reviewThis')}</h4>
      <p className="review-summary__hint">{t('reviews.boughtSignIn')}</p>
      <button type="button" className="btn btn-outline review-summary__btn" onClick={signIn}>
        {t('reviews.signInToReview')}
      </button>
    </>
  ) : !hasPurchased ? (
    <>
      <h4>{t('reviews.reviewThis')}</h4>
      <p className="review-summary__hint">{t('reviews.customersOnly')}</p>
    </>
  ) : (
    <>
      <h4>{t('reviews.reviewThis')}</h4>
      <p className="review-summary__hint">{t('reviews.shareThoughts')}</p>
      <button type="button" className="btn btn-primary review-summary__btn" onClick={() => scrollTo(writeFormRef.current)}>
        {t('reviews.write')}
      </button>
    </>
  );

  return (
    <section className="game-details-section" id="reviews" aria-label={t('product.tabs.reviews')}>
      {/* Раскладка как у Amazon: заголовок с пилюлей рейтинга; слева сводка с призывом написать,
          справа список с собственной панелью — фильтр, сортировка и поиск стоят у того, чем управляют. */}
      <div className="reviews-head">
        <h2>{t('reviews.customerReviews')}</h2>
        {ratingSummary.totalReviews > 0 && (
          <span className="reviews-head__label">{ratingSummary.average.toFixed(1)} · {ratingSummary.label}</span>
        )}
      </div>

      <div className="reviews-grid">
        <ReviewsSummary ratingSummary={ratingSummary} breakdown={breakdown} tags={tags} cta={summaryCta} />
        <div className="reviews-column" ref={listRef}>
        <div className="review-list-head">
          <div className="review-list-head__left">
            <h3>{listTitle}</h3>
            <span className="review-list-head__range">{rangeText}</span>
          </div>
          <div className="review-list-head__right">
            <select
              className="input reviews-filter"
              aria-label={t('reviews.filterByRating')}
              value={filters.rating ?? ''}
              onChange={(event) => applyFilter({ rating: event.target.value ? Number(event.target.value) : undefined })}
            >
              <option value="">{t('reviews.allRatings')}</option>
              {[5, 4, 3, 2, 1].map((stars) => (
                <option key={stars} value={String(stars)}>{t('reviews.stars', { count: stars })}</option>
              ))}
            </select>
            <SortSelect caption={t('common.sort')} listLabel={t('reviews.sortReviews')} options={sortOptions} value={filters.sort ?? DEFAULT_SORT} onChange={(sort) => applyFilter({ sort })} />
            <input
              className="input reviews-search"
              placeholder={t('reviews.searchPlaceholder')}
              aria-label={t('reviews.search')}
              value={filters.q ?? ''}
              onChange={(event) => applyFilter({ q: event.target.value })}
            />
          </div>
        </div>
        <div className="review-list" aria-busy={isLoading}>
          {myReview && !editing && page === 1 && (
            <ReviewCard review={myReview} onHelpful={() => undefined} onReport={() => undefined} canInteract={false} isMine onEdit={() => setEditing(true)} />
          )}
          {myReview && editing && (
            <WriteReviewCard
              isAuthenticated={isAuthenticated}
              hasPurchased={hasPurchased}
              existing={myReview}
              onSubmit={async (payload) => {
                await service.updateReview(myReview.id, payload);
                setMyReview({ ...myReview, ...payload, editedAt: new Date().toISOString() });
                setEditing(false);
                refresh();
              }}
              onCancel={() => setEditing(false)}
            />
          )}
          {isLoading && reviews.length === 0 ? (
            <p className="reviews-empty">{t('reviews.loading')}</p>
          ) : visible.length === 0 && !myReview ? (
            <p className="reviews-empty">{total === 0 ? t('reviews.emptyFirst') : t('reviews.noMatch')}</p>
          ) : (
            visible.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                onHelpful={async (reviewId) => {
                  const response = await service.toggleHelpful(reviewId);
                  setReviews((prev) => prev.map((item) => (item.id === reviewId ? { ...item, helpfulCount: response.count } : item)));
                  return response.helpful;
                }}
                onReport={(reviewId, payload) => service.reportReview(reviewId, payload)}
                canInteract={isAuthenticated}
                onSignIn={signIn}
                initialReportDraft={reportDraft?.reviewId === review.id ? reportDraft : null}
              />
            ))
          )}
        </div>
        <Pagination page={page} totalPages={totalPages} onChange={goToPage} disabled={isLoading} label={t('reviews.pages')} />
        </div>
      </div>

      {!myReview && isAuthenticated && hasPurchased && (
        <div className="reviews-lower-grid" ref={writeFormRef}>
          <WriteReviewCard
            isAuthenticated={isAuthenticated}
            hasPurchased={hasPurchased}
            onSubmit={async (payload) => {
              await service.createReview(gameId, payload);
              refresh();
            }}
          />
        </div>
      )}
    </section>
  );
};

export default ReviewsTab;
