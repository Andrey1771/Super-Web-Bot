import { useTranslation } from "react-i18next";
import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "./newsletter-pages.css";
import { unsubscribeReviewInvites } from "../../api/reviewsApi";

type PageState = "working" | "success" | "error";

/**
 * Открывается по ссылке «Do not ask me for reviews» из письма-приглашения.
 *
 * Отдельная страница, а не общая с отпиской от рассылки: это разные вещи, и человек,
 * которому надоели просьбы об отзывах, не обязан заодно лишаться писем о скидках.
 * Вход в аккаунт не требуется — письмо уходит и гостю, а требовать логин, чтобы попросить
 * больше не писать, значит не дать отписаться.
 */
export default function ReviewInviteUnsubscribePage() {
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
        unsubscribeReviewInvites(token)
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
                        <p className="muted">{t("newsletter.reviewOffText")}</p>
                    </>
                )}
                {state === "success" && (
                    <>
                        <span className="newsletter-action-icon is-info" aria-hidden="true">👋</span>
                        <h1>{t("newsletter.reviewOff")}</h1>
                        <p className="muted">
                            {t("newsletter.reviewOffDone")}
                        </p>
                        <div className="newsletter-action-buttons">
                            <Link to="/account/orders" className="btn btn-primary">{t("newsletter.myOrders")}</Link>
                            <Link to="/" className="btn btn-outline">{t("common.backToHome")}</Link>
                        </div>
                    </>
                )}
                {state === "error" && (
                    <>
                        <span className="newsletter-action-icon is-error" aria-hidden="true">✕</span>
                        <h1>{t("newsletter.linkInvalid")}</h1>
                        <p className="muted">{t("newsletter.reviewLinkInvalid")}</p>
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
