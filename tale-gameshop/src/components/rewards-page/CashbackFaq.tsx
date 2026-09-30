import { Trans, useTranslation } from "react-i18next";
import React, { useId, useState } from "react";
import { useCashbackProgram, type CashbackProgram } from "../../hooks/use-cashback-program";
import { percentRange } from "../../utils/cashback";
import "./cashback-faq.css";

/**
 * Вопросы о кэшбэке.
 *
 * Список карточек в одну колонку, раскрыт один вопрос за раз. Две колонки раскрывашек
 * ломали сетку (раскрытый вопрос растягивал соседнюю ячейку пустотой), а открытые
 * карточки-правила выглядели как типовой блок «преимущества». Номера 01…06 вместо иконок —
 * порядок без лишнего шума. Первый вопрос раскрыт сразу, чтобы было видно, что внутри.
 *
 * Строки «Didn't find your answer? Ask support / Full cashback terms» под списком нет: чат
 * поддержки открывает плавающая кнопка, а условия лежат в подвале прямо под этим блоком.
 *
 * Тексты — в словаре (help.cashbackFaq.*), жирное — через <b> в строке и Trans.
 */

type Item = { key: string; a: React.ReactNode };

const bold = { b: <strong /> };

/** Цифры в ответах — из условий программы: их меняет админка, и FAQ не должен обещать старые. */
const buildItems = (program: CashbackProgram): Item[] => {
    const range = percentRange(program.tiers);
    return [
        { key: "discount", a: <Trans i18nKey="help.cashbackFaq.discount.a" components={bold} /> },
        {
            key: "howMuch",
            a: range.min === range.max
                ? <Trans i18nKey="help.cashbackFaq.howMuch.aSingle" values={{ percent: range.min }} components={bold} />
                : <Trans i18nKey="help.cashbackFaq.howMuch.aRange" values={{ min: range.min, max: range.max, start: program.tiers[0].percent }} components={bold} />,
        },
        { key: "whenSpend", a: <Trans i18nKey="help.cashbackFaq.whenSpend.a" values={{ count: program.pendingDays }} components={bold} /> },
        { key: "returns", a: <Trans i18nKey="help.cashbackFaq.returns.a" components={bold} /> },
        {
            key: "expires",
            a: program.expiryMonths > 0
                ? <Trans i18nKey="help.cashbackFaq.expires.aMonths" values={{ count: program.expiryMonths }} components={bold} />
                : <Trans i18nKey="help.cashbackFaq.expires.aNever" components={bold} />,
        },
        { key: "level", a: <Trans i18nKey="help.cashbackFaq.level.a" components={bold} /> },
    ];
};

const CashbackFaq: React.FC = () => {
    const { t } = useTranslation();
    const [open, setOpen] = useState<number | null>(0);
    const baseId = useId();
    const items = buildItems(useCashbackProgram());

    return (
        <section className="cfaq" aria-labelledby={`${baseId}-title`}>
            <div className="cfaq-inner">
                <span className="cfaq-label">{t("rewards.faq.label")}</span>
                <h2 id={`${baseId}-title`}>{t("rewards.faq.title")}</h2>
                <p className="cfaq-sub">{t("rewards.faq.text")}</p>

                <ol className="cfaq-list">
                    {items.map((item, index) => {
                        const isOpen = open === index;
                        const panelId = `${baseId}-answer-${index}`;
                        return (
                            <li key={item.key} className={`cfaq-item${isOpen ? " is-open" : ""}`}>
                                <button
                                    type="button"
                                    className="cfaq-question"
                                    aria-expanded={isOpen}
                                    aria-controls={panelId}
                                    onClick={() => setOpen(isOpen ? null : index)}
                                >
                                    <span className="cfaq-num" aria-hidden="true">
                                        {String(index + 1).padStart(2, "0")}
                                    </span>
                                    <span className="cfaq-q">{t(`help.cashbackFaq.${item.key}.q`)}</span>
                                    <span className="cfaq-chevron" aria-hidden="true" />
                                </button>
                                <div id={panelId} className="cfaq-answer" hidden={!isOpen}>
                                    <p>{item.a}</p>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            </div>
        </section>
    );
};

export default CashbackFaq;
