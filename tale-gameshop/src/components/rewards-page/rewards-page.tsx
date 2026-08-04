import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useKeycloak } from '@react-keycloak/web';
import {
    faArrowRight,
    faCartShopping,
    faChevronDown,
    faCoins,
    faGamepad,
    faStar,
    faTag,
    faTrophy,
} from '@fortawesome/free-solid-svg-icons';
import container from '../../inversify.config';
import IDENTIFIERS from '../../constants/identifiers';
import type { IKeycloakAuthService } from '../../iterfaces/i-keycloak-auth-service';
import {
    getCashbackAccount,
    getCashbackTiers,
    type CashbackAccount,
    type CashbackTiersResponse,
} from '../../api/cashbackApi';
import './rewards-page.css';

const steps = [
    { icon: faCartShopping, title: 'Buy your games', text: 'Every completed order earns cashback at your current tier rate.' },
    { icon: faCoins, title: 'Earn cashback', text: 'Points land in your rewards wallet the moment your payment clears.' },
    { icon: faTag, title: 'Spend it', text: 'Redeem points at checkout — 1 point equals $1 off your next order.' },
];

// FAQ отвечает на возражения до регистрации; ответы держим в 1-2 предложения.
const buildFaq = (maxRedeemPercent: number) => [
    {
        question: 'What is cashback?',
        answer: 'A percentage of every completed order comes back to you as points. 1 point equals $1.',
    },
    {
        question: 'How do I earn points?',
        answer: 'Sign in and buy games — points are added automatically once your payment clears. Your tier sets the rate.',
    },
    {
        question: 'How do I spend them?',
        answer: `At checkout: apply your points to cover up to ${maxRedeemPercent}% of the order total.`,
    },
    {
        question: 'Do points expire?',
        answer: 'No. Your balance and your tier never expire.',
    },
    {
        question: 'What happens on refunds?',
        answer: 'A fully refunded order reverses the points it earned. Everything else in your wallet stays untouched.',
    },
];

// Цвета трофеев по порядку тиров (bronze → silver → gold); лишние тиры получают фирменный фиолетовый.
const trophyClassByIndex = ['is-bronze', 'is-silver', 'is-gold'];

const RewardsPage: React.FC = () => {
    const { keycloak } = useKeycloak();
    const keycloakAuthService = container.get<IKeycloakAuthService>(IDENTIFIERS.IKeycloakAuthService);
    const [data, setData] = useState<CashbackTiersResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    // Кошелёк подгружается только залогиненным: hero показывает баланс, таблица — «твой» тир.
    const [account, setAccount] = useState<CashbackAccount | null>(null);
    const [openFaqIndex, setOpenFaqIndex] = useState(0);

    useEffect(() => {
        let active = true;
        getCashbackTiers()
            .then((response) => { if (active) setData(response); })
            .catch((err) => { console.error('Failed to load cashback tiers:', err); })
            .finally(() => { if (active) setIsLoading(false); });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        if (!keycloak.authenticated) {
            return;
        }
        let active = true;
        getCashbackAccount()
            .then((response) => { if (active) setAccount(response); })
            .catch((err) => { console.error('Failed to load cashback account:', err); });
        return () => { active = false; };
    }, [keycloak.authenticated]);

    const tiers = useMemo(() => data?.tiers ?? [], [data]);
    const topRate = useMemo(() => tiers.reduce((max, tier) => Math.max(max, tier.ratePercent), 0), [tiers]);
    const faq = useMemo(() => buildFaq(data?.maxRedeemPercentOfOrder ?? 30), [data]);
    const currentTierName = account?.currentTier.name ?? null;

    const handleSignIn = () => {
        keycloakAuthService.loginWithRedirect(keycloak, window.location.href);
    };

    return (
        <div className="rewards-page">
            <section className="rewards-page-hero">
                {/* Правая половина hero: стопка монет (вектор в стиле промо-карточки главной). */}
                <div className="rewards-hero-art" aria-hidden="true">
                    <svg viewBox="0 0 240 210" fill="none">
                        <ellipse cx="118" cy="176" rx="78" ry="27" fill="#1c8f57" />
                        <ellipse cx="118" cy="155" rx="78" ry="27" fill="#2bb56e" />
                        <ellipse cx="118" cy="134" rx="78" ry="27" fill="#1c8f57" />
                        <ellipse cx="118" cy="113" rx="78" ry="27" fill="#2bb56e" />
                        <ellipse cx="118" cy="92" rx="78" ry="27" fill="#34d17e" />
                        <text x="118" y="103" textAnchor="middle" fontSize="32" fontWeight="700" fill="#0c3a24">$</text>
                        <circle cx="36" cy="52" r="16" fill="#2bb56e" />
                        <circle cx="206" cy="34" r="11" fill="#34d17e" />
                        <circle cx="226" cy="86" r="7" fill="#2bb56e" />
                    </svg>
                </div>
                <div className="container">
                    <div className="rewards-page-hero-inner">
                    <div className="rewards-page-eyebrow">Tale Shop · Rewards</div>
                    <h1>Get up to {topRate || 3}% back on every order</h1>
                    <p className="rewards-page-lead">Buy games, earn points, spend them like money.</p>
                    {keycloak.authenticated && account ? (
                        // Залогиненному вместо продающих кнопок — его собственные цифры.
                        <div className="rewards-page-actions">
                            <div className="rewards-hero-balance">
                                <span className="rewards-hero-balance-icon" aria-hidden="true">
                                    <FontAwesomeIcon icon={faCoins} />
                                </span>
                                <span>
                                    Your balance: <strong>${(account.balance * account.pointToCurrency).toFixed(2)}</strong>
                                    {' · '}
                                    {account.currentTier.name} {account.currentTier.ratePercent}%
                                </span>
                                <Link to="/account/rewards" className="btn btn-primary">Open my rewards</Link>
                            </div>
                        </div>
                    ) : (
                        <div className="rewards-page-actions">
                            {keycloak.authenticated ? (
                                <Link to="/account/rewards" className="btn btn-primary">Open my rewards</Link>
                            ) : (
                                <button type="button" className="btn btn-primary" onClick={handleSignIn}>
                                    Sign in to start earning
                                </button>
                            )}
                            <Link to="/games" className="btn btn-outline">Browse games</Link>
                        </div>
                    )}
                    </div>
                </div>
            </section>

            {/* «Что такое кэшбек»: визуал — мини-виджет уровня (CSS, без фото), текст справа. */}
            <section className="container rewards-page-section rewards-about">
                <div className="rewards-about-visual" aria-hidden="true">
                    <span className="rewards-about-glow" />
                    <div className="rewards-about-card">
                        <div className="rewards-about-ring">
                            <span>43%</span>
                        </div>
                        <div className="rewards-about-card-copy">
                            <div className="rewards-about-level-label">Level</div>
                            <div className="rewards-about-level">Silver</div>
                            <div className="rewards-about-rate">
                                <FontAwesomeIcon icon={faCoins} />
                                Cashback · 2%
                            </div>
                        </div>
                    </div>
                    <span className="rewards-about-badge">+ $1.20</span>
                </div>
                <div className="rewards-about-copy">
                    <div className="rewards-page-eyebrow">Short info</div>
                    <h2>What is cashback?</h2>
                    <p className="muted">
                        Cashback returns a share of every completed order to you as points — 1 point equals $1.
                        Points add up in your rewards wallet and can be spent at checkout like real money.
                        The higher your tier, the bigger the share.
                    </p>
                </div>
            </section>

            <section className="container rewards-page-section">
                <div className="rewards-page-heading">
                    <h2>Cashback tiers</h2>
                    <p className="muted">Your tier is set by your lifetime spend and never expires.</p>
                </div>
                {isLoading ? (
                    <div className="rewards-tier-table-wrap is-skeleton" aria-hidden="true" />
                ) : (
                    <div className="rewards-tier-table-wrap">
                        <table className="rewards-tier-table">
                            <thead>
                                <tr>
                                    <td className="rewards-tier-metric" aria-hidden="true" />
                                    {tiers.map((tier, index) => (
                                        <th
                                            key={tier.name}
                                            scope="col"
                                            className={tier.name === currentTierName ? 'is-current' : ''}
                                        >
                                            <span
                                                className={`rewards-tier-trophy ${trophyClassByIndex[index] ?? ''}`}
                                                aria-hidden="true"
                                            >
                                                <FontAwesomeIcon icon={faTrophy} />
                                            </span>
                                            <span className="rewards-tier-name">{tier.name}</span>
                                            {tier.name === currentTierName && (
                                                <span className="rewards-tier-current">Your current tier</span>
                                            )}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <th scope="row" className="rewards-tier-metric">Cashback</th>
                                    {tiers.map((tier) => (
                                        <td
                                            key={tier.name}
                                            className={`rewards-tier-rate${tier.name === currentTierName ? ' is-current' : ''}`}
                                        >
                                            {tier.ratePercent}%
                                        </td>
                                    ))}
                                </tr>
                                <tr>
                                    <th scope="row" className="rewards-tier-metric">Lifetime spend</th>
                                    {tiers.map((tier) => (
                                        <td
                                            key={tier.name}
                                            className={tier.name === currentTierName ? 'is-current' : ''}
                                        >
                                            {tier.minLifetimeSpent > 0 ? `from $${tier.minLifetimeSpent.toFixed(0)}` : '—'}
                                        </td>
                                    ))}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="container rewards-page-section">
                <div className="rewards-page-heading">
                    <h2>How it works</h2>
                    <p className="muted">Three steps from purchase to payoff.</p>
                </div>
                <div className="rewards-page-steps">
                    {steps.map((step) => (
                        <div key={step.title} className="rewards-page-step">
                            <span className="rewards-page-step-icon" aria-hidden="true">
                                <FontAwesomeIcon icon={step.icon} />
                            </span>
                            <h3>{step.title}</h3>
                            <p className="muted">{step.text}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Дрейфующие глифы на фоне — фирменный приём (см. effects.css), не копия конкурента. */}
            <section className="container rewards-page-section rewards-page-faq-section">
                <div className="rewards-faq-float" aria-hidden="true">
                    <span className="rewards-float is-f1"><FontAwesomeIcon icon={faGamepad} /></span>
                    <span className="rewards-float is-f2"><FontAwesomeIcon icon={faCoins} /></span>
                    <span className="rewards-float is-f3"><FontAwesomeIcon icon={faTrophy} /></span>
                    <span className="rewards-float is-f4"><FontAwesomeIcon icon={faStar} /></span>
                </div>
                <div className="rewards-page-heading">
                    <h2>Frequently asked questions</h2>
                </div>
                <div className="rewards-faq-list">
                    {faq.map((item, index) => (
                        <div key={item.question} className={`rewards-faq-item${openFaqIndex === index ? ' is-open' : ''}`}>
                            <button
                                type="button"
                                className="rewards-faq-trigger"
                                aria-expanded={openFaqIndex === index}
                                onClick={() => setOpenFaqIndex((prev) => (prev === index ? -1 : index))}
                            >
                                <span>{item.question}</span>
                                <FontAwesomeIcon icon={faChevronDown} />
                            </button>
                            {openFaqIndex === index && (
                                <div className="rewards-faq-answer muted">{item.answer}</div>
                            )}
                        </div>
                    ))}
                </div>
            </section>

            <section className="container rewards-page-section">
                <div className="rewards-page-cta">
                    <div>
                        <h3>New here? Start with 10% off</h3>
                        <p className="muted">Use code <strong>WELCOME10</strong> on your first order — then start earning cashback.</p>
                    </div>
                    <Link to="/games" className="btn btn-primary">
                        Browse games
                        <FontAwesomeIcon icon={faArrowRight} />
                    </Link>
                </div>
            </section>
        </div>
    );
};

export default RewardsPage;
