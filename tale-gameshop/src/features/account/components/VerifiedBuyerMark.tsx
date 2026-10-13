import React from "react";
import { useTranslation } from "react-i18next";

/**
 * «Verified buyer» — галочка в строке имени (с подписью — там, где есть место).
 * Признак приходит позже профиля (по заказам), поэтому он не должен добавлять строку и сдвигать карточку.
 */
const VerifiedBuyerMark: React.FC<{ withLabel?: boolean }> = ({ withLabel = false }) => {
  const { t } = useTranslation();
  const label = t("account.verifiedBuyer");
  return (
    <span className={`verified-buyer${withLabel ? " verified-buyer--label" : ""}`} title={label} role="img" aria-label={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 1.8 14.6 3.6l3.1-.2 1 3 2.6 1.7-.8 3 .8 3-2.6 1.7-1 3-3.1-.2L12 22.2l-2.6-1.8-3.1.2-1-3-2.6-1.7.8-3-.8-3 2.6-1.7 1-3 3.1.2z"
        />
        <path d="m8 12.2 2.7 2.7L16.2 9.4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {withLabel && <span aria-hidden="true">{label}</span>}
    </span>
  );
};

export default VerifiedBuyerMark;
