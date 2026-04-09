import React, { useEffect, useMemo, useRef, useState } from 'react';

type CatalogPostSectionsProps = {
    onMostPopularClick: () => void;
    onViewDealsClick: () => void;
    onUnderHundredClick: () => void;
    onPriceAscClick: () => void;
    onBiggestDiscountsClick: () => void;
    onQuickCategoryClick: (category: string) => void;
    quickCategoryOptions: string[];
};

const trustItems = [
    {
        label: 'Secure checkout',
        icon: (
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
                <rect x="4" y="8" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M7 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
        )
    },
    {
        label: 'Instant key delivery',
        icon: (
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
                <path d="M4 10h7m0 0-2-2m2 2-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M12 6h3l1 4h-4V6Z" stroke="currentColor" strokeWidth="1.5" />
            </svg>
        )
    },
    {
        label: 'Refund policy',
        icon: (
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
                <rect x="4" y="3" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M7 7h6M7 10h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
        )
    },
    {
        label: '24/7 support',
        icon: (
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
                <path d="M3 9a7 7 0 1 1 14 0v3a2 2 0 0 1-2 2h-1" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5.5 9h2v4h-2a2 2 0 0 1-2-2v-.5a1.5 1.5 0 0 1 1.5-1.5Z" stroke="currentColor" strokeWidth="1.5" />
            </svg>
        )
    }
];

const testimonialItems = [
    { name: 'Mat S.', initial: 'M', text: 'Smooth checkout, key arrived in under a minute.', tag: 'Action fan' },
    { name: 'Eva T.', initial: 'E', text: 'Used filters + sorting and found a better deal quickly.', tag: 'Budget buyer' },
    { name: 'Chris L.', initial: 'C', text: 'Catalog feels clean: compare prices, buy, activate.', tag: 'RPG player' },
    { name: 'Nora P.', initial: 'N', text: 'No friction. Added to cart, paid, got my key instantly.', tag: 'Weekend gamer' },
    { name: 'Leo M.', initial: 'L', text: 'Discount-only shortcut is super useful when browsing.', tag: 'Deal hunter' },
    { name: 'Sam R.', initial: 'S', text: 'Exactly what I need from a store catalog: fast and clear.', tag: 'PC gamer' }
];

const CatalogPostSections: React.FC<CatalogPostSectionsProps> = ({
    onMostPopularClick,
    onViewDealsClick,
    onUnderHundredClick,
    onPriceAscClick,
    onBiggestDiscountsClick,
    onQuickCategoryClick,
    quickCategoryOptions
}) => {
    const railRef = useRef<HTMLDivElement | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [touchStartX, setTouchStartX] = useState<number | null>(null);

    const quickPicks = useMemo(
        () => [
            { label: 'Under $100', onClick: onUnderHundredClick },
            { label: 'Biggest discounts', onClick: onBiggestDiscountsClick },
            { label: 'Price: Low to High', onClick: onPriceAscClick },
            ...quickCategoryOptions.map((category) => ({
                label: category,
                onClick: () => onQuickCategoryClick(category)
            }))
        ],
        [onBiggestDiscountsClick, onPriceAscClick, onQuickCategoryClick, onUnderHundredClick, quickCategoryOptions]
    );

    useEffect(() => {
        if (isPaused || testimonialItems.length <= 1) {
            return;
        }

        const intervalId = window.setInterval(() => {
            setActiveIndex((prev) => (prev + 1) % testimonialItems.length);
        }, 3400);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [isPaused]);

    useEffect(() => {
        const rail = railRef.current;
        if (!rail) {
            return;
        }

        const card = rail.children.item(activeIndex) as HTMLElement | null;
        if (!card) {
            return;
        }

        rail.scrollTo({
            left: card.offsetLeft - 20,
            behavior: 'smooth'
        });
    }, [activeIndex]);

    const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
        setTouchStartX(event.touches[0]?.clientX ?? null);
    };

    const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
        if (touchStartX === null) {
            return;
        }

        const endX = event.changedTouches[0]?.clientX ?? touchStartX;
        const delta = touchStartX - endX;

        if (Math.abs(delta) > 35) {
            setActiveIndex((prev) => {
                if (delta > 0) {
                    return (prev + 1) % testimonialItems.length;
                }
                return (prev - 1 + testimonialItems.length) % testimonialItems.length;
            });
        }

        setTouchStartX(null);
    };

    return (
        <div className="space-y-7">
            <section
                className="rounded-[16px] border border-[#ece8ff] bg-white/90 px-4 py-3 shadow-[0_8px_20px_rgba(108,85,164,0.08)]"
                aria-label="Catalog trust highlights"
            >
                <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#2b2350]">
                    {trustItems.map((item) => (
                        <li key={item.label} className="flex items-center gap-2.5">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#f3eeff] text-[#5b30ce]">
                                {item.icon}
                            </span>
                            <span className="font-medium">{item.label}</span>
                        </li>
                    ))}
                </ul>
            </section>

            <section
                className="rounded-[20px] border border-[#e9e2ff] bg-white/95 p-5 shadow-[0_18px_32px_rgba(108,85,164,0.12)]"
                aria-label="Catalog social proof"
            >
                <div className="grid gap-4 lg:grid-cols-[1.95fr_1fr] lg:items-stretch">
                    <div className="flex h-full flex-col rounded-[16px] border border-[#f0ebff] bg-[#fefcff] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7b72ab]">Player feedback</p>
                        <h2 className="mt-2 text-xl font-semibold text-[#2b2350]">Trusted by active buyers</h2>
                        <p className="mt-1 text-sm text-[#6f64a8]">Rolling catalog reviews from shoppers who completed checkout recently.</p>

                        <div className="mt-3 flex flex-wrap items-center gap-3">
                            <span className="text-3xl font-semibold leading-none text-[#2b2350]">4.8</span>
                            <div className="flex items-center gap-1 text-[#6b3ff2]" aria-hidden="true">
                                {Array.from({ length: 5 }).map((_, index) => (
                                    <svg key={`catalog-rating-star-${index}`} viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                                        <path d="m10 15-5.878 3.09 1.122-6.545L.488 6.91 6.06 6.1 10 0l3.94 6.1 5.572.81-4.756 4.635 1.122 6.545L10 15Z" />
                                    </svg>
                                ))}
                            </div>
                            <span className="text-sm text-[#6f64a8]">8,536 reviews</span>
                        </div>
                        <div className="mt-3 inline-flex w-fit items-center gap-2 rounded-full border border-[#e5dcff] bg-white px-3 py-1 text-xs font-medium text-[#6f64a8]">
                            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#6b3ff2]" />
                            Live review rail
                        </div>

                        <div
                            className="relative mt-4"
                            onMouseEnter={() => setIsPaused(true)}
                            onMouseLeave={() => setIsPaused(false)}
                        >
                            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-white via-white/80 to-transparent" />
                            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-white via-white/80 to-transparent" />
                            <div
                                ref={railRef}
                                className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                                onTouchStart={handleTouchStart}
                                onTouchEnd={handleTouchEnd}
                            >
                                {testimonialItems.map((review, index) => (
                                    <article
                                        key={`${review.name}-${index}`}
                                        className="min-w-[82%] snap-start rounded-[14px] border border-[#ece4ff] bg-[#fcfbff] p-3 shadow-[0_8px_18px_rgba(108,85,164,0.08)] sm:min-w-[46%] lg:min-w-[31%]"
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#6b3ff2] text-xs font-semibold text-white">
                                                {review.initial}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-[#2b2350]">{review.name}</p>
                                                <p className="text-xs text-[#7b72ab]">{review.tag}</p>
                                            </div>
                                        </div>
                                        <p className="mt-2 text-sm text-[#6f64a8]">{review.text}</p>
                                    </article>
                                ))}
                            </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-1.5">
                                {testimonialItems.map((_, index) => (
                                    <span
                                        key={`rail-indicator-${index}`}
                                        className={`h-1.5 rounded-full transition-all ${
                                            index === activeIndex ? 'w-5 bg-[#6b3ff2]' : 'w-1.5 bg-[#daccff]'
                                        }`}
                                    />
                                ))}
                            </div>
                            <p className="text-xs text-[#7b72ab]">Auto-scroll pauses on hover</p>
                        </div>
                    </div>

                    <aside className="flex h-full flex-col justify-center rounded-[16px] border border-[#efeaff] bg-[#fbf9ff] p-4">
                        <p className="text-sm font-semibold text-[#2b2350]">Rating breakdown</p>
                        <p className="mt-1 text-xs text-[#7b72ab]">Distribution across verified reviews</p>
                        <div className="mt-4 space-y-2.5">
                            {[
                                { label: '5', value: 78 },
                                { label: '4', value: 15 },
                                { label: '3', value: 5 },
                                { label: '2', value: 1 },
                                { label: '1', value: 1 }
                            ].map((item) => (
                                <div key={item.label} className="flex items-center gap-3 text-sm text-[#6f64a8]">
                                    <span className="w-4 text-right font-semibold text-[#2b2350]">{item.label}</span>
                                    <div className="flex flex-1 items-center gap-2">
                                        <div className="h-2 flex-1 rounded-full bg-[#e6e1ff]">
                                            <div className="h-2 rounded-full bg-[#6b3ff2]" style={{ width: `${item.value}%` }} />
                                        </div>
                                        <span className="w-8 text-right text-xs">{item.value}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </aside>
                </div>
            </section>

            <section
                className="relative overflow-hidden rounded-[20px] border border-[#dfd1ff] bg-[linear-gradient(135deg,#fdfbff_0%,#f4ecff_50%,#efe5ff_100%)] p-5 shadow-[0_22px_38px_rgba(107,63,242,0.18)]"
                aria-label="Catalog quick actions"
            >
                <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(107,63,242,0.22)_0%,rgba(107,63,242,0)_72%)]" />
                <div className="pointer-events-none absolute -left-16 -bottom-20 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(107,63,242,0.15)_0%,rgba(107,63,242,0)_72%)]" />

                <div className="relative z-10 grid gap-4 lg:grid-cols-[1.5fr_auto] lg:items-center">
                    <div>
                        <h2 className="text-2xl font-semibold text-[#2b2350]">Still choosing?</h2>
                        <p className="mt-1 max-w-xl text-sm text-[#6f64a8]">
                            Browse active deals or jump to the most popular picks in this catalog.
                        </p>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            {quickPicks.slice(0, 5).map((pick, index) => (
                                <button
                                    key={pick.label}
                                    type="button"
                                    className={`justify-self-start rounded-full border border-[#d8ccff] bg-white/95 px-3 py-1.5 text-xs font-semibold text-[#4c3c8d] shadow-[0_6px_14px_rgba(107,63,242,0.12)] transition hover:bg-white ${
                                        index % 2 === 0 ? 'sm:translate-x-0' : 'sm:translate-x-3'
                                    }`}
                                    onClick={pick.onClick}
                                >
                                    {pick.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-[14px] border border-[#dacbff] bg-white/90 p-3 shadow-[0_10px_24px_rgba(107,63,242,0.15)]">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b72ab]">Quick actions</p>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className="rounded-[12px] bg-[#6b3ff2] px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(107,63,242,0.28)] transition hover:brightness-110"
                                onClick={onMostPopularClick}
                            >
                                Most Popular
                            </button>
                            <button
                                type="button"
                                className="rounded-[12px] border border-[#d6c8ff] bg-white px-4 py-2 text-sm font-semibold text-[#46377f] transition hover:bg-[#faf8ff]"
                                onClick={onViewDealsClick}
                            >
                                View Deals
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default CatalogPostSections;
