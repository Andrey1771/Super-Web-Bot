import React from "react";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
    faBolt,
    faCircleCheck,
    faCreditCard,
    faClock,
    faEnvelopeOpenText,
    faHeadset,
    faLayerGroup,
    faLifeRing,
    faRotateLeft,
    faShieldHalved,
    faTags,
    faTimeline,
    faTruckFast
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
        icon: faEnvelopeOpenText
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

const highlights = [
    {
        title: "Instant delivery",
        description: "Game keys emailed to you moments after checkout, no waiting required.",
        icon: faTruckFast
    },
    {
        title: "Secure checkout",
        description: "Protected payments with encrypted processing and trusted gateways.",
        icon: faCreditCard
    },
    {
        title: "Refund policy",
        description: "Clear, fair refunds so you can buy with confidence every time.",
        icon: faRotateLeft
    },
    {
        title: "Verified purchases",
        description: "Authentic games from verified partners with proof of purchase.",
        icon: faCircleCheck
    }
];

const whatWeDoCards = [
    {
        badge: "Curated",
        title: "Curated catalog",
        description: "We handpick beloved titles and hidden gems so you can discover faster.",
        icon: faLayerGroup,
        link: "#"
    },
    {
        badge: "Deals",
        title: "Weekly deals",
        description: "Fresh discounts every week with limited-time offers on top franchises.",
        icon: faTags,
        link: "#"
    },
    {
        badge: "Support",
        title: "Friendly support",
        description: "Real people ready to help via chat or email whenever you need it.",
        icon: faHeadset,
        link: "#"
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
    }
];

const statsStrip = [
    {
        label: "2,300+ reviews",
        icon: faTimeline
    },
    {
        label: "Instant email delivery",
        icon: faEnvelopeOpenText
    },
    {
        label: "24/7 support",
        icon: faHeadset
    },
    {
        label: "Secure payments",
        icon: faShieldHalved
    }
];

const achievements = [
    {
        title: "Trusted store",
        description: "We’re built on verified suppliers, authentic keys, and secure delivery.",
        icon: faShieldHalved
    },
    {
        title: "Fast delivery",
        description: "Instant email delivery for keys so you can start playing right away.",
        icon: faBolt
    },
    {
        title: "Curated picks",
        description: "Collections crafted by gamers to surface the best experiences for you.",
        icon: faLayerGroup
    },
    {
        title: "Verified purchases",
        description: "Transparency on every order with proof of purchase and trusted partners.",
        icon: faCircleCheck
    }
];

const teamMembers = [
    {
        badge: "Support store",
        name: "Alex Carter",
        role: "Lead Support Specialist",
        description: "Helps customers resolve issues quickly with accurate, friendly guidance.",
        avatarInitial: "A"
    },
    {
        badge: "Support",
        name: "Jamie Lee",
        role: "Customer Success",
        description: "Ensures every purchase feels smooth, safe, and supported end-to-end.",
        avatarInitial: "J"
    },
    {
        badge: "Support care",
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

const supportCards = [
    {
        title: "Support that actually helps",
        description: "Real people with gaming expertise, ready to resolve any issue.",
        icon: faHeadset,
        items: ["24/7 chat support", "Email delivery help"]
    },
    {
        title: "Policies & safety",
        description: "Clear guidelines to keep your purchases safe and transparent.",
        icon: faLifeRing,
        items: ["Terms & conditions", "Privacy policy"]
    }
];

const trustItems = [
    {
        title: "Secure checkout",
        icon: faShieldHalved,
        description: "Protected payments every step of the way."
    },
    {
        title: "Instant email delivery",
        icon: faEnvelopeOpenText,
        description: "Game keys land in your inbox in minutes."
    },
    {
        title: "Refund policy",
        icon: faRotateLeft,
        description: "Fair returns so you can shop with confidence."
    },
    {
        title: "Verified purchases",
        icon: faCircleCheck,
        description: "Authentic games sourced from trusted partners."
    }
];

export default function AboutUs() {
    return (
        <div className="about-hero-wrapper" id="about-top">
            <div className="container py-14 lg:py-20">
                <div className="grid lg:grid-cols-2 gap-12 xl:gap-16 items-start">
                    <div className="space-y-8">
                        <div className="space-y-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-purple-600">ABOUT TALE SHOP</p>
                            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-tight">About Us</h1>
                            <p className="text-lg text-slate-600 max-w-2xl">We believe games should be easy to discover, simple to buy, and unforgettable to play. Tale Shop curates beloved titles, keeps checkout effortless, and supports every player long after purchase.</p>
                        </div>

                        <div className="flex flex-wrap gap-4">
                            <Link to="/" className="btn btn-primary px-6 about-btn-primary">Go to Store</Link>
                            <a href="mailto:support@taleshop.com" className="btn btn-outline px-6 about-btn-outline">Contact Support</a>
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
                                <p className="text-5xl font-extrabold text-slate-900 mt-3 mb-2">4.6<span className="text-2xl text-slate-500">/5</span></p>
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

                        <div className="about-verification-banner">
                            <span className="about-banner-icon">
                                <FontAwesomeIcon icon={faShieldHalved}/>
                            </span>
                            <div>
                                <p className="text-sm font-semibold text-slate-900">Trusted store guarantee</p>
                                <p className="text-sm text-slate-600">Every order is protected from checkout to delivery.</p>
                            </div>
                        </div>

                        <ul className="space-y-3">
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

                <div className="grid md:grid-cols-2 gap-6 xl:gap-8 mt-14">
                    <div className="about-story-card">
                        <span className="about-card-badge">Mission</span>
                        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-3">Connecting players with the games they love</h2>
                        <p className="text-base text-slate-600 leading-relaxed">We make discovering, purchasing, and enjoying games effortless. Our team curates the most engaging experiences and backs every order with reliable support so you can focus on playing.</p>
                    </div>
                    <div className="about-story-card">
                        <span className="about-card-badge">Vision</span>
                        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-3">Building the most trusted digital game shop</h2>
                        <p className="text-base text-slate-600 leading-relaxed">Tale Shop is crafting a store that feels personal, secure, and instantly rewarding—offering verified deals, rapid delivery, and a community-first approach for gamers everywhere.</p>
                    </div>
                </div>

                <div className="about-section">
                    <div className="about-section-header">
                        <span className="about-label">Highlights</span>
                        <h2 className="about-section-title">What makes Tale Shop a reliable place to buy PC games.</h2>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 lg:gap-6">
                        {highlights.map((item) => (
                            <div key={item.title} className="about-highlight-card">
                                <div className="about-highlight-icon">
                                    <FontAwesomeIcon icon={item.icon}/>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-base font-semibold text-slate-900">{item.title}</p>
                                    <p className="text-sm text-slate-600 leading-relaxed">{item.description}</p>
                                    <a className="about-link" href="#">Details</a>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="about-section">
                    <div className="about-section-header">
                        <h2 className="about-section-title">What we do</h2>
                        <p className="about-section-subtitle">Trusted catalog, fair prices, and real people ready to help when you need it most.</p>
                    </div>

                    <div className="grid lg:grid-cols-3 gap-5">
                        {whatWeDoCards.map((card) => (
                            <div key={card.title} className="about-story-card about-do-card">
                                <span className="about-card-badge">{card.badge}</span>
                                <div className="about-card-icon">
                                    <FontAwesomeIcon icon={card.icon}/>
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 mb-2">{card.title}</h3>
                                <p className="text-sm text-slate-600 leading-relaxed mb-3">{card.description}</p>
                                <a className="about-link" href={card.link}>Details</a>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="about-section">
                    <div className="about-section-header">
                        <h2 className="about-section-title">Our Journey</h2>
                        <p className="about-section-subtitle">We keep improving how you discover and enjoy digital games.</p>
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

                <div className="about-stats-strip">
                    {statsStrip.map((item) => (
                        <div key={item.label} className="about-stat-item">
                            <span className="about-stat-icon">
                                <FontAwesomeIcon icon={item.icon}/>
                            </span>
                            <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                        </div>
                    ))}
                </div>

                <div className="about-section">
                    <div className="about-section-header">
                        <span className="about-label">Our Achievements</span>
                        <h2 className="about-section-title">Recognition built on trust, speed, and curated experiences.</h2>
                        <p className="about-section-subtitle">We focus on what matters most for players: authentic keys, fast delivery, and a store you can rely on.</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 lg:gap-6">
                        {achievements.map((item) => (
                            <div key={item.title} className="about-achievement-card">
                                <span className="about-achievement-icon">
                                    <FontAwesomeIcon icon={item.icon}/>
                                </span>
                                <div className="space-y-1">
                                    <p className="text-base font-semibold text-slate-900">{item.title}</p>
                                    <p className="text-sm text-slate-600 leading-relaxed">{item.description}</p>
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
                        <span className="about-label">Support & Transparency</span>
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
                                            <li key={item} className="about-support-item">
                                                <span className="about-support-dot">
                                                    <FontAwesomeIcon icon={faCircleCheck}/>
                                                </span>
                                                <span className="text-sm text-slate-700">{item}</span>
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
                            <Link to="/" className="btn btn-primary about-final-button">Go to Store</Link>
                        </div>
                    </div>

                    <div className="about-final-row">
                        <p className="about-final-label">Trusted payment &amp; delivery</p>
                        <a className="about-back-top" href="#about-top">Back to top ↗</a>
                    </div>

                    <div className="about-trust-grid">
                        {trustItems.map((item) => (
                            <div key={item.title} className="about-trust-item">
                                <span className="about-trust-icon">
                                    <FontAwesomeIcon icon={item.icon}/>
                                </span>
                                <div className="space-y-1">
                                    <p className="text-base font-semibold text-slate-900">{item.title}</p>
                                    <p className="text-sm text-slate-600 leading-relaxed">{item.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
