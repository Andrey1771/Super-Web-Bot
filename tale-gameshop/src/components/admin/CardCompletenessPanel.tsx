import React from "react";
import type { CardIssue } from "../../api/adminCompletenessApi";

const ORDER: Record<string, number> = { error: 0, warning: 1, info: 2 };
const LABEL: Record<string, string> = { error: "Missing", warning: "Worth adding", info: "Nice to have" };

/**
 * Панель «чего не хватает в карточке». На витрине пустые блоки просто не показываются, поэтому
 * неполная карточка снаружи выглядит «нормально» — единственное место, где пробелы видны, здесь.
 */
const CardCompletenessPanel: React.FC<{
  issues: CardIssue[];
  compact?: boolean;
  /** Заголовок панели. Внутри секции «Incomplete card» звучало бы про всю карточку, а речь о ней одной. */
  heading?: string;
  /** Переход к секции, где закрывается пробел. Без него замечания остаются просто текстом. */
  onIssueClick?: (code: string) => void;
  /** Ведёт ли замечание куда-нибудь. Для части проверок поля в форме нет, и ссылка была бы мёртвой. */
  canJump?: (code: string) => boolean;
}> = ({ issues, compact, heading, onIssueClick, canJump }) => {
  if (issues.length === 0) {
    return compact ? null : (
      <div className="card-completeness card-completeness--ok">
        <strong>Card is complete</strong> — every storefront block has data.
      </div>
    );
  }
  const sorted = [...issues].sort((a, b) => (ORDER[a.severity] ?? 9) - (ORDER[b.severity] ?? 9));
  const errors = issues.filter((i) => i.severity === "error").length;
  return (
    <div className={`card-completeness${errors > 0 ? " card-completeness--errors" : ""}`}>
      <div className="card-completeness__head">
        <strong>{heading ?? (errors > 0 ? `${errors} missing` : "Incomplete card")}</strong>
        <span className="card-completeness__count">{issues.length} {issues.length === 1 ? "gap" : "gaps"}</span>
      </div>
      <ul className="card-completeness__list">
        {sorted.map((issue) => (
          <li key={issue.code} className={`card-completeness__item card-completeness__item--${issue.severity}`}>
            <span className="card-completeness__pill">{LABEL[issue.severity] ?? issue.severity}</span>
            {/* Замечание кликабельно, когда редактор передал обработчик: панель называла пробел,
                но не показывала, где его закрыть, и нужную секцию приходилось искать среди
                десяти свёрнутых карточек вручную. */}
            {onIssueClick && (canJump ? canJump(issue.code) : true) ? (
              <button type="button" className="card-completeness__jump" onClick={() => onIssueClick(issue.code)}>
                {issue.message}
              </button>
            ) : (
              <span>{issue.message}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CardCompletenessPanel;
