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

const faqCategories: FaqCategory[] = [
    {
        id: "orders",
        title: "Orders & delivery",
        items: [
            {
                question: "How do I receive my game key?",
                answer:
                    "Keys are delivered instantly after a successful payment. You'll find them in your account under Keys, and we also email a copy to your registered address.",
            },
            {
                question: "Is delivery really instant?",
                answer:
                    "For in-stock titles, yes — most orders reach your inbox within seconds. If a key needs manual review, we'll notify you and deliver as soon as it clears.",
            },
            {
                question: "Where do I redeem my key?",
                answer:
                    "Each product page lists the platform (for example Steam). Redeem the key in that platform's client under 'Activate a Product' to add the game to your library.",
            },
        ],
    },
    {
        id: "payments",
        title: "Payments & pricing",
        items: [
            {
                question: "Which payment methods do you accept?",
                answer:
                    "We accept major cards (Visa, Mastercard, American Express) and secure processors via Stripe. Your card details are handled by the payment provider and never stored on our servers.",
            },
            {
                question: "Can I change the currency?",
                answer:
                    "Yes — use the currency switcher in the header. Displayed prices are indicative; your card is charged in the store's settlement currency shown at checkout.",
            },
            {
                question: "Is checkout secure?",
                answer:
                    "Checkout runs over an encrypted connection through a trusted payment processor, with buyer-protection safeguards on every order.",
            },
        ],
    },
    {
        id: "refunds",
        title: "Refunds & issues",
        items: [
            {
                question: "What is your refund policy?",
                answer:
                    "If a key doesn't work or you can't access your purchase, contact us and we'll make it right — a replacement key or a refund. Full details are on our Refund policy page.",
            },
            {
                question: "My key won't activate — what should I do?",
                answer:
                    "First confirm you're redeeming it on the correct platform and region. If it still fails, reach out through support with your order ID and we'll resolve it quickly.",
            },
        ],
    },
    {
        id: "account",
        title: "Account & access",
        items: [
            {
                question: "Do I need an account to buy?",
                answer:
                    "An account keeps your keys, orders and receipts in one place, and lets support verify your purchase faster. You can create one in seconds from the Sign up button.",
            },
            {
                question: "I've lost access to my account.",
                answer:
                    "Use account recovery to regain access. If you're still stuck, contact support and we'll help verify your identity and restore your account.",
            },
            {
                question: "Which languages does support cover?",
                answer:
                    "Our team and AI assistant help in English and Russian, and each product page lists the languages available for that game.",
            },
            {
                question: "How do I manage the newsletter or unsubscribe?",
                answer:
                    "Every newsletter email has a one-click Unsubscribe link in the footer — no sign-in needed. If you have an account, you can also switch the deals newsletter on or off in Account → Settings → Notifications. Unsubscribing only stops marketing emails; order receipts and security emails still arrive.",
            },
        ],
    },
];

export default function FaqPage() {
    const [query, setQuery] = useState("");
    const [openKey, setOpenKey] = useState<string | null>("orders-0");

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
    }, [normalizedQuery]);

    const openChat = () => {
        window.dispatchEvent(new Event("taleshop:open-support-chat"));
    };

    const hasResults = filtered.some((category) => category.items.length > 0);

    return (
        <div className="faq-page">
            <section className="faq-hero">
                <i className="fx-texture" aria-hidden="true"></i>
                <i className="fx-orb faq-orb" aria-hidden="true"></i>
                <div className="container faq-hero-inner">
                    <span className="faq-eyebrow">Help center</span>
                    <h1>How can we help?</h1>
                    <p className="faq-hero-subtext">
                        Answers to the most common questions about orders, delivery, payments and your account.
                    </p>
                    <label className="faq-search">
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
                            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                        <input
                            type="search"
                            placeholder="Search the help center…"
                            aria-label="Search FAQ"
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
                            <div className="faq-category reveal" key={category.id}>
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
                            <h3>No matches for “{query}”</h3>
                            <p className="muted">Try a different keyword, or reach out and we'll help directly.</p>
                        </div>
                    )}
                </div>

                <aside className="faq-aside">
                    <div className="faq-help-card lift reveal">
                        <h3>Still need help?</h3>
                        <p className="muted">
                            Our AI assistant answers instantly and can hand you to a specialist when needed.
                        </p>
                        <button type="button" className="btn btn-primary" onClick={openChat}>
                            Chat with support
                        </button>
                        <Link to="/support" className="btn btn-outline">
                            Visit Support
                        </Link>
                    </div>
                    <div className="faq-links-card lift reveal" data-reveal-delay="1">
                        <h4>Helpful pages</h4>
                        <ul>
                            <li>
                                <Link to="/support/docs/refund-policy">Refund policy</Link>
                            </li>
                            <li>
                                <Link to="/support/docs/activation-guide">Activation guide</Link>
                            </li>
                            <li>
                                <Link to="/games">Browse the catalog</Link>
                            </li>
                            <li>
                                <Link to="/deals">Current deals</Link>
                            </li>
                        </ul>
                    </div>
                </aside>
            </section>
        </div>
    );
}
