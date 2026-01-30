import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { MediaItem } from '../../../models/game-details';

interface GameMediaGalleryProps {
    mediaItems: MediaItem[];
    selectedId: string;
    onSelect: (id: string) => void;
}

const formatDuration = (durationSec?: number) => {
    if (!durationSec) {
        return '';
    }
    const minutes = Math.floor(durationSec / 60);
    const seconds = durationSec % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const GameMediaGallery: React.FC<GameMediaGalleryProps> = ({ mediaItems, selectedId, onSelect }) => {
    const selectedItem = useMemo(
        () => mediaItems.find((item) => item.id === selectedId) ?? mediaItems[0],
        [mediaItems, selectedId]
    );
    const stripRef = useRef<HTMLDivElement>(null);
    const [showArrows, setShowArrows] = useState(false);

    useEffect(() => {
        const updateArrows = () => {
            if (!stripRef.current) {
                return;
            }
            const { scrollWidth, clientWidth } = stripRef.current;
            setShowArrows(scrollWidth > clientWidth + 4);
        };
        updateArrows();
        window.addEventListener('resize', updateArrows);
        return () => window.removeEventListener('resize', updateArrows);
    }, [mediaItems]);

    const scrollStrip = (direction: 'left' | 'right') => {
        if (!stripRef.current) {
            return;
        }
        const scrollAmount = direction === 'left' ? -220 : 220;
        stripRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    };

    if (!selectedItem) {
        return null;
    }

    return (
        <div className="gd-media-gallery">
            <div className="gd-media-main card">
                {selectedItem.type === 'video' ? (
                    <video className="gd-media-video" controls preload="metadata" aria-label="Game trailer video">
                        <source src={selectedItem.url} />
                    </video>
                ) : (
                    <img
                        className="gd-media-image"
                        src={selectedItem.url}
                        alt="Selected game media"
                    />
                )}
            </div>
            <div className="gd-thumb-row">
                {showArrows && (
                    <button
                        className="gd-thumb-arrow"
                        aria-label="Scroll thumbnails left"
                        onClick={() => scrollStrip('left')}
                        type="button"
                    >
                        ‹
                    </button>
                )}
                <div className="gd-thumb-strip" ref={stripRef}>
                    {mediaItems.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className={`gd-thumb ${item.id === selectedItem.id ? 'gd-thumb-active' : ''}`}
                            onClick={() => onSelect(item.id)}
                            aria-label={`Select ${item.type} thumbnail`}
                        >
                            <img src={item.thumbUrl} alt="Game thumbnail" loading="lazy" />
                            {item.type === 'video' && (
                                <div className="gd-thumb-video">
                                    <span className="gd-thumb-play" aria-hidden="true">▶</span>
                                    <span className="gd-thumb-duration">{formatDuration(item.durationSec)}</span>
                                </div>
                            )}
                        </button>
                    ))}
                </div>
                {showArrows && (
                    <button
                        className="gd-thumb-arrow"
                        aria-label="Scroll thumbnails right"
                        onClick={() => scrollStrip('right')}
                        type="button"
                    >
                        ›
                    </button>
                )}
            </div>
        </div>
    );
};

export default GameMediaGallery;
