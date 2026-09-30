import PageMeta from "../common/PageMeta";
import { useTranslation } from "react-i18next";
import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./faq-page.css";

interface FaqItem {
    question: string;
    answer: string;
}

interface FaqCategory {
    id: string;
    title: string;
    items: FaqItem[];
}

/** Порядок разделов; вопросы и ответы — в словаре (help.faqPage.<id>) на языке сайта. */
const FAQ_CATEGORY_IDS = ["orders", "payments", "refunds", "account"];

type FaqCategoryText = { title: string; items: FaqItem[] };

export default function FaqPage() {
    const { t, i18n } = useTranslation();
    const [query, setQuery] = useState("");
    const [openKey, setOpenKey] = useState<string | null>("orders-0");

    const faqCategories = useMemo<FaqCategory[]>(
        () =>
            FAQ_CATEGORY_IDS.map((id) => {
                const text = t(`help.faqPage.${id}`, { returnObjects: true }) as FaqCategoryText;
                return { id, title: text.title, items: text.items };
            }),
        // Язык сменился — словарь другой, список собираем заново.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [t, i18n.language]
    );

    const normalizedQuery = query.trim().toLowerCase();

    const filtered = useMemo(() => {
        if (!normalizedQuery) {
            return faqCategories;
        }
        return faqCategories
            .map((category) => ({
                ...category,
                items: category.items.filter(
                    (item) =>
                        item.question.toLowerCase().includes(normalizedQuery) ||
                        item.answer.toLowerCase().includes(normalizedQuery)
                ),
            }))
            .filter((category) => category.items.length > 0);
    }, [faqCategories, normalizedQuery]);

    const openChat = () => {
        window.dispatchEvent(new Event("taleshop:open-support-chat"));
    };

    const hasResults = filtered.some((category) => category.items.length > 0);

    return (
        <div className="faq-page">
            <PageMeta title={t("faq.title")} description={t("faq.subtitle")} canonicalPath="/faq" />
            <section className="faq-hero">
                <i className="fx-texture" aria-hidden="true"></i>
                <i className="fx-orb faq-orb" aria-hidden="true"></i>
                <div className="container faq-hero-inner">
                    <span className="faq-eyebrow">{t("faq.eyebrow")}</span>
                    <h1>{t("faq.title")}</h1>
                    <p className="faq-hero-subtext">{t("faq.subtitle")}</p>
                    <label className="faq-search">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
                            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                        <input
                            type="search"
                            placeholder={t("faq.searchPlaceholder")}
                            aria-label={t("faq.search")}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </label>
                </div>
            </section>

            <section className="container faq-body">
                <div className="faq-main">
                    {hasResults ? (
                        filtered.map((category) => (
                            <div className="faq-category" key={category.id}>
                                <h2 className="faq-category-title">{category.title}</h2>
                                <div className="faq-list">
                                    {category.items.map((item, index) => {
                                        const key = `${category.id}-${index}`;
                                        const isOpen = openKey === key;
                                        return (
                                            <div className={`faq-item ${isOpen ? "open" : ""}`} key={key}>
                                                <button
                                                    type="button"
                                                    className="faq-trigger"
                                                    aria-expanded={isOpen}
                                                    onClick={() => setOpenKey(isOpen ? null : key)}
                                                >
                                                    <span>{item.question}</span>
                                                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                                                        <path
                                                            d="m6 9 6 6 6-6"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="1.8"
                                                            strokeLinecap="round"
                                                        />
                                                    </svg>
                                                </button>
                                                {isOpen && <div className="faq-answer">{item.answer}</div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="faq-no-results">
                            <h3>{t("faq.noMatches", { query })}</h3>
                            <p className="muted">{t("faq.tryOther")}</p>
                        </div>
                    )}
                </div>

                <aside className="faq-aside">
                    <div className="faq-help-card lift">
                        <h3>{t("faq.stillNeed")}</h3>
                        <p className="muted">{t("faq.aiText")}</p>
                        <button type="button" className="btn btn-primary" onClick={openChat}>
                            {t("faq.chat")}
                        </button>
                        <Link to="/support" className="btn btn-outline">
                            {t("faq.visitSupport")}
                        </Link>
                    </div>
                    <div className="faq-links-card lift">
                        <h4>{t("faq.helpfulPages")}</h4>
                        <ul>
                            <li>
                                <Link to="/support/docs/refund-policy">{t("faq.refundPolicy")}</Link>
                            </li>
                            <li>
                                <Link to="/support/docs/activation-guide">{t("faq.activationGuide")}</Link>
                            </li>
                            <li>
                                <Link to="/games">{t("faq.browseCatalog")}</Link>
                            </li>
                            <li>
                                <Link to="/deals">{t("faq.currentDeals")}</Link>
                            </li>
                        </ul>
                    </div>
                </aside>
            </section>
        </div>
    );
}
