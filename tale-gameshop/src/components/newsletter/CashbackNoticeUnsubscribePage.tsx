import { useTranslation } from "react-i18next";
import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "./newsletter-pages.css";
import { unsubscribeCashbackNotices } from "../../api/cashbackApi";

type PageState = "working" | "success" | "error";

/**
 * Открывается по ссылке «Stop cashback emails» из письма о доступном или сгорающем кэшбэке.
 *
 * Отдельная от рассылки: человек, которому не нужны напоминания о балансе, не обязан лишаться писем о скидках,
 * и наоборот. Вход не требуется — отписка должна быть проще, чем терпеть.
 */
export default function CashbackNoticeUnsubscribePage() {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token") ?? "";
    const [state, setState] = useState<PageState>("working");
    const requested = useRef(false);

    useEffect(() => {
        if (requested.current) {
            return;
        }
        requested.current = true;

        if (!token) {
            setState("error");
            return;
        }
        unsubscribeCashbackNotices(token)
            .then(() => setState("success"))
            .catch(() => setState("error"));
    }, [token]);

    return (
        <div className="newsletter-action-page">
            <div className="newsletter-action-card">
                <i className="fx-texture is-light" aria-hidden="true"></i>
                {state === "working" && (
                    <>
                        <div className="newsletter-action-spinner" aria-hidden="true" />
                        <h1>{t("newsletter.oneMoment")}</h1>
                        <p className="muted">{t("newsletter.cashbackOffText")}</p>
                    </>
                )}
                {state === "success" && (
                    <>
                        <span className="newsletter-action-icon is-info" aria-hidden="true">👋</span>
                        <h1>{t("newsletter.cashbackOff")}</h1>
                        <p className="muted">
                            {t("newsletter.cashbackOffDone")}
                        </p>
                        <div className="newsletter-action-buttons">
                            <Link to="/account/rewards" className="btn btn-primary">{t("newsletter.myCashback")}</Link>
                            <Link to="/" className="btn btn-outline">{t("common.backToHome")}</Link>
                        </div>
                    </>
                )}
                {state === "error" && (
                    <>
                        <span className="newsletter-action-icon is-error" aria-hidden="true">✕</span>
                        <h1>{t("newsletter.linkInvalid")}</h1>
                        <p className="muted">{t("newsletter.cashbackLinkInvalid")}</p>
                        <div className="newsletter-action-buttons">
                            <Link to="/support" className="btn btn-primary">{t("common.contactSupport")}</Link>
                            <Link to="/" className="btn btn-outline">{t("common.backToHome")}</Link>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
