import { useTranslation } from "react-i18next";
import React, { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo, faCircleCheck, faTriangleExclamation, faGlobe } from "@fortawesome/free-solid-svg-icons";
import type { CartItemRegion } from "../../../api/regionApi";
import { regionBadgeText, regionExclusionsText, regionTitleText } from "../../../utils/region-text";

/**
 * Что именно покупает человек: где активируется ключ, на какой площадке и когда придёт.
 *
 * Раньше эти сведения были разбросаны — регион строкой под названием, «Instant delivery»
 * рекламной плашкой, площадка не показывалась вовсе, — а у ключей она разная: партия может быть
 * и Steam, и Epic Games. Здесь всё собрано в одном месте, и каждая строка приходит из данных:
 * ничего не выводится «по умолчанию», строка без данных просто не показывается.
 */
type Props = {
  /** Регион и наличие с сервера. undefined — ещё не загрузили. */
  region?: CartItemRegion | null;
  /** Издание из позиции корзины — то, что покупатель выбрал. */
  edition?: string | null;
  /** Выбранный региональный вариант ключа. */
  offer?: string | null;
  /** Срок возврата магазина — тот же, что обещан на этой же странице. */
  refundDays: number;
};

const KeyDetailsPopover: React.FC<Props> = ({ region, edition, offer, refundDays }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const platforms = region?.platforms ?? [];
  const rows: Array<{ label: string; value: string }> = [];

  if (platforms.length > 0) {
    rows.push({ label: t('cart.rowActivatesOn'), value: platforms.join(", ") });
  }
  if (edition) {
    rows.push({ label: t('cart.rowEdition'), value: edition });
  }
  // Область активации: подпись выбранного варианта важнее общей — покупатель выбрал именно её.
  const keyRegion = offer ? regionTitleText(offer) : region?.badge ? regionBadgeText(region) : region?.known ? t('cart.global') : null;
  if (keyRegion) {
    rows.push({ label: t('cart.rowKeyRegion'), value: keyRegion });
  }
  if (region?.inStock === true) {
    rows.push({ label: t('cart.rowDelivery'), value: t('cart.deliveryInstant') });
  } else if (region?.inStock === false) {
    // Врать «мгновенно» на пустом складе нельзя: заказ будет ждать пополнения.
    rows.push({ label: t('cart.rowDelivery'), value: t('cart.deliveryRestock') });
  }
  rows.push({ label: t('cart.rowRefunds'), value: t('cart.refundsWithin', { days: refundDays }) });

  // Заголовок — про страну покупателя. Страна неизвестна — не утверждаем ни «можно», ни «нельзя».
  const verdict = region?.allowed;
  const heading = verdict === true
    ? t('cart.canActivate')
    : verdict === false
      ? t('cart.cannotActivate')
      : t('cart.checkRegion');

  return (
    <div
      className="key-details"
      ref={boxRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={`key-details-trigger${verdict === false ? " is-blocked" : ""}`}
        aria-expanded={open}
        aria-label={t('cart.keyDetails')}
        onClick={() => setOpen((previous) => !previous)}
        onFocus={() => setOpen(true)}
      >
        <FontAwesomeIcon icon={verdict === false ? faTriangleExclamation : faCircleInfo} />
        {t('cart.keyDetails')}
      </button>

      {open && (
        <div className="key-details-panel" role="dialog" aria-label={t('cart.keyDetails')}>
          <div className={`key-details-head${verdict === false ? " is-blocked" : ""}`}>
            <span className="key-details-head-icon">
              <FontAwesomeIcon icon={verdict === true ? faCircleCheck : verdict === false ? faTriangleExclamation : faGlobe} />
            </span>
            <span>{heading}</span>
          </div>
          <dl className="key-details-rows">
            {rows.map((row) => (
              <div key={row.label} className="key-details-row">
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          {region && regionExclusionsText(region) && <p className="key-details-note">{regionExclusionsText(region)}</p>}
        </div>
      )}
    </div>
  );
};

export default KeyDetailsPopover;
