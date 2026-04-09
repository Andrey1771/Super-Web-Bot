import React from 'react';

type CatalogPostSectionsProps = {
    onMostPopularClick: () => void;
    onViewDealsClick: () => void;
};

const trustItems = [
    'Secure checkout',
    'Instant key delivery',
    'Refund policy',
    '24/7 support'
];

const compactReviews = [
    {
        name: 'Mat S.',
        initial: 'M',
        review: 'Great catalog flow and very quick key delivery.'
    },
    {
        name: 'Alex R.',
        initial: 'A',
        review: 'Found a deal fast, checked out once, key arrived instantly.'
    }
];

const CatalogPostSections: React.FC<CatalogPostSectionsProps> = ({ onMostPopularClick, onViewDealsClick }) => {
    return (
        <div className="space-y-6">
            <section
                className="rounded-[16px] border border-[#ece8ff] bg-white/90 px-4 py-3 shadow-[0_8px_20px_rgba(108,85,164,0.08)]"
                aria-label="Catalog trust highlights"
            >
                <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                    {trustItems.map((item) => (
                        <li key={item} className="flex items-center gap-2 text-[#2b2350]">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#6b3ff2]" />
                            <span className="font-medium">{item}</span>
                        </li>
                    ))}
                </ul>
            </section>

            <section
                className="rounded-[18px] border border-[#ece8ff] bg-white/90 p-4 shadow-[0_10px_24px_rgba(108,85,164,0.1)]"
                aria-label="Catalog social proof"
            >
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b72ab]">Player rating</p>
                        <div className="mt-2 flex items-center gap-2">
                            <span className="text-2xl font-semibold text-[#2b2350]">4.8</span>
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
                    <p className="max-w-[420px] text-sm text-[#6f64a8]">
                        Short feedback from buyers who used this catalog to compare prices and get keys quickly.
                    </p>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {compactReviews.map((review) => (
                        <article key={review.name} className="rounded-[14px] border border-[#efeaff] bg-[#fcfbff] px-3 py-3">
                            <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#6b3ff2] text-xs font-semibold text-white">
                                    {review.initial}
                                </div>
                                <p className="text-sm font-semibold text-[#2b2350]">{review.name}</p>
                            </div>
                            <p className="mt-2 text-sm text-[#6f64a8]">{review.review}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section
                className="rounded-[18px] border border-[#ece8ff] bg-white p-4 shadow-[0_12px_26px_rgba(108,85,164,0.11)]"
                aria-label="Catalog quick actions"
            >
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-semibold text-[#2b2350]">Still choosing?</h2>
                        <p className="mt-1 text-sm text-[#6f64a8]">
                            Browse active deals or jump to the most popular picks in this catalog.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="rounded-[12px] bg-[#6b3ff2] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(107,63,242,0.25)] transition hover:brightness-110"
                            onClick={onMostPopularClick}
                        >
                            Most Popular
                        </button>
                        <button
                            type="button"
                            className="rounded-[12px] border border-[#dbd2ff] bg-white px-4 py-2 text-sm font-semibold text-[#4b3b87] transition hover:bg-[#f8f5ff]"
                            onClick={onViewDealsClick}
                        >
                            View Deals
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default CatalogPostSections;
