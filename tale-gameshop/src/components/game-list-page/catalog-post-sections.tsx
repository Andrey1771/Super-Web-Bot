import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Game } from '../../models/game';

type ShortcutMode = 'discounts' | 'popular' | 'price-asc';

type CatalogPostSectionsProps = {
    games: Game[];
    onApplyShortcut: (selection: { budget?: number; category?: string; mode?: ShortcutMode }) => void;
    quickCategoryOptions: string[];
};

const trustItems = ['Secure checkout', 'Instant key delivery', 'Refund policy', '24/7 support'];

const testimonialItems = [
    { name: 'Mat S.', initial: 'M', text: 'Smooth checkout, key arrived in under a minute.', tag: 'Action fan' },
    { name: 'Eva T.', initial: 'E', text: 'Used filters + sorting and found a better deal quickly.', tag: 'Budget buyer' },
    { name: 'Chris L.', initial: 'C', text: 'Catalog feels clean: compare prices, buy, activate.', tag: 'RPG player' },
    { name: 'Nora P.', initial: 'N', text: 'No friction. Added to cart, paid, got my key instantly.', tag: 'Weekend gamer' },
    { name: 'Leo M.', initial: 'L', text: 'Discount-only shortcut is super useful when browsing.', tag: 'Deal hunter' },
    { name: 'Sam R.', initial: 'S', text: 'Exactly what I need from a store catalog: fast and clear.', tag: 'PC gamer' }
];

const modeLabels: Record<ShortcutMode, string> = {
    discounts: 'Biggest discounts',
    popular: 'Most popular',
    'price-asc': 'Price: Low to High'
};

const CatalogPostSections: React.FC<CatalogPostSectionsProps> = ({ games, onApplyShortcut, quickCategoryOptions }) => {
    const railRef = useRef<HTMLDivElement | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [touchStartX, setTouchStartX] = useState<number | null>(null);

    const [selectedBudget, setSelectedBudget] = useState<number>(100);
    const [selectedMode, setSelectedMode] = useState<ShortcutMode>('discounts');
    const [selectedCategory, setSelectedCategory] = useState<string>(quickCategoryOptions[0] ?? '');

    useEffect(() => {
        if (!selectedCategory && quickCategoryOptions.length > 0) {
            setSelectedCategory(quickCategoryOptions[0]);
        }
    }, [quickCategoryOptions, selectedCategory]);

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
        rail.scrollTo({ left: card.offsetLeft - 18, behavior: 'smooth' });
    }, [activeIndex]);

    const previewGames = useMemo(() => {
        const byBudget = games.filter((game) => Number(game.finalPrice ?? game.price) <= selectedBudget);
        let candidates = byBudget;

        if (selectedMode === 'discounts') {
            candidates = candidates
                .filter((game) => {
                    const regular = Number(game.price);
                    const final = Number(game.finalPrice ?? game.price);
                    return Boolean(game.discountActive) && Number.isFinite(regular) && Number.isFinite(final) && final < regular;
                })
                .sort((a, b) => Number(a.finalPrice ?? a.price) - Number(b.finalPrice ?? b.price));
        } else if (selectedMode === 'popular') {
            candidates = [...candidates];
        } else {
            candidates = [...candidates].sort((a, b) => Number(a.finalPrice ?? a.price) - Number(b.finalPrice ?? b.price));
        }

        return candidates;
    }, [games, selectedBudget, selectedCategory, selectedMode]);

    const previewGame = previewGames[0] ?? games[0] ?? null;

    const handleApply = () => {
        onApplyShortcut({
            budget: selectedBudget,
            category: selectedCategory || undefined,
            mode: selectedMode
        });
    };

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
            <section className="rounded-[16px] border border-[#ece8ff] bg-white/90 px-4 py-3 shadow-[0_8px_20px_rgba(108,85,164,0.08)]">
                <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#2b2350]">
                    {trustItems.map((item) => (
                        <li key={item} className="flex items-center gap-2.5">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#6b3ff2]" />
                            <span className="font-medium">{item}</span>
                        </li>
                    ))}
                </ul>
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

            <section className="relative overflow-hidden rounded-[20px] border border-[#dfd1ff] bg-[linear-gradient(135deg,#fdfbff_0%,#f4ecff_50%,#efe5ff_100%)] p-5 shadow-[0_22px_38px_rgba(107,63,242,0.18)]" aria-label="Catalog shortcut assistant">
                <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(107,63,242,0.22)_0%,rgba(107,63,242,0)_72%)]" />

                <div className="relative z-10 grid gap-4 lg:grid-cols-[3fr_2fr] lg:items-start">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b72ab]">Shortcut assistant</p>
                        <h2 className="mt-1 text-[28px] font-semibold leading-[1.15] text-[#2b2350]">Still choosing?</h2>
                        <p className="mt-2 text-sm text-[#5f528e]">Use quick shortcuts to narrow the catalog by budget, genre, and deal type.</p>
                        <p className="mt-1 text-xs text-[#7c70ab]">Pick a few preferences and jump straight to matching games.</p>

                        <div className="mt-4 space-y-3 max-w-[500px]">
                            <div>
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7eb9]">Budget</p>
                                <div className="flex flex-wrap gap-2">
                                    {[100, 300].map((value) => (
                                        <button
                                            key={`budget-${value}`}
                                            type="button"
                                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${selectedBudget === value ? 'border-[#6b3ff2] bg-[#ede4ff] text-[#4c32a9]' : 'border-[#d8ccff] bg-white/95 text-[#4c3c8d]'}`}
                                            onClick={() => setSelectedBudget(value)}
                                        >
                                            Under ${value}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7eb9]">Mood / Genre</p>
                                <div className="flex flex-wrap gap-2">
                                    {quickCategoryOptions.slice(0, 3).map((category) => (
                                        <button
                                            key={`genre-${category}`}
                                            type="button"
                                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${selectedCategory === category ? 'border-[#6b3ff2] bg-[#ede4ff] text-[#4c32a9]' : 'border-[#d8ccff] bg-white/95 text-[#4c3c8d]'}`}
                                            onClick={() => setSelectedCategory(category)}
                                        >
                                            {category}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7eb9]">Browse mode</p>
                                <div className="flex flex-wrap gap-2">
                                    {(Object.keys(modeLabels) as ShortcutMode[]).map((mode) => (
                                        <button
                                            key={`mode-${mode}`}
                                            type="button"
                                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${selectedMode === mode ? 'border-[#6b3ff2] bg-[#ede4ff] text-[#4c32a9]' : 'border-[#d8ccff] bg-white/95 text-[#4c3c8d]'}`}
                                            onClick={() => setSelectedMode(mode)}
                                        >
                                            {modeLabels[mode]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-center lg:justify-center">
                        <div className="w-full max-w-[360px] rounded-[16px] border border-[#d9ccff] bg-white/92 p-3 shadow-[0_14px_28px_rgba(107,63,242,0.2)]">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#7b72ab]">Recommended shortcut</p>
                            {previewGame ? (
                                <>
                                    <div className="mt-2 rounded-[12px] border border-[#ece4ff] bg-[#faf7ff] p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="text-sm font-semibold text-[#2b2350]">{previewGame.title}</p>
                                                <p className="mt-1 text-xs text-[#6f64a8]">{previewGames.length} matching games</p>
                                            </div>
                                            <span className="rounded-full bg-[#ede4ff] px-2 py-0.5 text-[10px] font-semibold text-[#5530bf]">
                                                {selectedMode === 'discounts' ? 'Deal' : selectedMode === 'popular' ? 'Popular' : 'Under budget'}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-sm font-semibold text-[#3f2d7a]">${Number(previewGame.finalPrice ?? previewGame.price).toFixed(2)}</p>
                                    </div>
                                    <p className="mt-2 text-xs text-[#7c70ab]">Filters will be applied to the catalog.</p>
                                </>
                            ) : (
                                <p className="mt-2 text-xs text-[#7c70ab]">No exact match yet. Shortcut will still be applied to the catalog.</p>
                            )}

                            <button
                                type="button"
                                className="mt-3 w-full rounded-[13px] bg-[#6b3ff2] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(107,63,242,0.34)] transition hover:brightness-110"
                                onClick={handleApply}
                            >
                                Browse matching games
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default CatalogPostSections;
