import React, { useEffect, useRef, useState } from 'react';

const trustItems = [
    {
        title: 'Secure checkout',
        subtitle: 'Protected payments and verified flow',
        icon: (
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
                <path d="M10 2.2 4.5 4.3v5.2c0 3 2 5.8 5.5 8 3.5-2.2 5.5-5 5.5-8V4.3L10 2.2Z" stroke="currentColor" strokeWidth="1.4" />
                <path d="m7.8 10 1.4 1.4 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        )
    },
    {
        title: 'Instant key delivery',
        subtitle: 'Your game key arrives right after purchase',
        icon: (
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
                <path d="M9 3.5h7.5V11H9z" stroke="currentColor" strokeWidth="1.4" />
                <path d="M3.5 9H9v7.5H3.5z" stroke="currentColor" strokeWidth="1.4" />
                <path d="M11.3 8.2 13 6.5M12.9 9.8l2.8-2.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
        )
    },
    {
        title: 'Refund support',
        subtitle: 'Clear help if an order goes wrong',
        icon: (
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
                <path d="M16 10a6 6 0 1 1-2-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M14.2 2.8v3.7h-3.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        )
    },
    {
        title: '24/7 assistance',
        subtitle: 'We’re here whenever you need help',
        icon: (
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
                <path d="M4 11.2V10a6 6 0 0 1 12 0v1.2" stroke="currentColor" strokeWidth="1.4" />
                <path d="M4.8 11h-.3a1.6 1.6 0 0 0-1.6 1.6v1.8A1.6 1.6 0 0 0 4.5 16H6v-5Zm9.2 0h1.5a1.6 1.6 0 0 1 1.6 1.6v1.8a1.6 1.6 0 0 1-1.6 1.6H14v-5Z" stroke="currentColor" strokeWidth="1.4" />
                <path d="M10 14.8h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
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

const CatalogPostSections: React.FC = () => {
    const railRef = useRef<HTMLDivElement | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [touchStartX, setTouchStartX] = useState<number | null>(null);

    useEffect(() => {
        if (isPaused || testimonialItems.length <= 1) {
            return;
        }
        const intervalId = window.setInterval(() => {
            setActiveIndex((prev) => (prev + 1) % testimonialItems.length);
        }, 3400);
        return () => window.clearInterval(intervalId);
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
        rail.scrollTo({ left: card.offsetLeft - 18, behavior: 'smooth' });
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
            setActiveIndex((prev) => (delta > 0 ? (prev + 1) % testimonialItems.length : (prev - 1 + testimonialItems.length) % testimonialItems.length));
        }
        setTouchStartX(null);
    };

    return (
        <div className="space-y-7">
            <section className="rounded-[18px] border border-[#e9e1ff] bg-[linear-gradient(180deg,#fff_0%,#faf7ff_100%)] px-3 py-3 shadow-[0_10px_22px_rgba(108,85,164,0.1)] sm:px-4">
                <div className="grid grid-cols-1 overflow-hidden rounded-[12px] border border-[#ede6ff] bg-white/90 sm:grid-cols-2 lg:grid-cols-4">
                    {trustItems.map((item, index) => (
                        <article
                            key={item.title}
                            className={`flex min-h-[84px] items-center gap-3 px-3 py-3 sm:px-4 ${index % 2 === 0 ? 'sm:border-r sm:border-[#f0ebff] lg:border-r-[#efe8ff]' : ''} ${index < 2 ? 'border-b border-[#f3eeff] lg:border-b-0' : ''} ${index < trustItems.length - 1 ? 'lg:border-r lg:border-[#f0ebff]' : ''}`}
                        >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-[#dacdff] bg-[#f4eeff] text-[#5a3bc6]">
                                {item.icon}
                            </span>
                            <div>
                                <p className="text-sm font-semibold leading-tight text-[#2b2350]">{item.title}</p>
                                <p className="mt-1 text-xs leading-snug text-[#7669a7]">{item.subtitle}</p>
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <section className="rounded-[20px] border border-[#e9e2ff] bg-white/95 p-5 shadow-[0_18px_32px_rgba(108,85,164,0.12)]" aria-label="Catalog social proof">
                <div className="grid gap-4 lg:grid-cols-[1.7fr_280px]">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7b72ab]">Player feedback</p>
                        <h2 className="mt-2 text-xl font-semibold text-[#2b2350]">Trusted by active buyers</h2>
                        <p className="mt-1 text-sm text-[#6f64a8]">Real checkout feedback from catalog shoppers.</p>
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
                    </div>
                    <div className="rounded-[12px] bg-[#f9f7ff] px-3 py-2.5">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b72ab]">Rating breakdown</p>
                        <div className="mt-2.5 space-y-1.5">
                            {[{ label: '5', value: 78 }, { label: '4', value: 15 }, { label: '3', value: 5 }, { label: '2', value: 1 }, { label: '1', value: 1 }].map((item) => (
                                <div key={item.label} className="flex items-center gap-2 text-xs text-[#6f64a8]">
                                    <span className="w-3 text-right font-semibold text-[#2b2350]">{item.label}</span>
                                    <div className="flex flex-1 items-center gap-1.5">
                                        <div className="h-1.5 flex-1 rounded-full bg-[#e6e1ff]"><div className="h-1.5 rounded-full bg-[#6b3ff2]" style={{ width: `${item.value}%` }} /></div>
                                        <span className="w-7 text-right">{item.value}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="relative mt-5" onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => setIsPaused(false)}>
                    <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-white via-white/80 to-transparent" />
                    <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-white via-white/80 to-transparent" />
                    <div ref={railRef} className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
                        {testimonialItems.map((review, index) => (
                            <article key={`${review.name}-${index}`} className="min-w-[82%] snap-start rounded-[14px] border border-[#ece4ff] bg-[#fcfbff] p-3 shadow-[0_8px_18px_rgba(108,85,164,0.08)] sm:min-w-[46%] lg:min-w-[33%]">
                                <div className="flex items-center gap-2">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#6b3ff2] text-xs font-semibold text-white">{review.initial}</div>
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
                <div className="mt-2.5 flex items-center gap-1.5">
                    {testimonialItems.map((_, index) => (
                        <span key={`rail-indicator-${index}`} className={`h-1 rounded-full transition-all ${index === activeIndex ? 'w-4 bg-[#6b3ff2]' : 'w-1.5 bg-[#daccff]'}`} />
                    ))}
                </div>
            </section>
        </div>
    );
};

export default CatalogPostSections;
