import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faChevronLeft, faChevronRight} from '@fortawesome/free-solid-svg-icons';
import './testimonials-carousel.css';

export type Testimonial = {
    quote: string;
    name: string;
    role: string;
    badge: string;
};

interface TestimonialsCarouselProps {
    testimonials: Testimonial[];
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const TestimonialsCarousel: React.FC<TestimonialsCarouselProps> = ({testimonials}) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const [step, setStep] = useState(0);
    const [dragOffset, setDragOffset] = useState(0);
    const trackRef = useRef<HTMLDivElement | null>(null);
    const cardRef = useRef<HTMLDivElement | null>(null);
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const dragState = useRef({isDragging: false, startX: 0, lastOffset: 0});

    const maxIndex = Math.max(testimonials.length - 1, 0);
    const hasTestimonials = testimonials.length > 0;
    const showControls = testimonials.length > 1;

    const measureStep = useCallback(() => {
        if (!trackRef.current || !cardRef.current) {
            return;
        }
        const cardWidth = cardRef.current.getBoundingClientRect().width;
        const styles = window.getComputedStyle(trackRef.current);
        const gapValue = parseFloat(styles.columnGap || styles.gap || '0');
        setStep(cardWidth + gapValue);
    }, []);

    useEffect(() => {
        measureStep();
        const observer = new ResizeObserver(() => {
            measureStep();
        });
        if (trackRef.current) {
            observer.observe(trackRef.current);
        }
        if (cardRef.current) {
            observer.observe(cardRef.current);
        }
        window.addEventListener('resize', measureStep);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', measureStep);
        };
    }, [measureStep]);

    useEffect(() => {
        setActiveIndex((prev) => clamp(prev, 0, maxIndex));
    }, [maxIndex]);

    const handlePrev = () => {
        setActiveIndex((prev) => clamp(prev - 1, 0, maxIndex));
    };

    const handleNext = () => {
        setActiveIndex((prev) => clamp(prev + 1, 0, maxIndex));
    };

    const handleDotClick = (index: number) => {
        setActiveIndex(clamp(index, 0, maxIndex));
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!showControls) {
            return;
        }
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            handlePrev();
        }
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            handleNext();
        }
    };

    const startDrag = (clientX: number) => {
        dragState.current = {isDragging: true, startX: clientX, lastOffset: 0};
    };

    const updateDrag = (clientX: number) => {
        if (!dragState.current.isDragging) {
            return;
        }
        const diff = clientX - dragState.current.startX;
        dragState.current.lastOffset = diff;
        setDragOffset(diff);
    };

    const endDrag = () => {
        if (!dragState.current.isDragging) {
            return;
        }
        const diff = dragState.current.lastOffset;
        const threshold = step > 0 ? step * 0.25 : 60;
        if (Math.abs(diff) > threshold) {
            if (diff < 0) {
                handleNext();
            } else {
                handlePrev();
            }
        }
        dragState.current = {isDragging: false, startX: 0, lastOffset: 0};
        setDragOffset(0);
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!showControls) {
            return;
        }
        viewportRef.current?.setPointerCapture(event.pointerId);
        startDrag(event.clientX);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        updateDrag(event.clientX);
    };

    const handlePointerUp = () => {
        endDrag();
    };

    const handlePointerLeave = () => {
        endDrag();
    };

    const translateX = useMemo(() => {
        if (!hasTestimonials || step === 0) {
            return 0;
        }
        return -(activeIndex * step) + dragOffset;
    }, [activeIndex, dragOffset, hasTestimonials, step]);

    return (
        <section className="testimonials-carousel-section">
            <div className="container">
                <div className="section-heading">
                    <h2>Loved by players</h2>
                    <p className="muted">Trusted by thousands for fast delivery and curated picks.</p>
                </div>
                <div className="testimonials-carousel-layout">
                    <div className="testimonials-rating-card">
                        <div className="rating-stars" aria-label="4.8 out of 5 stars">
                            {[...Array(5)].map((_, idx) => (
                                <span key={idx} aria-hidden="true">★</span>
                            ))}
                        </div>
                        <div className="rating-score">4.8/5</div>
                        <div className="rating-helper">based on 2,300 reviews</div>
                    </div>

                    <div
                        className="testimonials-carousel"
                        role="region"
                        aria-roledescription="carousel"
                        aria-label="Player testimonials"
                        tabIndex={0}
                        onKeyDown={handleKeyDown}
                    >
                            {!hasTestimonials && (
                                <div className="card testimonials-empty">
                                    <h3>No testimonials yet</h3>
                                    <p className="muted">Check back soon for player feedback.</p>
                                </div>
                            )}
                            {hasTestimonials && (
                                <>
                                    <span className="visually-hidden" aria-live="polite">
                                        Showing testimonial {activeIndex + 1} of {testimonials.length}
                                    </span>
                                    <div
                                        className="testimonials-carousel-viewport"
                                        ref={viewportRef}
                                        onPointerDown={handlePointerDown}
                                        onPointerMove={handlePointerMove}
                                        onPointerUp={handlePointerUp}
                                        onPointerLeave={handlePointerLeave}
                                    >
                                        <div
                                            className="testimonials-carousel-track"
                                            ref={trackRef}
                                            style={{
                                                transform: `translateX(${translateX}px)`,
                                                transition: dragOffset !== 0 ? 'none' : 'transform 0.4s ease'
                                            }}
                                        >
                                            {testimonials.map((item, index) => (
                                                <article
                                                    className="testimonial-card"
                                                    key={`${item.name}-${index}`}
                                                    ref={index === 0 ? cardRef : undefined}
                                                >
                                                    <p className="testimonial-quote">{item.quote}</p>
                                                    <div className="testimonial-footer">
                                                        <div className="avatar" aria-hidden="true">
                                                            {item.name.charAt(0)}
                                                        </div>
                                                        <div className="testimonial-meta">
                                                            <div className="testimonial-name">{item.name}</div>
                                                            <div className="testimonial-role muted">{item.role}</div>
                                                        </div>
                                                        <span className="testimonial-badge">{item.badge}</span>
                                                    </div>
                                                </article>
                                            ))}
                                        </div>
                                    </div>
                                    {showControls && (
                                        <div className="testimonials-carousel-controls">
                                            <button
                                                type="button"
                                                className="btn btn-outline testimonials-carousel-btn"
                                                onClick={handlePrev}
                                                disabled={activeIndex === 0}
                                                aria-label="Previous testimonial"
                                            >
                                                <FontAwesomeIcon icon={faChevronLeft} />
                                            </button>
                                            <div className="testimonials-carousel-dots" role="tablist" aria-label="Testimonials">
                                                {testimonials.map((_, index) => (
                                                    <button
                                                        key={`testimonial-dot-${index}`}
                                                        type="button"
                                                        className={`testimonials-carousel-dot${index === activeIndex ? ' is-active' : ''}`}
                                                        onClick={() => handleDotClick(index)}
                                                        aria-label={`Go to testimonial ${index + 1}`}
                                                        aria-pressed={index === activeIndex}
                                                    />
                                                ))}
                                            </div>
                                            <button
                                                type="button"
                                                className="btn btn-outline testimonials-carousel-btn"
                                                onClick={handleNext}
                                                disabled={activeIndex === maxIndex}
                                                aria-label="Next testimonial"
                                            >
                                                <FontAwesomeIcon icon={faChevronRight} />
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default TestimonialsCarousel;
