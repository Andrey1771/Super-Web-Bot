import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "./newsletter-pages.css";
import { confirmNewsletter } from "../../api/newsletterApi";
import { rememberNewsletterSubscription } from "../../hooks/use-newsletter-subscribed";

type PageState = "working" | "success" | "error";

// Открывается по ссылке из письма «Confirm your Tale Shop subscription».
export default function NewsletterConfirmPage() {
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
                        <h1>Confirming…</h1>
                        <p className="muted">One moment — we&rsquo;re confirming your subscription.</p>
                    </>
                )}
                {state === "success" && (
                    <>
                        <span className="newsletter-action-icon is-success" aria-hidden="true">✓</span>
                        <h1>Subscription confirmed</h1>
                        <p className="muted">
                            You&rsquo;re on the list. We&rsquo;ll email you when fresh deals go live — and you can
                            unsubscribe with one click from any email.
                        </p>
                        <div className="newsletter-action-buttons">
                            <Link to="/deals" className="btn btn-primary">Browse deals</Link>
                            <Link to="/" className="btn btn-outline">Back to home</Link>
                        </div>
                    </>
                )}
                {state === "error" && (
                    <>
                        <span className="newsletter-action-icon is-error" aria-hidden="true">✕</span>
                        <h1>Link invalid or already used</h1>
                        <p className="muted">
                            This confirmation link doesn&rsquo;t work anymore. If you already confirmed — you&rsquo;re
                            all set. Otherwise, subscribe again to get a fresh link.
                        </p>
                        <div className="newsletter-action-buttons">
                            <Link to="/deals" className="btn btn-primary">Subscribe on Deals</Link>
                            <Link to="/" className="btn btn-outline">Back to home</Link>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
