import { useTranslation } from "react-i18next";
import React from "react";
import { useSitePreferences, formatMoney } from "../../context/site-preferences";
import { cashbackForOrder, tierName } from "../../utils/cashback";
import { useCashbackProgram } from "../../hooks/use-cashback-program";
import { useReveal } from "./useReveal";
import "./cashback-where.css";

/**
 * «Где увидишь кэшбэк» — корзина, оплата, кабинет.
 *
 * Закрывает недостающую часть рассказа страницы: что это и как растёт — объяснено выше, а
 * где человек его встретит и как потратит — нет. Заодно светлая пауза между тёмным треком
 * и вопросами.
 *
 * ВАЖНО: мини-интерфейсы здесь — макет того, что должно появиться в корзине, на оплате и в
 * кабинете (следующий этап кэшбэка). До запуска эти места нужно сделать, иначе страница
 * обещает то, чего в магазине нет. Суммы — пример, но посчитаны теми же функциями.
 */

const CART_ORDER = 29.4;
const CHECKOUT_TOTAL = 49.99;
const BALANCE = 18.4;
const PENDING_ORDER = 41.2;

const CashbackWhere: React.FC = () => {
    const { t } = useTranslation();
    const { currency } = useSitePreferences();
    const [ref, shown] = useReveal<HTMLElement>(0.2);
    // Пример: корзина — стартовый уровень, кабинет — следующий за ним (если уровень один — он же).
    const { tiers } = useCashbackProgram();
    const rookie = tiers[0];
    const veteran = tiers[1] ?? tiers[0];
    const money = (value: number) => formatMoney(value, currency);

    return (
        <section className={`cwhere${shown ? " is-in" : ""}`} ref={ref} aria-labelledby="cwhere-title">
            <div className="container">
                <span className="cwhere-label">{t("rewards.where.label")}</span>
                <h2 id="cwhere-title">{t("rewards.where.title")}</h2>
                <p className="cwhere-sub">{t("rewards.where.text")}</p>

                <ol className="cwhere-cards">
                    <li className="cwhere-card" style={{ "--i": 0 } as React.CSSProperties}>
                        <div className="cwhere-step"><b>1</b><span>{t("rewards.where.inCart")}</span></div>
                        <div className="cwhere-ui" aria-hidden="true">
                            <div className="cwhere-line"><span>Sekiro: Shadows Die Twice</span><b>{money(CART_ORDER)}</b></div>
                            <div className="cwhere-line is-total"><span>{t("rewards.where.total")}</span><span>{money(CART_ORDER)}</span></div>
                            <div className="cwhere-cash">
                                <span className="cwhere-coin" />{t("rewards.where.comesBack", { amount: money(cashbackForOrder(CART_ORDER, rookie)) })}
                            </div>
                        </div>
                        <p>{t("rewards.where.cartText")}</p>
                    </li>

                    <li className="cwhere-card" style={{ "--i": 1 } as React.CSSProperties}>
                        <div className="cwhere-step"><b>2</b><span>{t("rewards.where.atCheckout")}</span></div>
                        <div className="cwhere-ui" aria-hidden="true">
                            <div className="cwhere-line"><span>{t("rewards.where.orderTotal")}</span><b>{money(CHECKOUT_TOTAL)}</b></div>
                            <div className="cwhere-toggle"><span>{t("rewards.where.payWith", { amount: money(BALANCE) })}</span><i /></div>
                            <div className="cwhere-line is-total"><span>{t("rewards.where.youPay")}</span><span>{money(CHECKOUT_TOTAL - BALANCE)}</span></div>
                        </div>
                        <p>{t("rewards.where.checkoutText")}</p>
                    </li>

                    <li className="cwhere-card" style={{ "--i": 2 } as React.CSSProperties}>
                        <div className="cwhere-step"><b>3</b><span>{t("rewards.where.inAccount")}</span></div>
                        <div className="cwhere-ui" aria-hidden="true">
                            <div className="cwhere-balance">
                                <div className="is-available"><small>{t("rewards.where.available")}</small><b>{money(BALANCE)}</b></div>
                                <div><small>{t("rewards.where.pending")}</small><b>{money(cashbackForOrder(PENDING_ORDER, veteran))}</b></div>
                            </div>
                            <div className="cwhere-line"><span>{t("rewards.where.level")}</span><b>{tierName(veteran)} · {veteran.percent}%</b></div>
                        </div>
                        <p>{t("rewards.where.accountText")}</p>
                    </li>
                </ol>
            </div>
        </section>
    );
};

export default CashbackWhere;
