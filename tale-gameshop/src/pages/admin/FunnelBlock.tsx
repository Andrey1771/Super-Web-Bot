import React from "react";
import type { FunnelReport } from "../../api/adminReportsApi";

/**
 * Воронка магазина: где между заходом и оплатой теряются люди.
 *
 * Считаются ЛЮДИ, а не события: десять просмотров одним посетителем — один человек на первом
 * шаге. Полоса рисуется от первого шага, поэтому видно не только числа, но и форму потерь.
 *
 * У последнего шага процентов нет намеренно. Первые три считаются по анонимному
 * идентификатору браузера, а покупатели — по заказам; делить одно на другое значит получать
 * проценты вроде 244%, которые выглядят точными и не значат ничего.
 */
const FunnelBlock: React.FC<{ report: FunnelReport }> = ({ report }) => {
  const top = report.steps[0]?.visitors ?? 0;

  return (
    <div className="admin-card">
      <div className="admin-card__body">
        <h3 style={{ margin: 0 }}>Funnel</h3>

        {!report.buyersLinkedToVisitors && (
          <p className="editor-pick__hint">
            The last step counts orders, not visitors — the two are not linked yet, so no
            conversion is shown for it. Everything above is counted per person.
          </p>
        )}

        <div className="funnel">
          {report.steps.map((step) => {
            const width = top === 0 ? 0 : Math.max(2, Math.round((step.visitors / top) * 100));
            const isLast = step.key === "purchase";
            return (
              <div className="funnel__row" key={step.key}>
                <div className="funnel__label">
                  {step.label}
                  {step.lostFromPrevious > 0 && (
                    <span className="funnel__lost"> −{step.lostFromPrevious} dropped</span>
                  )}
                </div>
                <div className="funnel__bar">
                  <div
                    className={`funnel__fill${isLast ? " funnel__fill--unlinked" : ""}`}
                    style={{ width: `${width}%` }}
                  />
                  <span className="funnel__value">{step.visitors}</span>
                </div>
                <div className="funnel__share">
                  {step.shareOfPreviousPercent === null ? (
                    <span className="report-table__gone">—</span>
                  ) : (
                    <>
                      {step.shareOfPreviousPercent}%{" "}
                      <span className="report-table__gone">of previous</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default FunnelBlock;
