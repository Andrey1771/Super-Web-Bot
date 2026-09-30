import React from 'react';
import { useTranslation } from 'react-i18next';
import { buildPageRange } from '../../utils/page-range';
import './pagination.css';

const ChevronGlyph = ({ direction }: { direction: 'left' | 'right' }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
    <path
      d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Нумерованные страницы «‹ 1 2 3 … 12 ›», как у Amazon и Metacritic. Рисуется только при двух
 * и более страницах; во время загрузки кнопки выключены, чтобы не набрать очередь запросов.
 */
const Pagination = ({
  page,
  totalPages,
  onChange,
  disabled = false,
  label,
  note
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  disabled?: boolean;
  /** Подпись навигации для скринридеров: «Review pages», «Order pages»… */
  label?: string;
  /** Тихая строка рядом: «Showing 11–20 of 23». */
  note?: string;
}) => {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;
  const items = buildPageRange(page, totalPages);

  return (
    <nav className="pagination" aria-label={label ?? t('common.pages')}>
      {note && <span className="pagination__note">{note}</span>}
      <div className="pagination__controls">
        <button
          type="button"
          className="pagination__btn"
          aria-label={t('common.previousPage')}
          disabled={disabled || page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronGlyph direction="left" />
        </button>
        {items.map((item, index) =>
          item === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="pagination__ellipsis" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={`pagination__btn${item === page ? ' is-active' : ''}`}
              aria-current={item === page ? 'page' : undefined}
              aria-label={t('common.pageN', { page: item })}
              disabled={disabled}
              onClick={() => onChange(item)}
            >
              {item}
            </button>
          )
        )}
        <button
          type="button"
          className="pagination__btn"
          aria-label={t('common.nextPage')}
          disabled={disabled || page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronGlyph direction="right" />
        </button>
      </div>
    </nav>
  );
};

export default Pagination;
