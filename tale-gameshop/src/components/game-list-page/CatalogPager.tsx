import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Насколько прокрутить вниз, чтобы панель уехала (меньше — дрожание пальца, а не прокрутка). */
const SCROLL_DELTA = 6;
/** Возврат после остановки прокрутки: остановился — значит, смотрит и, может быть, листнёт. */
const IDLE_SHOW_MS = 700;
/** У самого верха страницы панель не прячем: там она никому не мешает. */
const TOP_ZONE = 200;

/**
 * Прячется при прокрутке вниз, возвращается при прокрутке вверх или остановке.
 * Пока поле номера в фокусе, не прячется: человек вводит страницу.
 */
const useHideOnScrollDown = (pinned: boolean) => {
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        if (pinned) {
            setHidden(false);
            return;
        }
        let lastY = window.scrollY;
        let idle: number | undefined;
        const onScroll = () => {
            const y = window.scrollY;
            if (y > lastY + SCROLL_DELTA && y > TOP_ZONE) {
                setHidden(true);
            } else if (y < lastY - SCROLL_DELTA) {
                setHidden(false);
            }
            lastY = y;
            window.clearTimeout(idle);
            idle = window.setTimeout(() => setHidden(false), IDLE_SHOW_MS);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            window.removeEventListener('scroll', onScroll);
            window.clearTimeout(idle);
        };
    }, [pinned]);

    return hidden;
};

/**
 * Листание каталога: «‹ Страница [9] из 24 ›» — узкая плашка у нижнего края экрана, одинаковая
 * при любом числе страниц. Номер вписывается в поле: Enter или уход из поля — переход
 * (вне диапазона — к ближайшей существующей странице), Escape — вернуть текущий.
 */
const CatalogPager = ({
    page,
    totalPages,
    onChange,
}: {
    page: number;
    totalPages: number;
    onChange: (page: number) => void;
}) => {
    const { t } = useTranslation();
    const [draft, setDraft] = useState(String(page));
    const [focused, setFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    // Enter и Escape уже решили, что делать с вводом: следующий уход из поля ничего не меняет
    // (иначе Enter переходил бы дважды, а Escape не отменял бы набранное).
    const settledRef = useRef(false);
    const hidden = useHideOnScrollDown(focused);

    useEffect(() => {
        setDraft(String(page));
    }, [page]);

    if (totalPages <= 1) return null;

    const commit = () => {
        const value = Number.parseInt(draft, 10);
        if (!Number.isFinite(value)) {
            setDraft(String(page));
            return;
        }
        const next = Math.min(totalPages, Math.max(1, value));
        setDraft(String(next));
        if (next !== page) onChange(next);
    };

    return (
        <nav className={`catalog-pager${hidden ? ' is-hidden' : ''}`} aria-label={t('catalog.pages')}>
            <button
                type="button"
                className="catalog-pager__arrow"
                aria-label={t('common.previousPage')}
                disabled={page <= 1}
                onClick={() => onChange(page - 1)}
            >
                <Chevron direction="left" />
            </button>
            <label className="catalog-pager__field">
                <span className="catalog-pager__word">{t('catalog.pageWord')}</span>
                <input
                    ref={inputRef}
                    className="catalog-pager__input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label={t('catalog.pageNumber')}
                    value={draft}
                    size={Math.max(2, String(totalPages).length)}
                    onChange={(event) => setDraft(event.target.value.replace(/\D/g, ''))}
                    onFocus={(event) => {
                        settledRef.current = false;
                        setFocused(true);
                        event.currentTarget.select();
                    }}
                    onBlur={() => {
                        setFocused(false);
                        if (settledRef.current) {
                            settledRef.current = false;
                            return;
                        }
                        commit();
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            commit();
                            settledRef.current = true;
                            inputRef.current?.blur();
                        } else if (event.key === 'Escape') {
                            setDraft(String(page));
                            settledRef.current = true;
                            inputRef.current?.blur();
                        }
                    }}
                />
                <span className="catalog-pager__total">{t('catalog.ofPages', { total: totalPages })}</span>
            </label>
            <button
                type="button"
                className="catalog-pager__arrow"
                aria-label={t('common.nextPage')}
                disabled={page >= totalPages}
                onClick={() => onChange(page + 1)}
            >
                <Chevron direction="right" />
            </button>
        </nav>
    );
};

const Chevron = ({ direction }: { direction: 'left' | 'right' }) => (
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

export default CatalogPager;
