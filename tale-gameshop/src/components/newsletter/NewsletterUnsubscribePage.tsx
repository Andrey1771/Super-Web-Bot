import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "./newsletter-pages.css";
import { unsubscribeNewsletter } from "../../api/newsletterApi";
import { forgetNewsletterSubscription } from "../../hooks/use-newsletter-subscribed";

type PageState = "working" | "success" | "error";

// Открывается по ссылке «Unsubscribe» из футера любого письма рассылки.
export default function NewsletterUnsubscribePage() {
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
                        <h1>Unsubscribing…</h1>
                        <p className="muted">One moment — removing you from the list.</p>
                    </>
                )}
                {state === "success" && (
                    <>
                        <span className="newsletter-action-icon is-info" aria-hidden="true">👋</span>
                        <h1>You&rsquo;re unsubscribed</h1>
                        <p className="muted">
                            No more emails from us. Changed your mind? You can re-subscribe on the Deals page any
                            time — or manage it in your account settings if you have one.
                        </p>
                        <div className="newsletter-action-buttons">
                            <Link to="/deals" className="btn btn-primary">Re-subscribe on Deals</Link>
                            <Link to="/account/settings" className="btn btn-outline">Account settings</Link>
                        </div>
                    </>
                )}
                {state === "error" && (
                    <>
                        <span className="newsletter-action-icon is-error" aria-hidden="true">✕</span>
                        <h1>Link invalid</h1>
                        <p className="muted">
                            This unsubscribe link doesn&rsquo;t look right. If you keep receiving emails, contact
                            support and we&rsquo;ll remove you manually.
                        </p>
                        <div className="newsletter-action-buttons">
                            <Link to="/support" className="btn btn-primary">Contact support</Link>
                            <Link to="/" className="btn btn-outline">Back to home</Link>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
