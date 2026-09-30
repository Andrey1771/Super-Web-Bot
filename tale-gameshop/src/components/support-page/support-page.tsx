import PageMeta from "../common/PageMeta";
import { useTranslation } from 'react-i18next';
import { serverErrorText } from '../../utils/api-error';
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useKeycloak } from '@react-keycloak/web';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import container from '../../inversify.config';
import IDENTIFIERS from '../../constants/identifiers';
import type { IKeycloakAuthService } from '../../iterfaces/i-keycloak-auth-service';
import { createSupportTicket } from '../../features/account/support/supportApi';
import { supportCategories, supportCategoryLabel } from '../../content/support/categories';
import { useSiteSettings } from '../../hooks/use-site-settings';
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
        key: 'orders',
        title: 'Orders & Payments',
        description: 'Checkout status, billing confirmations, and payment help.',
        icon: faCreditCard,
        category: 'Orders & Payments',
        keyword: 'payment'
    },
    {
        key: 'keys',
        title: 'Game keys & delivery',
        description: 'Instant delivery, key activation, and resend options.',
        icon: faKey,
        category: 'Game keys & delivery',
        keyword: 'key'
    },
    {
        key: 'refunds',
        title: 'Refunds & issues',
        description: 'Refund eligibility and troubleshooting access issues.',
        icon: faFileCircleCheck,
        category: 'Refunds & issues',
        keyword: 'refund'
    },
    {
        key: 'account',
        title: 'Account & security',
        description: 'Profile access, security checks, and verification help.',
        icon: faUserShield,
        category: 'Account & security',
        keyword: 'account'
    }
];

const searchChips = [
    { key: 'refund', label: 'Refund', term: 'refund', category: 'Refunds & issues' },
    { key: 'key', label: "Didn’t receive key", term: 'key delivery', category: 'Game keys & delivery' },
    { key: 'payment', label: 'Payment failed', term: 'payment failed', category: 'Orders & Payments' },
    { key: 'account', label: 'Account issue', term: 'account', category: 'Account & security' }
];

// Вопросы и ответы — в словаре (support.faq.<key>); здесь только тема и теги для поиска.
const faqItems = [
    { id: 'faq-key-delivery', key: 'keyDelivery', category: 'Game keys & delivery', tags: ['key', 'delivery', 'email', 'order'] },
    { id: 'faq-delivery-speed', key: 'deliverySpeed', category: 'Game keys & delivery', tags: ['instant', 'delivery', 'timing'] },
    { id: 'faq-payment-methods', key: 'paymentMethods', category: 'Orders & Payments', tags: ['payment', 'cards', 'checkout'] },
    { id: 'faq-payment-failed', key: 'paymentFailed', category: 'Orders & Payments', tags: ['payment failed', 'checkout', 'bank'] },
    { id: 'faq-refund-request', key: 'refundRequest', category: 'Refunds & issues', tags: ['refund', 'policy', 'chargeback'] },
    { id: 'faq-issue-key', key: 'issueKey', category: 'Refunds & issues', tags: ['issue', 'key', 'activation'] },
    { id: 'faq-account-security', key: 'accountSecurity', category: 'Account & security', tags: ['account', 'security', 'password'] },
    { id: 'faq-email-change', key: 'emailChange', category: 'Account & security', tags: ['email', 'account', 'verification'] },
    { id: 'faq-language-support', key: 'languageSupport', category: 'Orders & Payments', tags: ['language', 'support', 'en', 'ru'] },
    { id: 'faq-order-status', key: 'orderStatus', category: 'Orders & Payments', tags: ['order', 'status', 'invoice'] }
];

/** Подпись темы на языке сайта: категория — внутренняя строка, показывается название действия. */
const categoryKey = (category: string) => supportActions.find((action) => action.category === category)?.key ?? 'orders';

const contactChannels = [
    {
        key: 'email',
        title: 'Email support',
        description: 'We reply within 24 hours',
        icon: faEnvelope
    },
    {
        key: 'chat',
        title: 'Live chat',
        description: 'Usually answers in minutes',
        icon: faHeadset
    },
    {
        key: 'ticket',
        title: 'Support ticket',
        description: 'Best for order issues',
        icon: faMessage
    },
    {
        // Вход для запертых снаружи: заявка на сброс 2FA подаётся без логина.
        key: 'recovery',
        title: 'Account recovery',
        description: 'Can’t sign in? Lost 2FA access',
        icon: faShieldAlt
    }
];

const trustItems = [
    { key: 'secure', title: 'Secure payments', icon: faShieldAlt },
    { key: 'instant', title: 'Instant delivery', icon: faBolt },
    { key: 'verified', title: 'Verified keys', icon: faKey },
    { key: 'friendly', title: 'Friendly support', icon: faHeadset }
];

const SupportPage: React.FC = () => {
    const { t } = useTranslation();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCategory, setActiveCategory] = useState<string>('All');
    const [openFaqId, setOpenFaqId] = useState<string | null>(faqItems[0]?.id ?? null);

    const {supportEmail} = useSiteSettings();
    const {keycloak, initialized} = useKeycloak();
    const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);
    const isLoggedIn = Boolean(initialized && keycloak.authenticated);
    // @ts-ignore Тип tokenParsed у keycloak-js уже, чем реальные claim'ы
    const userEmail: string = keycloak.tokenParsed?.email ?? '';

    const [topic, setTopic] = useState(supportCategories[0]);
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [createdTicketId, setCreatedTicketId] = useState<string | null>(null);

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

    // Канал связи открывается одинаково из шапки и из блока «Contact support»: «Email support» —
    // почтовый клиент, «Support ticket» — свои запросы, «Account recovery» — заявка без логина,
    // «Live chat» — виджет чата.
    const renderChannel = (channel: (typeof contactChannels)[number], className: string, content: React.ReactNode) => {
        if (channel.key === 'email') {
            // Адрес задаётся админом в System → Settings.
            return (
                <a key={channel.title} href={`mailto:${supportEmail}?subject=Support%20request`} className={className}>
                    {content}
                </a>
            );
        }
        if (channel.key === 'ticket') {
            return (
                <Link key={channel.title} to="/account/help" className={className}>
                    {content}
                </Link>
            );
        }
        if (channel.key === 'recovery') {
            return (
                <Link key={channel.title} to="/account-recovery" className={className}>
                    {content}
                </Link>
            );
        }
        if (channel.key === 'chat') {
            return (
                <button
                    key={channel.title}
                    type="button"
                    className={className}
                    onClick={() => window.dispatchEvent(new Event('taleshop:open-support-chat'))}
                >
                    {content}
                </button>
            );
        }
        return (
            <div key={channel.title} className={className}>
                {content}
            </div>
        );
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
            // Ищем и по тексту на языке сайта, и по английским тегам: чипы и старые запросы работают на любом языке.
            const haystack = [t(`support.faq.${item.key}.question`), t(`support.faq.${item.key}.answer`), ...item.tags].join(' ').toLowerCase();
            return haystack.includes(term);
        });
    }, [searchTerm, activeCategory, t]);

    useEffect(() => {
        if (filteredFaqs.length === 0) {
            if (openFaqId !== null) {
                setOpenFaqId(null);
            }
            return;
        }
        if (openFaqId !== null && !filteredFaqs.find((item) => item.id === openFaqId)) {
            setOpenFaqId(filteredFaqs[0].id);
        }
    }, [filteredFaqs, openFaqId]);

    const handleFaqToggle = (id: string) => {
        setOpenFaqId((prev) => (prev === id ? null : id));
    };

    // Форма создаёт настоящий тикет (тот же механизм, что и в Account → Help).
    // Гостя сначала уводим на вход с возвратом сюда — тикеты привязаны к аккаунту.
    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!isLoggedIn) {
            await keycloakAuthService.loginWithRedirect(keycloak, window.location.href);
            return;
        }
        const trimmed = message.trim();
        if (!trimmed) {
            return;
        }
        setIsSubmitting(true);
        setSubmitError(null);
        try {
            const response = await createSupportTicket({
                category: topic,
                subject: trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed,
                description: trimmed
            });
            setCreatedTicketId(String(response.ticket.publicId ?? response.ticket.id));
            setMessage('');
        } catch (error: any) {
            setSubmitError(serverErrorText(error, t('support.sendFailed')));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="support-page">
            <PageMeta title={t('support.title')} description={t('support.subtitle')} canonicalPath="/support" />
            {/* Шапка в две колонки: слева заголовок и поиск, справа каналы связи. Раньше заголовок
                с подписью висел отдельно, под ним второй заголовок «Choose a topic» с ещё одной
                подписью, а поиск лежал третьим экраном — текст без якоря. Теперь у шапки своя
                работа (поиск), а темы идут сразу под ней с маленькой подписью. */}
            <section className="support-hero">
                <div className="container support-hero-grid">
                    <div className="support-hero-content">
                        <span className="support-eyebrow">{t('support.eyebrow')}</span>
                        <h1>{t('support.title')}</h1>
                        <p>{t('support.subtitle')}</p>
                        <div className="support-search-card">
                            <span className="support-search-icon" aria-hidden="true">
                                <FontAwesomeIcon icon={faMagnifyingGlass} />
                            </span>
                            <input
                                type="search"
                                placeholder={t('support.searchPlaceholder')}
                                value={searchTerm}
                                onChange={handleSearchChange}
                                aria-label={t('support.search')}
                            />
                            <span className="support-search-active">{activeCategory === 'All' ? t('support.allTopics') : t(`support.actions.${supportActions.find((action) => action.category === activeCategory)?.key ?? 'orders'}.title`)}</span>
                        </div>
                        <div className="support-chip-row">
                            {searchChips.map((chip) => (
                                <button
                                    key={chip.label}
                                    type="button"
                                    className="support-chip"
                                    onClick={() => handleChipClick(t(`support.chipTerms.${chip.key}`), chip.category)}
                                >
                                    {t(`support.chips.${chip.key}`)}
                                </button>
                            ))}
                            {(searchTerm.trim() !== '' || activeCategory !== 'All') && (
                                <button
                                    type="button"
                                    className="support-chip support-chip-clear"
                                    onClick={() => {
                                        setSearchTerm('');
                                        setActiveCategory('All');
                                    }}
                                >
                                    {t('common.clearFilters')}
                                </button>
                            )}
                        </div>
                    </div>
                    <aside className="support-hero-aside" aria-labelledby="support-talk-heading">
                        <h2 id="support-talk-heading">{t('support.talkToUs')}</h2>
                        <ul className="support-hero-channels">
                            {contactChannels.map((channel) => (
                                <li key={channel.title}>
                                    {renderChannel(
                                        channel,
                                        'support-hero-channel',
                                        <>
                                            <span className="support-hero-channel-title">
                                                <FontAwesomeIcon icon={channel.icon} />
                                                {t(`support.channels.${channel.key}.title`)}
                                            </span>
                                            <span className="support-hero-channel-note">{t(`support.channels.${channel.key}.text`)}</span>
                                        </>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </aside>
                </div>
            </section>

            <section className="support-actions">
                <div className="container">
                    <div className="support-topics-header">
                        <h2>{t('support.browseByTopic')}</h2>
                        <button
                            type="button"
                            className="support-topics-all"
                            onClick={() => {
                                setSearchTerm('');
                                setActiveCategory('All');
                                scrollToSection(faqRef);
                            }}
                        >
                            {t('support.allQuestions')} <FontAwesomeIcon icon={faArrowRight} />
                        </button>
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
                                <h3>{t(`support.actions.${action.key}.title`)}</h3>
                                <p>{t(`support.actions.${action.key}.text`)}</p>
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <section className="support-faq section" ref={faqRef}>
                <div className="container">
                    <div className="support-section-header">
                        <h2>{t('support.faqTitle')}</h2>
                        <p>{t('support.faqText')}</p>
                    </div>
                    {filteredFaqs.length === 0 ? (
                        <div className="support-empty card">
                            <div>
                                <h3>{t('support.noResults')}</h3>
                                <p>{t('support.noResultsText')}</p>
                            </div>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => scrollToSection(contactRef)}
                            >
                                {t('common.contactSupport')}
                            </button>
                        </div>
                    ) : (
                        <div className="support-faq-grid">
                            {filteredFaqs.map((item) => {
                                const isOpen = item.id === openFaqId;
                                return (
                                    <div key={item.id} className="card support-faq-item">
                                        <div className="support-faq-meta">
                                            <span className="badge">{t(`support.actions.${categoryKey(item.category)}.title`)}</span>
                                        </div>
                                        <button
                                            type="button"
                                            className="support-faq-toggle"
                                            onClick={() => handleFaqToggle(item.id)}
                                            aria-expanded={isOpen}
                                            aria-controls={`${item.id}-content`}
                                        >
                                            <span>{t(`support.faq.${item.key}.question`)}</span>
                                            <FontAwesomeIcon icon={faArrowRight} className={isOpen ? 'open' : ''} />
                                        </button>
                                        {isOpen && (
                                            <div id={`${item.id}-content`} className="support-faq-content">
                                                <p>{t(`support.faq.${item.key}.answer`)}</p>
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
                        <h2>{t('support.contactTitle')}</h2>
                        <p>{t('support.contactText')}</p>
                    </div>
                    <div className="support-contact-grid">
                        <div className="support-contact-channels">
                            {contactChannels.map((channel) =>
                                renderChannel(
                                    channel,
                                    'card support-contact-card',
                                    <>
                                        <div className="support-contact-icon">
                                            <FontAwesomeIcon icon={channel.icon} />
                                        </div>
                                        <div>
                                            <h3>{t(`support.channels.${channel.key}.title`)}</h3>
                                            <p>{t(`support.channels.${channel.key}.text`)}</p>
                                        </div>
                                    </>
                                )
                            )}
                        </div>
                        {createdTicketId ? (
                            <div className="card support-contact-form support-contact-success">
                                <h3>{t('support.requestCreated', { id: createdTicketId })}</h3>
                                <p>{t('support.requestCreatedText')}</p>
                                <div className="support-success-actions">
                                    <Link to="/account/help" className="btn btn-primary">
                                        {t('support.track')}
                                    </Link>
                                    <button
                                        type="button"
                                        className="btn btn-outline"
                                        onClick={() => setCreatedTicketId(null)}
                                    >
                                        {t('support.sendAnother')}
                                    </button>
                                </div>
                            </div>
                        ) : (
                        <form className="card support-contact-form" onSubmit={handleSubmit}>
                            <div className="support-field">
                                <label htmlFor="support-topic">{t('support.topic')}</label>
                                <div className="support-field-input">
                                    <FontAwesomeIcon icon={faFileCircleCheck} />
                                    <select
                                        id="support-topic"
                                        name="topic"
                                        value={topic}
                                        onChange={(event) => setTopic(event.target.value)}
                                    >
                                        {supportCategories.map((category) => (
                                            <option key={category} value={category}>{supportCategoryLabel(category)}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="support-field">
                                <label htmlFor="support-email">{t('common.email')}</label>
                                <div className="support-field-input">
                                    <FontAwesomeIcon icon={faEnvelope} />
                                    <input
                                        id="support-email"
                                        name="email"
                                        type="email"
                                        placeholder="you@email.com"
                                        value={isLoggedIn ? userEmail : ''}
                                        readOnly
                                        disabled={!isLoggedIn}
                                    />
                                </div>
                                {!isLoggedIn && (
                                    <small>{t('support.signInHint')}</small>
                                )}
                            </div>
                            <div className="support-field">
                                <label htmlFor="support-message">{t('support.message')}</label>
                                <div className="support-field-input">
                                    <FontAwesomeIcon icon={faMessage} />
                                    <textarea
                                        id="support-message"
                                        name="message"
                                        rows={4}
                                        placeholder={t('support.messagePlaceholder')}
                                        value={message}
                                        onChange={(event) => setMessage(event.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            {submitError && <p className="support-submit-error">{submitError}</p>}
                            <button
                                type="submit"
                                className="btn btn-primary support-submit"
                                disabled={isSubmitting || (isLoggedIn && !message.trim())}
                            >
                                {isSubmitting
                                    ? t('common.sending')
                                    : isLoggedIn
                                        ? t('support.sendRequest')
                                        : t('support.signInSend')}
                            </button>
                            <small>{t('support.replyWithin')}</small>
                        </form>
                        )}
                    </div>
                </div>
            </section>

            <section className="support-trust">
                <div className="container">
                    <div className="support-trust-grid">
                        {trustItems.map((item) => (
                            <div key={item.title} className="support-trust-item">
                                <FontAwesomeIcon icon={item.icon} />
                                <span>{t('support.trust.' + item.key)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="support-final section">
                <div className="container">
                    <div className="card support-final-card">
                        <div>
                            <h2>{t('support.stillNeed')}</h2>
                            <p>{t('support.stillNeedText')}</p>
                        </div>
                        <div className="support-final-actions">
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => scrollToSection(contactRef)}
                            >
                                {t('common.contactSupport')}
                            </button>
                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => scrollToSection(faqRef)}
                            >
                                {t('support.goToFaq')}
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default SupportPage;
