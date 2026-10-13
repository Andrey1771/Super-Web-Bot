import { useTranslation } from "react-i18next";
import React, { useState } from "react";
import { subscribeNewsletter } from "../../api/newsletterApi";
import {
    rememberNewsletterSubscription,
    useKnownNewsletterSubscription,
} from "../../hooks/use-newsletter-subscribed";
import "./newsletter-signup.css";

/**
 * Форма подписки — одна на все места, где её предлагают.
 *
 * Раньше та же форма была написана заново на главной, на витрине скидок и в её пустом
 * состоянии: три копии одного поведения, и каждая правка (подтверждение, «уже подписан»,
 * ошибка сети) требовала трёх одинаковых правок. Здесь оно одно, а места отличаются только
 * подписью, темой и меткой источника — по ней админка видит, откуда пришли подписчики.
 */
export interface NewsletterSignupProps {
    /** Метка источника для статистики: "footer", "deals", "homepage". */
    source: string;
    /** Тёмный фон (подвал, шапка витрины) или светлый. */
    variant?: "light" | "dark";
    buttonLabel?: string;
    placeholder?: string;
    /** Подпись поля для тех, кто не видит форму глазами. */
    ariaLabel?: string;
    /**
     * Слать ли письма о новых скидках. Формы, которые не спрашивают, подписывают на них:
     * человек, заполняющий форму на витрине скидок, ровно за этим и пришёл.
     */
    dealAlerts?: boolean;
}

const NewsletterSignup: React.FC<NewsletterSignupProps> = ({
    source,
    variant = "light",
    buttonLabel,
    placeholder = "you@email.com",
    ariaLabel,
    dealAlerts = true,
}) => {
    const { t } = useTranslation();
    const [email, setEmail] = useState("");
    const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
    // "pending" — гостю ушло письмо-подтверждение; "confirmed" — владелец аккаунта, подписан сразу.
    const [result, setResult] = useState<"pending" | "confirmed">("pending");
    const known = useKnownNewsletterSubscription();

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const value = email.trim();
        if (!value || status === "sending") {
            return;
        }
        setStatus("sending");
        try {
            const next = await subscribeNewsletter(value, source, dealAlerts);
            rememberNewsletterSubscription(next);
            setResult(next === "confirmed" ? "confirmed" : "pending");
            setStatus("done");
        } catch (error) {
            console.error("Failed to subscribe", error);
            setStatus("error");
        }
    };

    const className = `nl-signup nl-signup--${variant}`;

    if (status === "done") {
        return (
            <p className={`${className} nl-signup-done`}>
                {result === "confirmed"
                    ? t("newsletter.onList")
                    : t("newsletter.almostInbox")}
            </p>
        );
    }

    if (known) {
        // Уже подписан (с этого устройства или через аккаунт) — форму не предлагаем заново.
        return (
            <p className={`${className} nl-signup-done`}>
                {known === "confirmed"
                    ? t("newsletter.onList")
                    : t("newsletter.almostLink")}
            </p>
        );
    }

    return (
        <div className={className}>
            <form className="nl-signup-form" onSubmit={handleSubmit}>
                <input
                    type="email"
                    required
                    placeholder={placeholder}
                    aria-label={ariaLabel ?? t("newsletter.emailForAlerts")}
                    value={email}
                    onChange={(event) => {
                        setEmail(event.target.value);
                        if (status === "error") {
                            setStatus("idle");
                        }
                    }}
                />
                <button type="submit" className="btn btn-primary" disabled={status === "sending"}>
                    {status === "sending" ? t("common.saving") : buttonLabel ?? t("newsletter.notifyMe")}
                </button>
            </form>
            {status === "error" && (
                <p className="nl-signup-error">
                    {t("newsletter.saveFailed")}
                </p>
            )}
        </div>
    );
};

export default NewsletterSignup;
