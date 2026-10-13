import { useTranslation } from "react-i18next";
import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "./newsletter-pages.css";
import { confirmNewsletter } from "../../api/newsletterApi";
import { rememberNewsletterSubscription } from "../../hooks/use-newsletter-subscribed";

type PageState = "working" | "success" | "error";

// Открывается по ссылке из письма «Confirm your Tale Shop subscription».
export default function NewsletterConfirmPage() {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token") ?? "";
    const [state, setState] = useState<PageState>("working");
    const requested = useRef(false);

    useEffect(() => {
        if (requested.current) {
            return; // StrictMode/повторный маунт — не дёргаем API дважды
        }
        requested.current = true;

        if (!token) {
            setState("error");
            return;
        }
        confirmNewsletter(token)
            .then(() => {
                // Подписка подтверждена — формы на сайте больше её не предлагают.
                rememberNewsletterSubscription("confirmed");
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
                        <h1>{t("newsletter.confirming")}</h1>
                        <p className="muted">{t("newsletter.confirmingText")}</p>
                    </>
                )}
                {state === "success" && (
                    <>
                        <span className="newsletter-action-icon is-success" aria-hidden="true">✓</span>
                        <h1>{t("newsletter.confirmed")}</h1>
                        <p className="muted">
                            {t("newsletter.confirmedText")}
                        </p>
                        <div className="newsletter-action-buttons">
                            <Link to="/deals" className="btn btn-primary">{t("newsletter.browseDeals")}</Link>
                            <Link to="/" className="btn btn-outline">{t("common.backToHome")}</Link>
                        </div>
                    </>
                )}
                {state === "error" && (
                    <>
                        <span className="newsletter-action-icon is-error" aria-hidden="true">✕</span>
                        <h1>{t("newsletter.linkUsed")}</h1>
                        <p className="muted">
                            {t("newsletter.linkUsedText")}
                        </p>
                        <div className="newsletter-action-buttons">
                            <Link to="/deals" className="btn btn-primary">{t("newsletter.subscribeOnDeals")}</Link>
                            <Link to="/" className="btn btn-outline">{t("common.backToHome")}</Link>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
