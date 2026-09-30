import { useTranslation } from "react-i18next";
import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "./newsletter-pages.css";
import { unsubscribeNewsletter } from "../../api/newsletterApi";
import { forgetNewsletterSubscription } from "../../hooks/use-newsletter-subscribed";

type PageState = "working" | "success" | "error";

// Открывается по ссылке «Unsubscribe» из футера любого письма рассылки.
export default function NewsletterUnsubscribePage() {
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
        unsubscribeNewsletter(token)
            .then(() => {
                // Отписался — формы подписки на сайте снова доступны.
                forgetNewsletterSubscription();
                setState("success");
            })
            .catch(() => setState("error"));
    }, [token]);

    return (
        <div className="newsletter-action-page">
            <div className="newsletter-action-card">
                <i className="fx-texture is-light" aria-hidden="true"></i>
                {state === "working" && (
                    <>
                        <div className="newsletter-action-spinner" aria-hidden="true" />
                        <h1>{t("newsletter.unsubscribing")}</h1>
                        <p className="muted">{t("newsletter.unsubscribingText")}</p>
                    </>
                )}
                {state === "success" && (
                    <>
                        <span className="newsletter-action-icon is-info" aria-hidden="true">👋</span>
                        <h1>{t("newsletter.unsubscribed")}</h1>
                        <p className="muted">
                            {t("newsletter.unsubscribedText")}
                        </p>
                        <div className="newsletter-action-buttons">
                            <Link to="/deals" className="btn btn-primary">{t("newsletter.resubscribe")}</Link>
                            <Link to="/account/settings" className="btn btn-outline">{t("newsletter.accountSettings")}</Link>
                        </div>
                    </>
                )}
                {state === "error" && (
                    <>
                        <span className="newsletter-action-icon is-error" aria-hidden="true">✕</span>
                        <h1>{t("newsletter.linkInvalid")}</h1>
                        <p className="muted">{t("newsletter.linkInvalidText")}</p>
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
