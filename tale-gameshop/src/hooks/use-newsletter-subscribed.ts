import { useEffect, useState } from "react";
import { useKeycloak } from "@react-keycloak/web";
import { getMyNewsletter, type SubscriberStatus } from "../api/newsletterApi";

const STORAGE_KEY = "taleshop_newsletter_subscribed_v1";

// «Ждёт подтверждения» — не вечное состояние: если письмо так и не подтвердили
// (или подтвердили с другого устройства/браузера), через сутки снова показываем форму.
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export type KnownSubscription = "confirmed" | "pending" | null;

const readStored = (): KnownSubscription => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as { status?: string; at?: number };
        if (parsed.status === "confirmed") {
            return "confirmed";
        }
        if (parsed.status === "pending") {
            if (typeof parsed.at === "number" && Date.now() - parsed.at < PENDING_TTL_MS) {
                return "pending";
            }
            localStorage.removeItem(STORAGE_KEY);
        }
        return null;
    } catch {
        return null;
    }
};

/** Запомнить успешную подписку на этом устройстве — чтобы не предлагать её снова. */
export const rememberNewsletterSubscription = (status: SubscriberStatus) => {
    try {
        if (status === "confirmed" || status === "pending") {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ status, at: Date.now() }));
        }
    } catch {
        /* приватный режим — просто не запоминаем */
    }
};

/** Забыть подписку на этом устройстве (после отписки) — формы снова показываются. */
export const forgetNewsletterSubscription = () => {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
};

/**
 * Что известно о подписке текущего посетителя:
 * гость — флажок localStorage (появляется после подписки с этого устройства),
 * владелец аккаунта — реальный статус с сервера (перекрывает флажок).
 * null — ничего не известно, форму подписки стоит показать.
 */
export const useKnownNewsletterSubscription = (): KnownSubscription => {
    const { keycloak, initialized } = useKeycloak();
    const [known, setKnown] = useState<KnownSubscription>(readStored);

    useEffect(() => {
        if (!initialized || !keycloak.authenticated) {
            return;
        }
        let cancelled = false;
        getMyNewsletter()
            .then((mine) => {
                if (cancelled) {
                    return;
                }
                if (mine.subscribed) {
                    setKnown("confirmed");
                    rememberNewsletterSubscription("confirmed");
                } else if (mine.status === "pending") {
                    setKnown("pending");
                } else {
                    // Отписался (или никогда не подписывался) — форму снова показываем.
                    setKnown(null);
                    forgetNewsletterSubscription();
                }
            })
            .catch(() => {
                /* сеть/401 — остаёмся на localStorage-значении */
            });
        return () => {
            cancelled = true;
        };
    }, [initialized, keycloak.authenticated]);

    return known;
};
