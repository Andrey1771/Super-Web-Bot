import React from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';

export const formatDuration = (durationSec?: number) => {
  if (!durationSec) return '';
  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const ratingLabelFor = (avg: number, count: number) => {
  if (count === 0) return i18n.t('product.rating.none');
  if (avg >= 4.5) return i18n.t('product.rating.veryPositive');
  if (avg >= 4) return i18n.t('product.rating.positive');
  if (avg >= 3) return i18n.t('product.rating.mixed');
  return i18n.t('product.rating.negative');
};

export type RatingSummaryView = { average: number; totalReviews: number; label: string };

export const StarRating = ({ rating, size = 16 }: { rating: number; size?: number }) => {
  const { t } = useTranslation();
  const fullStars = Math.floor(rating);
  const halfStar = rating - fullStars >= 0.5;

  return (
    <div className="star-rating" aria-label={t('product.ratingAria', { rating })}>
      {Array.from({ length: 5 }).map((_, index) => {
        const isFull = index < fullStars;
        const isHalf = index === fullStars && halfStar;
        return (
          <svg
            key={`star-${index}`}
            width={size}
            height={size}
            viewBox="0 0 20 20"
            className={['star', isFull ? 'is-full' : '', isHalf ? 'is-half' : ''].filter(Boolean).join(' ')}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={`half-${index}`} x1="0" x2="1">
                <stop offset="50%" stopColor="currentColor" />
                {/* Вторая половина — цвет пустой звезды, а не прозрачность: иначе половинка выглядела бы обрезанной. */}
                <stop offset="50%" stopColor="var(--star-empty)" />
              </linearGradient>
            </defs>
            <path
              d="m10 15-5.878 3.09 1.122-6.545L.488 6.91 6.06 6.1 10 0l3.94 6.1 5.572.81-4.756 4.635 1.122 6.545L10 15Z"
              fill={isHalf ? `url(#half-${index})` : 'currentColor'}
            />
          </svg>
        );
      })}
    </div>
  );
};


/** Тип ключа приходит числом (enum GameKeyType) или строкой — подпись для покупателя. */
export const keyTypeLabel = (keyType: number | string | undefined) => {
  const map: Record<string, string> = {
    0: 'Steam',
    1: 'Epic Games Store',
    2: 'EA App',
    3: 'Ubisoft Connect',
    4: i18n.t('product.otherPlatform'),
    SteamKey: 'Steam',
    Epic: 'Epic Games Store',
    EaApp: 'EA App',
    Uplay: 'Ubisoft Connect',
    Other: i18n.t('product.otherPlatform')
  };
  return map[String(keyType ?? 0)] ?? 'Steam';
};

/** Поддержка контроллера: enum числом (0 None, 1 Partial, 2 Full) или строкой. */
export const controllerSupportLabel = (value: number | string | undefined) => {
  const none = i18n.t('product.controllerSupport.none');
  const partial = i18n.t('product.controllerSupport.partial');
  const full = i18n.t('product.controllerSupport.full');
  const map: Record<string, string> = { 0: none, 1: partial, 2: full, None: none, Partial: partial, Full: full };
  return map[String(value ?? 2)] ?? full;
};
