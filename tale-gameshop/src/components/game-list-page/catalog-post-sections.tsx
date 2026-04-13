import React, { useEffect, useRef, useState } from 'react';

const trustItems = [
    {
        title: 'Secure checkout',
        icon: (
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                <path d="M10 2.5 4.9 4.5v4.8c0 2.8 1.8 5.2 5.1 7.2 3.3-2 5.1-4.4 5.1-7.2V4.5L10 2.5Z" stroke="currentColor" strokeWidth="1.35" />
            </svg>
        )
    },
    {
        title: 'Instant key delivery',
        icon: (
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                <path d="M3.8 10h8.2m0 0-2.8-2.8M12 10l-2.8 2.8" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12.5 5h3.7v10h-3.7" stroke="currentColor" strokeWidth="1.35" />
            </svg>
        )
    },
    {
        title: 'Refund policy',
        icon: (
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                <path d="M15.3 10A5.3 5.3 0 1 1 13 5.6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
                <path d="M13.2 3.8v3.1h-3.1" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        )
    },
    {
        title: '24/7 support',
        icon: (
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                <path d="M4.3 11V9.9a5.7 5.7 0 0 1 11.4 0V11" stroke="currentColor" strokeWidth="1.35" />
                <path d="M4.8 11h-.6a1.3 1.3 0 0 0-1.3 1.3V14a1.3 1.3 0 0 0 1.3 1.3h1.2V11Zm10.4 0h.6a1.3 1.3 0 0 1 1.3 1.3V14a1.3 1.3 0 0 1-1.3 1.3h-1.2V11Z" stroke="currentColor" strokeWidth="1.35" />
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
            <section className="rounded-[14px] border border-[#e9e1ff] bg-[linear-gradient(180deg,#fff_0%,#faf7ff_100%)] px-2.5 py-2 shadow-[0_8px_18px_rgba(108,85,164,0.08)] sm:px-3">
                <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <div className="flex min-w-max items-center">
                        {trustItems.map((item, index) => (
                            <React.Fragment key={item.title}>
                                <div className="flex items-center gap-1.5 px-3 py-1.5 text-[#32285d] sm:px-4">
                                    <span className="text-[#6b3ff2]">{item.icon}</span>
                                    <span className="whitespace-nowrap text-[13px] font-semibold tracking-[0.01em]">{item.title}</span>
                                </div>
                                {index < trustItems.length - 1 && <span className="h-3 w-px bg-[#ddd1ff]" aria-hidden="true" />}
                            </React.Fragment>
                        ))}
                    </div>
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
