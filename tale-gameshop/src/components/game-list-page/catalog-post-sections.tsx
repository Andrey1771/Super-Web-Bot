import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Game } from '../../models/game';

type ShortcutMode = 'discounts' | 'popular' | 'price-asc' | 'price-desc';
type BudgetOption = 'any' | 'under20' | 'under50' | 'premium';
type MoodOption = 'story' | 'action' | 'coop' | 'horror';

type CatalogPostSectionsProps = {
    games: Game[];
    availableCategories: string[];
    onApplyShortcut: (selection: { minPrice?: number; maxPrice?: number; category?: string; mode?: ShortcutMode }) => void;
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

const CatalogPostSections: React.FC<CatalogPostSectionsProps> = ({ games, availableCategories, onApplyShortcut }) => {
    const railRef = useRef<HTMLDivElement | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [touchStartX, setTouchStartX] = useState<number | null>(null);

    const [budget, setBudget] = useState<BudgetOption>('any');
    const [mood, setMood] = useState<MoodOption>('action');
    const [mode, setMode] = useState<ShortcutMode>('discounts');

    const moodCategoryMap = useMemo(() => {
        const findMatch = (...keywords: string[]) =>
            availableCategories.find((category) => keywords.some((keyword) => category.toLowerCase().includes(keyword)));

        return {
            story: findMatch('role', 'rpg', 'adventure', 'story') ?? availableCategories[0],
            action: findMatch('action') ?? availableCategories[0],
            coop: findMatch('strategy', 'sports', 'co-op', 'coop') ?? availableCategories[1] ?? availableCategories[0],
            horror: findMatch('horror') ?? availableCategories[2] ?? availableCategories[0]
        } as Record<MoodOption, string | undefined>;
    }, [availableCategories]);

    const budgetRules = useMemo(
        () => ({
            any: { label: 'Any', minPrice: undefined, maxPrice: undefined },
            under20: { label: 'Under $20', minPrice: undefined, maxPrice: 20 },
            under50: { label: 'Under $50', minPrice: undefined, maxPrice: 50 },
            premium: { label: 'Premium picks', minPrice: 50, maxPrice: undefined }
        }),
        []
    );

    const moodRules = useMemo(
        () => ({
            story: { label: 'Story-rich', category: moodCategoryMap.story },
            action: { label: 'Action', category: moodCategoryMap.action },
            coop: { label: 'Co-op', category: moodCategoryMap.coop },
            horror: { label: 'Horror', category: moodCategoryMap.horror }
        }),
        [moodCategoryMap]
    );

    const modeRules = useMemo(
        () => ({
            discounts: { label: 'Biggest discount', mode: 'discounts' as ShortcutMode },
            popular: { label: 'Most popular', mode: 'popular' as ShortcutMode },
            'price-asc': { label: 'Price low to high', mode: 'price-asc' as ShortcutMode },
            'price-desc': { label: 'Premium picks', mode: 'price-desc' as ShortcutMode }
        }),
        []
    );

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

    const matchingCount = useMemo(() => {
        const currentBudget = budgetRules[budget];
        const currentMood = moodRules[mood];

        return games.filter((game) => {
            const price = Number(game.finalPrice ?? game.price);
            if (currentBudget.maxPrice !== undefined && price > currentBudget.maxPrice) {
                return false;
            }
            if (currentBudget.minPrice !== undefined && price < currentBudget.minPrice) {
                return false;
            }
            if (mode === 'discounts') {
                const regular = Number(game.price);
                if (!(Boolean(game.discountActive) && price < regular)) {
                    return false;
                }
            }
            if (!currentMood.category) {
                return true;
            }

            return true;
        }).length;
    }, [budget, budgetRules, games, mode, mood, moodRules]);

    const applyCurrentShortcut = () => {
        const currentBudget = budgetRules[budget];
        const currentMood = moodRules[mood];
        const currentMode = modeRules[mode];

        onApplyShortcut({
            minPrice: currentBudget.minPrice,
            maxPrice: currentBudget.maxPrice,
            category: currentMood.category,
            mode: currentMode.mode
        });
    };

    const resetShortcut = () => {
        setBudget('any');
        setMood('action');
        setMode('discounts');
        onApplyShortcut({});
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

            <section className="rounded-[20px] border border-[#dfd1ff] bg-[linear-gradient(145deg,#ffffff_0%,#f7f1ff_55%,#f2e8ff_100%)] p-5 shadow-[0_20px_34px_rgba(107,63,242,0.16)]" aria-label="Smart picker">
                <div className="grid gap-5 lg:grid-cols-[3fr_2fr] lg:items-start">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b72ab]">SMART PICKER</p>
                        <h2 className="mt-1 text-[28px] font-semibold leading-[1.15] text-[#2b2350]">Find your next game faster</h2>
                        <p className="mt-2 text-sm text-[#5f528e]">Choose a budget, a play mood, and a deal angle. We’ll instantly narrow the catalog.</p>

                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <div>
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7eb9]">Budget</p>
                                <div className="flex flex-wrap gap-2">
                                    {(Object.keys(budgetRules) as BudgetOption[]).map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${budget === option ? 'border-[#6b3ff2] bg-[#ede4ff] text-[#4c32a9]' : 'border-[#d8ccff] bg-white/95 text-[#4c3c8d]'}`}
                                            onClick={() => setBudget(option)}
                                        >
                                            {budgetRules[option].label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7eb9]">Mood</p>
                                <div className="flex flex-wrap gap-2">
                                    {(Object.keys(moodRules) as MoodOption[]).map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${mood === option ? 'border-[#6b3ff2] bg-[#ede4ff] text-[#4c32a9]' : 'border-[#d8ccff] bg-white/95 text-[#4c3c8d]'}`}
                                            onClick={() => setMood(option)}
                                        >
                                            {moodRules[option].label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a7eb9]">Sort by / Deal angle</p>
                                <div className="flex flex-wrap gap-2">
                                    {(Object.keys(modeRules) as ShortcutMode[]).map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${mode === option ? 'border-[#6b3ff2] bg-[#ede4ff] text-[#4c32a9]' : 'border-[#d8ccff] bg-white/95 text-[#4c3c8d]'}`}
                                            onClick={() => setMode(option)}
                                        >
                                            {modeRules[option].label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-[14px] border border-[#d8ccff] bg-white/88 p-4 shadow-[0_12px_24px_rgba(107,63,242,0.18)]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7b72ab]">Your shortcut</p>
                        <ul className="mt-2 space-y-1 text-sm text-[#3f326f]">
                            <li>• {budgetRules[budget].label}</li>
                            <li>• {moodRules[mood].label}</li>
                            <li>• {modeRules[mode].label}</li>
                        </ul>
                        <p className="mt-3 text-sm font-semibold text-[#2b2350]">
                            {matchingCount > 0 ? `${matchingCount} matching games` : 'Show matching games'}
                        </p>
                        <button
                            type="button"
                            className="mt-3 w-full rounded-[13px] bg-[#6b3ff2] px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(107,63,242,0.34)] transition hover:brightness-110"
                            onClick={applyCurrentShortcut}
                        >
                            {matchingCount > 0 ? `Show ${matchingCount} games` : 'Show matching games'}
                        </button>
                        <button
                            type="button"
                            className="mt-2 text-xs font-semibold text-[#6a5ba6] underline-offset-2 hover:underline"
                            onClick={resetShortcut}
                        >
                            Reset
                        </button>
                    </div>
                </div>
                <button
                    type="button"
                    className="mt-3 text-xs font-medium text-[#6a5ba6] underline-offset-2 hover:underline"
                    onClick={() => onApplyShortcut({})}
                >
                    Need more control? Open full filters
                </button>
            </section>
        </div>
    );
};

export default CatalogPostSections;
