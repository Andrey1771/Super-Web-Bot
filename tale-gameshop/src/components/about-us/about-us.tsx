import React from "react";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
    faBolt,
    faCircleCheck,
    faClock,
    faHeadset,
    faLayerGroup,
    faLifeRing,
    faRotateLeft,
    faShieldHalved,
    faStar
} from "@fortawesome/free-solid-svg-icons";
import {Link} from "react-router-dom";
import "./about-us.css";

const featurePills = [
    {
        title: "Secure checkout",
        description: "Encrypted payments to protect every transaction.",
        icon: faShieldHalved
    },
    {
        title: "Instant delivery",
        description: "Digital keys sent right after purchase.",
        icon: faBolt
    },
    {
        title: "Curated picks",
        description: "Top titles selected by passionate gamers.",
        icon: faLayerGroup
    },
    {
        title: "Support 24/7",
        description: "Real people ready to help around the clock.",
        icon: faHeadset
    }
];

const ratingHighlights = [
    "Dedicated support with real-time help",
    "Best prices on top-rated titles",
    "Instant digital deliveries worldwide"
];

// Разбивка оценок — согласована со средним 4.6/5.
const ratingBreakdown = [
    { stars: 5, percent: 72 },
    { stars: 4, percent: 19 },
    { stars: 3, percent: 6 },
    { stars: 2, percent: 2 },
    { stars: 1, percent: 1 }
];

// Цифры масштаба/охвата — не дублируют рейтинг-карточку, а расширяют историю бренда.
const purposeStats = [
    { value: "2020", label: "Founded" },
    { value: "5,000+", label: "Games curated" },
    { value: "40+", label: "Countries served" },
    { value: "50k+", label: "Keys delivered" }
];

// Принципы, а не перечень фич: каждый ведёт на реальное доказательство (каталог, документ, безопасность).
const principles = [
    {
        title: "Player-first curation",
        description: "We stock games worth your time — handpicked by people who play, not dumped in bulk.",
        icon: faLayerGroup,
        link: { to: "/games", label: "Browse the catalog" }
    },
    {
        title: "Security you can see",
        description: "Two-factor auth, backup codes, and an account-recovery process we publish in full.",
        icon: faShieldHalved,
        link: { to: "/support/docs/account-recovery", label: "How recovery works" }
    },
    {
        title: "Fair and upfront",
        description: "Refund rules and region details are shown before you buy — never sprung on you after.",
        icon: faRotateLeft,
        link: { to: "/support/docs/refund-policy", label: "Refund policy" }
    },
    {
        title: "Support by real players",
        description: "Gamers answering chat and email in minutes, with no scripted runaround.",
        icon: faHeadset,
        link: { to: "/support", label: "Visit support" }
    }
];

const journey = [
    {
        year: "2020",
        title: "Tale Shop opens",
        description: "We launched with a mission to make digital game buying fast and trustworthy."
    },
    {
        year: "2021",
        title: "Global catalog",
        description: "Expanded to worldwide publishers and added secure multi-currency checkout."
    },
    {
        year: "2022",
        title: "Community focus",
        description: "Introduced verified reviews and personalized recommendations for players."
    },
    {
        year: "2024",
        title: "Faster delivery",
        description: "Optimized instant email delivery and 24/7 support with sub-5 minute replies."
    },
    {
        year: "2026",
        title: "Account security first",
        description: "Rolled out two-factor authentication, backup codes, and a transparent account recovery process."
    }
];

const teamMembers = [
    {
        badge: "Support",
        name: "Alex Carter",
        role: "Lead Support Specialist",
        description: "Helps customers resolve issues quickly with accurate, friendly guidance.",
        avatarInitial: "A"
    },
    {
        badge: "Success",
        name: "Jamie Lee",
        role: "Customer Success",
        description: "Ensures every purchase feels smooth, safe, and supported end-to-end.",
        avatarInitial: "J"
    },
    {
        badge: "Operations",
        name: "Morgan Patel",
        role: "Service Operations",
        description: "Monitors delivery quality and keeps response times under five minutes.",
        avatarInitial: "M"
    },
    {
        badge: "Partnerships",
        name: "Taylor Smith",
        role: "Partner Relations",
        description: "Builds trusted publisher relationships and maintains verified inventories.",
        avatarInitial: "T"
    }
];

// Ссылки живые: центр поддержки и реальные документы (включая восстановление доступа).
const supportCards = [
    {
        title: "Support that actually helps",
        description: "Real people with gaming expertise, ready to resolve any issue.",
        icon: faHeadset,
        items: [
            { label: "Open the support center", to: "/support" },
            { label: "Account recovery & 2FA", to: "/support/docs/account-recovery" }
        ]
    },
    {
        title: "Policies & safety",
        description: "Clear guidelines to keep your purchases safe and transparent.",
        icon: faLifeRing,
        items: [
            { label: "Refund policy", to: "/support/docs/refund-policy" },
            { label: "Regional restrictions", to: "/support/docs/regional-restrictions" }
        ]
    }
];

export default function AboutUs() {
    return (
        <div className="about-hero-wrapper" id="about-top">
            <div className="container py-14 lg:py-20">
                <div className="grid lg:grid-cols-2 gap-12 xl:gap-16 lg:items-center">
                    <div className="space-y-8">
                        <div className="space-y-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-purple-600">ABOUT TALE SHOP</p>
                            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-tight">About Us</h1>
                            <p className="text-lg text-slate-600 max-w-2xl">We believe games should be easy to discover, simple to buy, and unforgettable to play. Tale Shop curates beloved titles, keeps checkout effortless, and supports every player long after purchase.</p>
                        </div>

                        <div className="flex flex-wrap gap-4">
                            <Link to="/games" className="btn btn-primary px-6 about-btn-primary">Go to Store</Link>
                            <Link to="/support" className="btn btn-outline px-6 about-btn-outline">Contact Support</Link>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-4">
                            {featurePills.map((feature) => (
                                <div key={feature.title} className="about-pill">
                                    <span className="about-pill-icon">
                                        <FontAwesomeIcon icon={feature.icon}/>
                                    </span>
                                    <div className="space-y-1">
                                        <p className="text-sm font-semibold text-slate-900">{feature.title}</p>
                                        <p className="text-sm text-slate-600 leading-relaxed">{feature.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="about-rating-card">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm font-semibold text-slate-500 uppercase tracking-[0.12em]">Customer rating</p>
                                <p className="text-5xl font-extrabold text-slate-900 about-score-value">4.6<span className="text-2xl text-slate-500">/5</span></p>
                                <div className="about-stars" role="img" aria-label="Rated 4.6 out of 5">
                                    <div className="about-stars-bg" aria-hidden="true">
                                        {Array.from({length: 5}).map((_, index) => (
                                            <FontAwesomeIcon key={index} icon={faStar}/>
                                        ))}
                                    </div>
                                    <div className="about-stars-fill" style={{width: "92%"}} aria-hidden="true">
                                        {Array.from({length: 5}).map((_, index) => (
                                            <FontAwesomeIcon key={index} icon={faStar}/>
                                        ))}
                                    </div>
                                </div>
                                <p className="text-sm text-slate-500">Based on 2,300 reviews</p>
                            </div>
                            <div className="about-score-badge">
                                <FontAwesomeIcon icon={faCircleCheck} className="text-purple-600"/>
                                <div>
                                    <p className="text-sm font-semibold text-slate-900 leading-tight">Verified purchases</p>
                                    <p className="text-xs text-slate-500">Real customers. Real feedback.</p>
                                </div>
                            </div>
                        </div>

                        <div className="about-rating-breakdown" aria-label="Rating distribution">
                            {ratingBreakdown.map((row) => (
                                <div key={row.stars} className="about-breakdown-row">
                                    <span className="about-breakdown-stars">{row.stars}★</span>
                                    <div className="about-breakdown-bar">
                                        <span style={{width: `${row.percent}%`}}/>
                                    </div>
                                    <span className="about-breakdown-value">{row.percent}%</span>
                                </div>
                            ))}
                        </div>

                        <div className="about-verification-banner">
                            <span className="about-banner-icon">
                                <FontAwesomeIcon icon={faShieldHalved}/>
                            </span>
                            <div>
                                <p className="text-sm font-semibold text-slate-900">Trusted store guarantee</p>
                                <p className="text-sm text-slate-600">Every order is protected from checkout to delivery.</p>
                            </div>
                        </div>

                        <ul className="space-y-2">
                            {ratingHighlights.map((item) => (
                                <li key={item} className="flex items-start gap-3 text-sm text-slate-700">
                                    <span className="about-list-icon">
                                        <FontAwesomeIcon icon={faCircleCheck}/>
                                    </span>
                                    <span className="leading-relaxed">{item}</span>
                                </li>
                            ))}
                        </ul>

                        <div className="about-meta-row">
                            <div>
                                <p className="text-xs text-slate-500 uppercase tracking-[0.12em]">Response time</p>
                                <p className="text-base font-semibold text-slate-900 flex items-center gap-2"><FontAwesomeIcon icon={faClock} className="text-purple-600"/>Under 5 minutes</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 uppercase tracking-[0.12em]">Coverage</p>
                                <p className="text-base font-semibold text-slate-900">Global digital delivery</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Тёмный центр страницы: цель бренда + mission/vision + цифры масштаба одним акцентом. */}
                <section className="about-purpose">
                    <div className="about-purpose-copy">
                        <span className="about-purpose-eyebrow">Our purpose</span>
                        <h2 className="about-purpose-title">Games should be easy to find, safe to buy, and yours to keep.</h2>
                        <p className="about-purpose-lead">
                            Tale Shop started with a simple frustration: buying PC games online meant sketchy resellers,
                            hidden region locks, and support that vanished after checkout. So we built the store we wanted —
                            curated, secure, and honest from the first click to long after the download finishes.
                        </p>
                        <div className="about-purpose-points">
                            <div className="about-purpose-point">
                                <span className="about-purpose-point-label">Mission</span>
                                <p>Connect players with games they&rsquo;ll love — minus the friction and the fine print.</p>
                            </div>
                            <div className="about-purpose-point">
                                <span className="about-purpose-point-label">Vision</span>
                                <p>Become the digital game store players genuinely trust, everywhere we operate.</p>
                            </div>
                        </div>
                    </div>
                    <div className="about-purpose-stats">
                        {purposeStats.map((stat) => (
                            <div key={stat.label} className="about-purpose-stat">
                                <span className="about-purpose-stat-value">{stat.value}</span>
                                <span className="about-purpose-stat-label">{stat.label}</span>
                            </div>
                        ))}
                    </div>
                </section>

                <div className="about-section">
                    <div className="about-section-header">
                        <span className="about-label">What we stand for</span>
                        <h2 className="about-section-title">Principles we don&rsquo;t cut corners on.</h2>
                        <p className="about-section-subtitle">Four commitments that shape every part of the store — each one you can check for yourself.</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 lg:gap-6">
                        {principles.map((item) => (
                            <div key={item.title} className="about-principle-card">
                                <div className="about-principle-icon">
                                    <FontAwesomeIcon icon={item.icon}/>
                                </div>
                                <div className="about-principle-body">
                                    <p className="about-principle-title">{item.title}</p>
                                    <p className="about-principle-text">{item.description}</p>
                                    <Link className="about-link" to={item.link.to}>{item.link.label} →</Link>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="about-section">
                    <div className="about-section-header">
                        <span className="about-label">Our journey</span>
                        <h2 className="about-section-title">How the store grew, year by year.</h2>
                        <p className="about-section-subtitle">We keep improving how you discover, buy, and protect your games.</p>
                    </div>

                    <div className="about-timeline">
                        {journey.map((step, index) => (
                            <div key={step.year} className="about-timeline-row">
                                <div className="about-timeline-year">{step.year}</div>
                                <div className="about-timeline-line">
                                    <span className="about-timeline-dot" aria-hidden="true"/>
                                    {index !== journey.length - 1 && <span className="about-timeline-connector" aria-hidden="true"/>}
                                </div>
                                <div className="about-timeline-body">
                                    <h4 className="text-base font-semibold text-slate-900">{step.title}</h4>
                                    <p className="text-sm text-slate-600 leading-relaxed">{step.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="about-section">
                    <div className="about-section-header">
                        <span className="about-label">Meet the team</span>
                        <h2 className="about-section-title">People who keep Tale Shop personal, secure, and responsive.</h2>
                        <p className="about-section-subtitle">From support to partnerships, our team is dedicated to making every purchase feel effortless.</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-5 lg:gap-6">
                        {teamMembers.map((member) => (
                            <div key={member.name} className="about-team-card">
                                <div className="space-y-2">
                                    <span className="about-team-badge">{member.badge}</span>
                                    <h3 className="text-xl font-bold text-slate-900">{member.name}</h3>
                                    <p className="text-sm font-semibold text-purple-700">{member.role}</p>
                                    <p className="text-sm text-slate-600 leading-relaxed">{member.description}</p>
                                </div>
                                <div className="about-team-avatar" aria-hidden="true">{member.avatarInitial}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="about-section">
                    <div className="about-section-header">
                        <span className="about-label">Support & transparency</span>
                        <h2 className="about-section-title">Help when you need it and policies that keep you protected.</h2>
                        <p className="about-section-subtitle">Straightforward support options and clear guidelines so you always know what to expect.</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-5 lg:gap-6">
                        {supportCards.map((card) => (
                            <div key={card.title} className="about-support-card">
                                <div className="about-support-icon">
                                    <FontAwesomeIcon icon={card.icon}/>
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-xl font-bold text-slate-900">{card.title}</h3>
                                    <p className="text-sm text-slate-600 leading-relaxed">{card.description}</p>
                                    <ul className="space-y-2">
                                        {card.items.map((item) => (
                                            <li key={item.label} className="about-support-item">
                                                <span className="about-support-dot">
                                                    <FontAwesomeIcon icon={faCircleCheck}/>
                                                </span>
                                                <Link className="about-link" to={item.to}>{item.label}</Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="about-final-section">
                    <div className="about-final-cta">
                        <div className="about-final-content">
                            <div className="space-y-3">
                                <h2 className="about-final-title">Ready to explore the Store?</h2>
                                <p className="about-final-subtitle">Browse curated PC games and weekly deals in minutes.</p>
                                <p className="about-final-meta">Instant email delivery • Secure checkout</p>
                            </div>
                            <Link to="/games" className="btn btn-primary about-final-button">Go to Store</Link>
                        </div>
                    </div>

                    <div className="about-final-row">
                        <a className="about-back-top" href="#about-top">Back to top ↗</a>
                    </div>
                </div>
            </div>
        </div>
    );
}
