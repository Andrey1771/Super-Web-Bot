import React from 'react';

/**
 * Иконки медиа-галереи и просмотрщика — одним набором, чтобы стрелки, play и режимы просмотра
 * выглядели одинаково в галерее, в просмотрщике и в плеере. Все SVG, а не символы: у текстовых
 * глифов своя посадка в строке, и в круге они вставали не по центру.
 */

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
};

export const PlayGlyph = ({ size = 22 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
    <path d="M8 5v14l11-7z" fill="currentColor" />
  </svg>
);

export const Chevron = ({ direction, size = 22 }: { direction: 'left' | 'right'; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
    <path d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} {...stroke} />
  </svg>
);

/** «Театр»: кадр поверх страницы. Экран с подставкой. */
export const TheaterGlyph = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
    <rect x="3" y="6" width="18" height="12" rx="2" {...stroke} strokeWidth={2} />
    <path d="M8 21h8" {...stroke} strokeWidth={2} />
  </svg>
);

/** Выход из театра: тот же экран, но с окном внутри — «вернуть на страницу». */
export const TheaterExitGlyph = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
    <rect x="3" y="5" width="18" height="14" rx="2" {...stroke} strokeWidth={2} />
    <rect x="9" y="10" width="8" height="5" rx="1" fill="currentColor" />
  </svg>
);

export const FullscreenGlyph = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" {...stroke} />
  </svg>
);

export const CompressGlyph = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
    <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" {...stroke} />
  </svg>
);

export const CloseGlyph = ({ size = 22 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
    <path d="M6 6l12 12M18 6L6 18" {...stroke} />
  </svg>
);
