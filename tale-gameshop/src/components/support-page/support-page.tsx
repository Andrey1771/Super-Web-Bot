import React, { useMemo, useRef, useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowRight,
    faBolt,
    faCreditCard,
    faEnvelope,
    faFileCircleCheck,
    faHeadset,
    faKey,
    faMagnifyingGlass,
    faMessage,
    faShieldAlt,
    faUserShield
} from '@fortawesome/free-solid-svg-icons';
import './support-page.css';

const supportActions = [
    {
        title: 'Orders & Payments',
        description: 'Checkout status, billing confirmations, and payment help.',
        icon: faCreditCard,
        category: 'Orders & Payments',
        keyword: 'payment'
    },
    {
        title: 'Game keys & delivery',
        description: 'Instant delivery, key activation, and resend options.',
        icon: faKey,
        category: 'Game keys & delivery',
        keyword: 'key'
    },
    {
        title: 'Refunds & issues',
        description: 'Refund eligibility and troubleshooting access issues.',
        icon: faFileCircleCheck,
        category: 'Refunds & issues',
        keyword: 'refund'
    },
    {
        title: 'Account & security',
        description: 'Profile access, security checks, and verification help.',
        icon: faUserShield,
        category: 'Account & security',
        keyword: 'account'
    }
];

const searchChips = [
    { label: 'Refund', term: 'refund', category: 'Refunds & issues' },
    { label: "Didn’t receive key", term: 'key delivery', category: 'Game keys & delivery' },
    { label: 'Payment failed', term: 'payment failed', category: 'Orders & Payments' },
    { label: 'Account issue', term: 'account', category: 'Account & security' }
];

const faqItems = [
    {
        id: 'faq-key-delivery',
        question: 'How do I receive my game key?',
        answer: 'Keys are delivered instantly by email and are always available in your account dashboard.',
        category: 'Game keys & delivery',
        tags: ['key', 'delivery', 'email', 'order']
    },
    {
        id: 'faq-delivery-speed',
        question: 'Is delivery instant?',
        answer: 'Yes. Most purchases are fulfilled within seconds, and we will notify you if anything delays delivery.',
        category: 'Game keys & delivery',
        tags: ['instant', 'delivery', 'timing']
    },
    {
        id: 'faq-payment-methods',
        question: 'What payment methods do you support?',
        answer: 'We accept major debit/credit cards and trusted local processors for secure checkout.',
        category: 'Orders & Payments',
        tags: ['payment', 'cards', 'checkout']
    },
    {
        id: 'faq-payment-failed',
        question: 'My payment failed. What should I do?',
        answer: 'Double-check your card details, try another payment method, or contact your bank. If it still fails, reach out to support.',
        category: 'Orders & Payments',
        tags: ['payment failed', 'checkout', 'bank']
    },
    {
        id: 'faq-refund-request',
        question: 'Can I request a refund?',
        answer: 'Refunds are possible for unused keys and accidental purchases. Submit a request within 14 days for review.',
        category: 'Refunds & issues',
        tags: ['refund', 'policy', 'chargeback']
    },
    {
        id: 'faq-issue-key',
        question: 'My key is not working. What should I check?',
        answer: 'Make sure the region matches your account, double-check for typos, and confirm the key has not been redeemed before.',
        category: 'Refunds & issues',
        tags: ['issue', 'key', 'activation']
    },
    {
        id: 'faq-account-security',
        question: 'How do I secure my account?',
        answer: 'Use a strong password, enable two-factor authentication, and avoid sharing your login details.',
        category: 'Account & security',
        tags: ['account', 'security', 'password']
    },
    {
        id: 'faq-email-change',
        question: 'Can I change the email linked to my account?',
        answer: 'Yes. Head to account settings to update your email. You may be asked to verify the change.',
        category: 'Account & security',
        tags: ['email', 'account', 'verification']
    },
    {
        id: 'faq-language-support',
        question: 'Do you support EN / RU?',
        answer: 'Yes. Our support team can assist in both EN and RU, and game language availability is listed on each product page.',
        category: 'Orders & Payments',
        tags: ['language', 'support', 'en', 'ru']
    },
    {
        id: 'faq-order-status',
        question: 'Where can I see my order status?',
        answer: 'All orders and invoices are available in your account dashboard under “Orders & Payments.”',
        category: 'Orders & Payments',
        tags: ['order', 'status', 'invoice']
    }
];

const contactChannels = [
    {
        title: 'Email support',
        description: 'We reply within 24 hours',
        icon: faEnvelope
    },
    {
        title: 'Live chat',
        description: 'Usually answers in minutes',
        icon: faHeadset
    },
    {
        title: 'Support ticket',
        description: 'Best for order issues',
        icon: faMessage
    }
];

const trustItems = [
    { title: 'Secure payments', icon: faShieldAlt },
    { title: 'Instant delivery', icon: faBolt },
    { title: 'Verified keys', icon: faKey },
    { title: 'Friendly support', icon: faHeadset }
];

const SupportPage: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCategory, setActiveCategory] = useState<string>('All');
    const [openFaqId, setOpenFaqId] = useState<string | null>(faqItems[0]?.id ?? null);

    const faqRef = useRef<HTMLDivElement | null>(null);
    const contactRef = useRef<HTMLDivElement | null>(null);

    const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
        if (ref.current) {
            ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    const handleActionClick = (category: string, keyword: string) => {
        setActiveCategory(category);
        setSearchTerm(keyword);
        scrollToSection(faqRef);
    };

    const handleChipClick = (term: string, category?: string) => {
        setSearchTerm(term);
        if (category) {
            setActiveCategory(category);
        } else {
            setActiveCategory('All');
        }
        scrollToSection(faqRef);
    };

    const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(event.target.value);
    };

    const filteredFaqs = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return faqItems.filter((item) => {
            const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
            if (!matchesCategory) {
                return false;
            }
            if (!term) {
                return true;
            }
            const haystack = [item.question, item.answer, ...item.tags].join(' ').toLowerCase();
            return haystack.includes(term);
        });
    }, [searchTerm, activeCategory]);

    useEffect(() => {
        if (filteredFaqs.length === 0) {
            if (openFaqId !== null) {
                setOpenFaqId(null);
            }
            return;
        }
        if (!filteredFaqs.find((item) => item.id === openFaqId)) {
            setOpenFaqId(filteredFaqs[0].id);
        }
    }, [filteredFaqs, openFaqId]);

    const handleFaqToggle = (id: string) => {
        setOpenFaqId((prev) => (prev === id ? null : id));
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
    };

    return (
        <div className="support-page">
            <section className="support-hero">
                <div className="container">
                    <div className="support-hero-content">
                        <h1>Support &amp; Help Center</h1>
                        <p>We’re here to help you with purchases, delivery, and account questions.</p>
                    </div>
                </div>
            </section>

            <section className="support-actions section">
                <div className="container">
                    <div className="support-section-header">
                        <h2>Choose a topic</h2>
                        <p>Find the right help category and jump straight into the answers.</p>
                    </div>
                    <div className="support-action-grid">
                        {supportActions.map((action) => (
                            <button
                                key={action.title}
                                type="button"
                                className="card support-action-card"
                                onClick={() => handleActionClick(action.category, action.keyword)}
                            >
                                <div className="support-action-icon">
                                    <FontAwesomeIcon icon={action.icon} />
                                </div>
                                <h3>{action.title}</h3>
                                <p>{action.description}</p>
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <section className="support-search section">
                <div className="container">
                    <div className="support-section-header">
                        <h2>Search support</h2>
                        <p>Type a question or select a quick topic below.</p>
                    </div>
                    <div className="support-search-card">
                        <span className="support-search-icon" aria-hidden="true">
                            <FontAwesomeIcon icon={faMagnifyingGlass} />
                        </span>
                        <input
                            type="search"
                            placeholder="Search for help…"
                            value={searchTerm}
                            onChange={handleSearchChange}
                            aria-label="Search support"
                        />
                        <span className="support-search-active">{activeCategory === 'All' ? 'All topics' : activeCategory}</span>
                    </div>
                    <div className="support-chip-row">
                        {searchChips.map((chip) => (
                            <button
                                key={chip.label}
                                type="button"
                                className="support-chip"
                                onClick={() => handleChipClick(chip.term, chip.category)}
                            >
                                {chip.label}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <section className="support-faq section" ref={faqRef}>
                <div className="container">
                    <div className="support-section-header">
                        <h2>Frequently asked questions</h2>
                        <p>Browse answers or refine with search and category filters.</p>
                    </div>
                    {filteredFaqs.length === 0 ? (
                        <div className="support-empty card">
                            <div>
                                <h3>No results found</h3>
                                <p>Try another search term or reach out to our team for direct help.</p>
                            </div>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => scrollToSection(contactRef)}
                            >
                                Contact support
                            </button>
                        </div>
                    ) : (
                        <div className="support-faq-grid">
                            {filteredFaqs.map((item) => {
                                const isOpen = item.id === openFaqId;
                                return (
                                    <div key={item.id} className="card support-faq-item">
                                        <div className="support-faq-meta">
                                            <span className="badge">{item.category}</span>
                                        </div>
                                        <button
                                            type="button"
                                            className="support-faq-toggle"
                                            onClick={() => handleFaqToggle(item.id)}
                                            aria-expanded={isOpen}
                                            aria-controls={`${item.id}-content`}
                                        >
                                            <span>{item.question}</span>
                                            <FontAwesomeIcon icon={faArrowRight} className={isOpen ? 'open' : ''} />
                                        </button>
                                        {isOpen && (
                                            <div id={`${item.id}-content`} className="support-faq-content">
                                                <p>{item.answer}</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>

            <section className="support-contact section" ref={contactRef}>
                <div className="container">
                    <div className="support-section-header">
                        <h2>Contact support</h2>
                        <p>If the FAQ didn’t solve it, send us a message and we’ll take it from here.</p>
                    </div>
                    <div className="support-contact-grid">
                        <div className="support-contact-channels">
                            {contactChannels.map((channel) => (
                                <div key={channel.title} className="card support-contact-card">
                                    <div className="support-contact-icon">
                                        <FontAwesomeIcon icon={channel.icon} />
                                    </div>
                                    <div>
                                        <h3>{channel.title}</h3>
                                        <p>{channel.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <form className="card support-contact-form" onSubmit={handleSubmit}>
                            <div className="support-field">
                                <label htmlFor="support-topic">Topic</label>
                                <div className="support-field-input">
                                    <FontAwesomeIcon icon={faFileCircleCheck} />
                                    <select id="support-topic" name="topic" defaultValue="Order status">
                                        <option>Order status</option>
                                        <option>Payment issue</option>
                                        <option>Key delivery</option>
                                        <option>Refund request</option>
                                        <option>Account security</option>
                                    </select>
                                </div>
                            </div>
                            <div className="support-field">
                                <label htmlFor="support-email">Email</label>
                                <div className="support-field-input">
                                    <FontAwesomeIcon icon={faEnvelope} />
                                    <input id="support-email" name="email" type="email" placeholder="you@email.com" required />
                                </div>
                            </div>
                            <div className="support-field">
                                <label htmlFor="support-message">Message</label>
                                <div className="support-field-input">
                                    <FontAwesomeIcon icon={faMessage} />
                                    <textarea id="support-message" name="message" rows={4} placeholder="Tell us what happened" required />
                                </div>
                            </div>
                            <button type="submit" className="btn btn-primary support-submit">
                                Send request
                            </button>
                            <small>We usually reply within 24 hours.</small>
                        </form>
                    </div>
                </div>
            </section>

            <section className="support-trust">
                <div className="container">
                    <div className="support-trust-grid">
                        {trustItems.map((item) => (
                            <div key={item.title} className="support-trust-item">
                                <FontAwesomeIcon icon={item.icon} />
                                <span>{item.title}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="support-final section">
                <div className="container">
                    <div className="card support-final-card">
                        <div>
                            <h2>Still need help?</h2>
                            <p>Didn’t find your answer? Our support team usually responds within a few hours.</p>
                        </div>
                        <div className="support-final-actions">
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => scrollToSection(contactRef)}
                            >
                                Contact support
                            </button>
                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => scrollToSection(faqRef)}
                            >
                                Go to FAQ
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default SupportPage;
