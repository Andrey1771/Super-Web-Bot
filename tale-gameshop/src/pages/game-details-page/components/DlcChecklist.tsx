import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { DLC, DlcProduct } from '../../../types/game-details';
import { useCart } from '../../../context/cart-context';
import { cartLineKey } from '../../../reducers/cart-reducer';
import Cover from '../../../components/common/Cover';
import { useSitePreferences } from '../../../context/site-preferences';
import { formatMoney } from '../../../utils/format-money';
import { formatReleaseDate } from '../../../utils/format-release-date';

/** Сколько строк видно сразу: дальше — «Показать все N», чтобы у игры с 40 DLC список не занял страницу. */
export const DLC_VISIBLE_ROWS = 6;

type RowState = 'selectable' | 'inCart' | 'owned' | 'soon' | 'noPrice' | 'outOfStock' | 'notSold';

type Row = {
  id: string;
  slug?: string;
  title: string;
  coverUrl?: string;
  releaseDate?: string;
  price?: number;
  oldPrice?: number | null;
  discountPercent?: number | null;
  currency?: string;
  state: RowState;
};

const toRow = (dlc: DlcProduct, inCart: boolean): Row => ({
  id: dlc.id,
  slug: dlc.slug,
  title: dlc.title,
  coverUrl: dlc.coverUrl,
  releaseDate: dlc.releaseDate,
  price: dlc.pricing?.price,
  oldPrice: dlc.pricing?.oldPrice,
  discountPercent: dlc.pricing?.discountPercent,
  currency: dlc.pricing?.currency,
  // Порядок важен: купленное — «уже есть», даже если лежит в корзине повторно; невышедшее — «скоро», даже без цены.
  state: dlc.owned
    ? 'owned'
    : inCart
      ? 'inCart'
      : dlc.isComingSoon
        ? 'soon'
        : !dlc.pricing
          ? 'noPrice'
          : dlc.inStock === false
            ? 'outOfStock'
            : 'selectable'
});

/**
 * DLC базовой игры списком с галочками, как «Content for this game» в Steam: отмечаешь нужные —
 * внизу сумма и «Добавить выбранные». Каждое DLC — отдельный товар со своей страницей (ссылка в названии).
 * Выбрать нельзя то, что уже куплено, уже в корзине, ещё не вышло или кончилось: такие строки приглушены,
 * а вместо галочки — причина. Старый список GameDetails.DlcItems (без товара за ним) — только как запасной вариант.
 */
const DlcChecklist = ({ products, legacy }: { products: DlcProduct[]; legacy: DLC[] }) => {
  const { t } = useTranslation();
  const { currency: siteCurrency } = useSitePreferences();
  const { state: cartState, dispatch } = useCart();
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [expanded, setExpanded] = useState(false);
  const coverRefs = useRef(new Map<string, HTMLElement>());

  const inCart = new Set(cartState.items.map(cartLineKey));
  const rows: Row[] =
    products.length > 0
      ? products.map((dlc) => toRow(dlc, inCart.has(dlc.id)))
      : legacy.map((dlc) => ({ id: dlc.id, title: dlc.title, coverUrl: dlc.coverUrl, price: dlc.price, currency: siteCurrency, state: 'notSold' }));
  if (rows.length === 0) return null;

  const selectable = rows.filter((row) => row.state === 'selectable');
  // Выбор держится только за то, что всё ещё можно купить: DLC, положенное в корзину из другой вкладки, из суммы уходит.
  const chosen = selectable.filter((row) => selected.has(row.id));
  const total = Math.round(chosen.reduce((sum, row) => sum + (row.price ?? 0), 0) * 100) / 100;
  const currency = chosen[0]?.currency ?? siteCurrency;
  const allChosen = selectable.length > 0 && chosen.length === selectable.length;
  const visible = expanded ? rows : rows.slice(0, DLC_VISIBLE_ROWS);
  const hiddenCount = rows.length - visible.length;

  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addChosen = () => {
    for (const row of chosen) {
      dispatch({
        type: 'ADD_TO_CART',
        payload: { gameId: row.id, slug: row.slug, name: row.title, price: row.price!, quantity: 1, image: row.coverUrl ?? '' },
        // Каждая обложка летит в корзину из своей строки, а не все разом из кнопки внизу.
        meta: { origin: coverRefs.current.get(row.id) ?? null }
      });
    }
    setSelected(new Set());
  };

  const status = (row: Row): string | null => {
    switch (row.state) {
      case 'owned':
        return t('product.dlcOwned');
      case 'inCart':
        return t('common.inCart');
      case 'outOfStock':
        return t('common.outOfStock');
      case 'notSold':
        return t('product.notSoldSeparately');
      default:
        return null;
    }
  };

  return (
    <div className="card dlc-checklist" id="dlc">
      <div className="dlc-checklist__head">
        <h2>
          {t('product.dlc')} <span className="dlc-checklist__count">{rows.length}</span>
        </h2>
        {selectable.length > 1 && (
          <button
            type="button"
            className="dlc-checklist__select-all"
            onClick={() => setSelected(allChosen ? new Set() : new Set(selectable.map((row) => row.id)))}
          >
            {allChosen ? t('product.dlcClearSelection') : t('product.dlcSelectAll')}
          </button>
        )}
      </div>

      <ul className="dlc-checklist__list">
        {visible.map((row) => {
          const isSelectable = row.state === 'selectable';
          const checked = row.state === 'inCart' || (isSelectable && selected.has(row.id));
          const date = formatReleaseDate(row.releaseDate);
          const note = status(row);
          const title = row.slug ? (
            <Link to={`/games/${row.slug}`} className="dlc-row__title">
              {row.title}
            </Link>
          ) : (
            <span className="dlc-row__title">{row.title}</span>
          );
          return (
            <li key={row.id}>
              <label className={`dlc-row is-${row.state}${checked ? ' is-checked' : ''}`}>
                <input
                  type="checkbox"
                  className="dlc-row__input"
                  checked={checked}
                  disabled={!isSelectable}
                  onChange={() => toggle(row.id)}
                  aria-label={t('product.dlcSelect', { title: row.title })}
                />
                <span className="dlc-row__box" aria-hidden="true">
                  <svg viewBox="0 0 16 16" width="12" height="12" focusable="false">
                    <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span
                  className="dlc-row__cover"
                  ref={(node) => {
                    if (node) coverRefs.current.set(row.id, node);
                    else coverRefs.current.delete(row.id);
                  }}
                >
                  <Cover as="span" ratio="wide" sizes="(max-width: 640px) 88px, 128px" src={row.coverUrl} title={row.title} />
                </span>
                <span className="dlc-row__body">
                  {title}
                  {date && <span className="dlc-row__date">{date}</span>}
                </span>
                <span className="dlc-row__price">
                  {row.state === 'owned' ? null : row.state === 'soon' ? (
                    <span className="dlc-row__amount is-muted">{t('common.comingSoon')}</span>
                  ) : row.state === 'noPrice' || row.price == null ? (
                    <span className="dlc-row__amount is-muted">{t('product.notInCurrency', { currency: siteCurrency })}</span>
                  ) : (
                    <>
                      {row.discountPercent ? <span className="dlc-row__sale">−{row.discountPercent}%</span> : null}
                      <span className="dlc-row__amount">
                        {row.oldPrice != null && <s className="dlc-row__old">{formatMoney(row.oldPrice, row.currency ?? siteCurrency)}</s>}
                        {formatMoney(row.price, row.currency ?? siteCurrency)}
                      </span>
                    </>
                  )}
                  {note && <span className={`dlc-row__note is-${row.state}`}>{note}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {(hiddenCount > 0 || expanded) && rows.length > DLC_VISIBLE_ROWS && (
        <button type="button" className="dlc-checklist__more" onClick={() => setExpanded((value) => !value)}>
          {expanded ? t('common.showLess') : t('common.showAll', { count: rows.length })}
        </button>
      )}

      {selectable.length > 0 && (
        <div className="dlc-checklist__foot">
          <span className="dlc-checklist__sum" aria-live="polite">
            {chosen.length > 0 ? (
              <>
                {t('product.dlcSelected', { count: chosen.length })} · <b>{formatMoney(total, currency)}</b>
              </>
            ) : (
              t('product.dlcPickHint')
            )}
          </span>
          <button type="button" className="btn btn-primary dlc-checklist__add" disabled={chosen.length === 0} onClick={addChosen}>
            {t('product.dlcAddSelected')}
          </button>
        </div>
      )}
    </div>
  );
};

export default DlcChecklist;
