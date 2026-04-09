import React from 'react';

type CatalogPostSectionsProps = {
    onMostPopularClick: () => void;
    onViewDealsClick: () => void;
};

const trustHighlights = [
    {
        title: 'Secure checkout',
        subtitle: 'Encrypted payment flow',
        icon: (
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#6b3ff2]" fill="none" aria-hidden="true">
                <path d="M6 10V7a6 6 0 1 1 12 0v3" stroke="currentColor" strokeWidth="1.6" />
                <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
            </svg>
        )
    },
    {
        title: 'Instant key delivery',
        subtitle: 'Sent right after payment',
        icon: (
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#6b3ff2]" fill="none" aria-hidden="true">
                <path d="M5 12h7m0 0-2.4-2.4M12 12l-2.4 2.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M14 7h5l1 5h-6V7Z" stroke="currentColor" strokeWidth="1.6" />
            </svg>
        )
    },
    {
        title: 'Refund policy',
        subtitle: 'Clear terms for valid cases',
        icon: (
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#6b3ff2]" fill="none" aria-hidden="true">
                <path d="M8 8h8M8 12h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <rect x="5" y="4" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
            </svg>
        )
    },
    {
        title: '24/7 support',
        subtitle: 'Help when you need it',
        icon: (
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#6b3ff2]" fill="none" aria-hidden="true">
                <path d="M4 11a8 8 0 1 1 16 0v5a3 3 0 0 1-3 3h-1" stroke="currentColor" strokeWidth="1.6" />
                <path d="M7 11h2v4H7a3 3 0 0 1-3-3v-1a3 3 0 0 1 3-3Z" stroke="currentColor" strokeWidth="1.6" />
            </svg>
        )
    }
];

const buyingSteps = [
    {
        title: 'Choose a game',
        description: 'Use search, filters, and sorting to find a title that fits your budget and platform.'
    },
    {
        title: 'Pay securely',
        description: 'Complete checkout with encrypted payment processing and transparent pricing.'
    },
    {
        title: 'Get your key instantly',
        description: 'Your digital key arrives right after payment so you can activate and play without delay.'
    }
];

const CatalogPostSections: React.FC<CatalogPostSectionsProps> = ({ onMostPopularClick, onViewDealsClick }) => {
    return (
        <>
            <section className="mt-12">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {trustHighlights.map((highlight) => (
                        <div
                            key={highlight.title}
                            className="rounded-[16px] border border-[#ece8ff] bg-white/90 px-4 py-3 shadow-[0_10px_20px_rgba(108,85,164,0.08)]"
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#f2edff]">
                                    {highlight.icon}
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-[#2b2350]">{highlight.title}</p>
                                    <p className="text-xs text-[#6f64a8]">{highlight.subtitle}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mt-10 rounded-[22px] border border-[#ece8ff] bg-white/90 p-6 shadow-[0_18px_36px_rgba(108,85,164,0.14)]">
                <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr] lg:items-start">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7b72ab]">Player feedback</p>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                            <span className="text-3xl font-semibold leading-none text-[#2b2350]">4.8</span>
                            <div className="flex items-center gap-1 text-[#6b3ff2]">
                                {Array.from({ length: 5 }).map((_, index) => (
                                    <svg key={`rating-star-${index}`} viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                                        <path d="m10 15-5.878 3.09 1.122-6.545L.488 6.91 6.06 6.1 10 0l3.94 6.1 5.572.81-4.756 4.635 1.122 6.545L10 15Z" />
                                    </svg>
                                ))}
                            </div>
                            <span className="text-sm text-[#6f64a8]">8,536 reviews</span>
                        </div>
                        <p className="mt-3 text-sm text-[#6f64a8]">Consistent feedback on quick delivery, fair pricing, and a checkout flow that feels reliable.</p>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                            {[
                                {
                                    name: 'Mat S.',
                                    initial: 'M',
                                    review: 'Awesome selection of PC games and super fast delivery!'
                                },
                                {
                                    name: 'Alex R.',
                                    initial: 'A',
                                    review: 'Great deals and instant keys, perfect for hassle-free gaming.'
                                }
                            ].map((review) => (
                                <article key={review.name} className="rounded-[16px] border border-[#efeaff] bg-white px-4 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#6b3ff2] text-sm font-semibold text-white">
                                            {review.initial}
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-[#2b2350]">{review.name}</p>
                                            <div className="flex items-center gap-0.5 text-[#6b3ff2]">
                                                {Array.from({ length: 5 }).map((_, index) => (
                                                    <svg key={`${review.name}-star-${index}`} viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                                                        <path d="m10 15-5.878 3.09 1.122-6.545L.488 6.91 6.06 6.1 10 0l3.94 6.1 5.572.81-4.756 4.635 1.122 6.545L10 15Z" />
                                                    </svg>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <p className="mt-3 text-sm text-[#6f64a8]">{review.review}</p>
                                </article>
                            ))}
                        </div>
                    </div>

                    <aside className="rounded-[16px] border border-[#efeaff] bg-[#fbf9ff] p-4">
                        <p className="text-sm font-semibold text-[#2b2350]">Rating breakdown</p>
                        <div className="mt-3 space-y-2.5">
                            {[
                                { label: '5', value: 78 },
                                { label: '4', value: 15 },
                                { label: '3', value: 5 },
                                { label: '2', value: 1 },
                                { label: '1', value: 1 }
                            ].map((rating) => (
                                <div key={rating.label} className="flex items-center gap-3 text-sm text-[#6f64a8]">
                                    <span className="w-4 text-right font-semibold text-[#2b2350]">{rating.label}</span>
                                    <div className="flex flex-1 items-center gap-2">
                                        <div className="h-2 flex-1 rounded-full bg-[#e6e1ff]">
                                            <div className="h-2 rounded-full bg-[#6b3ff2]" style={{ width: `${rating.value}%` }} />
                                        </div>
                                        <span className="w-8 text-right text-xs">{rating.value}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </aside>
                </div>
            </section>

            <section className="mt-10 rounded-[22px] border border-[#ece8ff] bg-[#fcfbff] p-6 shadow-[0_14px_28px_rgba(108,85,164,0.1)]">
                <div className="max-w-xl">
                    <h2 className="text-2xl font-semibold text-[#2b2350]">How it works</h2>
                    <p className="mt-2 text-sm text-[#6f64a8]">A simple checkout flow built for digital PC keys.</p>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                    {buyingSteps.map((step, index) => (
                        <article key={step.title} className="rounded-[16px] border border-[#efeaff] bg-white p-4">
                            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[#f0ebff] px-2 text-xs font-semibold text-[#5a2dd1]">
                                {index + 1}
                            </span>
                            <h3 className="mt-3 text-base font-semibold text-[#2b2350]">{step.title}</h3>
                            <p className="mt-2 text-sm text-[#6f64a8]">{step.description}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className="mt-12 overflow-hidden rounded-[24px] border border-[#ebe4ff]">
                <div className="relative rounded-[24px] bg-[linear-gradient(145deg,#1d1734_0%,#3f2b71_52%,#271b47_100%)] px-6 py-10 text-center text-white shadow-[0_24px_48px_rgba(20,15,50,0.3)]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.2),transparent_50%)]" aria-hidden="true" />
                    <div className="relative z-10 mx-auto max-w-2xl">
                        <h2 className="text-3xl font-semibold md:text-4xl">Still choosing?</h2>
                        <p className="mt-3 text-base text-white/80">Browse active deals or jump straight to the most popular picks in this catalog.</p>
                        <div className="mt-6 flex flex-wrap justify-center gap-3">
                            <button
                                type="button"
                                className="rounded-[12px] bg-[#6b3ff2] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(107,63,242,0.35)] transition hover:brightness-110"
                                onClick={onMostPopularClick}
                            >
                                Most Popular
                            </button>
                            <button
                                type="button"
                                className="rounded-[12px] border border-white/40 bg-white/90 px-6 py-2.5 text-sm font-semibold text-[#3d2f74] shadow-[0_10px_20px_rgba(12,10,30,0.2)] transition hover:bg-white"
                                onClick={onViewDealsClick}
                            >
                                View Deals
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <section className="mt-8">
                <p className="text-center text-sm text-[#6f64a8]">
                    Digital PC keys, instant delivery, and secure checkout — designed for a smooth purchase from browse to activation.
                </p>
            </section>
        </>
    );
};

export default CatalogPostSections;
