import React from 'react';
import './recommendations-section.css';

type RecommendationsSectionProps<T> = {
    items: T[];
    isLoading: boolean;
    error?: string | null;
    onRetry?: () => void;
    emptyMessage: string;
    listClassName?: string;
    stateClassName?: string;
    skeletonCount?: number;
    renderItem: (item: T) => React.ReactNode;
    renderSkeleton?: (index: number) => React.ReactNode;
    testId?: string;
};

const RecommendationsSection = <T,>({
    items,
    isLoading,
    error,
    onRetry,
    emptyMessage,
    listClassName,
    stateClassName,
    skeletonCount = 4,
    renderItem,
    renderSkeleton,
    testId
}: RecommendationsSectionProps<T>) => {
    if (isLoading) {
        return (
            <div className={listClassName} data-testid={testId}>
                {Array.from({ length: skeletonCount }).map((_, index) =>
                    renderSkeleton ? renderSkeleton(index) : (
                        <div key={`skeleton-${index}`} className="recommendations-skeleton" />
                    )
                )}
            </div>
        );
    }

    if (error) {
        return (
            <div className={stateClassName ?? 'recommendations-state'} data-testid={testId}>
                <p className="recommendations-state__message">{error}</p>
                {onRetry && (
                    <button type="button" className="btn btn-outline recommendations-state__retry" onClick={onRetry}>
                        Retry
                    </button>
                )}
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className={stateClassName ?? 'recommendations-state'} data-testid={testId}>
                <p className="recommendations-state__message">{emptyMessage}</p>
            </div>
        );
    }

    return (
        <div className={listClassName} data-testid={testId}>
            {items.map((item) => renderItem(item))}
        </div>
    );
};

export default RecommendationsSection;
