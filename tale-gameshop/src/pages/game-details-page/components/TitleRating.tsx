import React from 'react';
import { useTranslation } from 'react-i18next';
import { StarRating, type RatingSummaryView } from './shared';

/** Ниже этой средней оценки «Top rated» не показывается, даже если флаг стоит в админке. */
export const TOP_RATED_MIN_AVERAGE = 4.5;

type TitleRatingProps = {
  summary: RatingSummaryView;
  /** Отмечено в админке как «Top rated». Показывается только при живых отзывах со средней от TOP_RATED_MIN_AVERAGE:
   *  «лучшее» по нулю отзывов или с оценкой 3.0 — враньё, даже если флаг стоит. */
  isTopRated?: boolean;
  onClick?: () => void;
};

/**
 * Строка рейтинга под названием игры — как у Epic: звёзды, оценка и число отзывов относятся к самой
 * игре, а не к покупке, поэтому живут рядом с названием, а не в карточке покупки. Клик ведёт на
 * вкладку отзывов. Без отзывов — честное «No reviews yet».
 */
const TitleRating = ({ summary, isTopRated = false, onClick }: TitleRatingProps) => {
  const { t } = useTranslation();
  const hasReviews = summary.totalReviews > 0;
  const showTopRated = isTopRated && hasReviews && summary.average >= TOP_RATED_MIN_AVERAGE;

  return (
    <button type="button" className="gd-rating" onClick={onClick} disabled={!onClick} aria-label={t('product.tabs.reviews')}>
      <StarRating rating={hasReviews ? summary.average : 0} size={16} />
      {hasReviews ? (
        <>
          <span className="gd-rating__value">{summary.average.toFixed(1)}</span>
          <span className="gd-rating__count">
            {t('common.reviewsCount', { count: summary.totalReviews })}
          </span>
        </>
      ) : (
        <span className="gd-rating__count">{t('product.rating.none')}</span>
      )}
      {showTopRated && <span className="gd-rating__top">{t('product.topRated')}</span>}
    </button>
  );
};

export default TitleRating;
