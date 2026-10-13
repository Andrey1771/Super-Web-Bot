import React from 'react';
import { render, screen } from '@testing-library/react';
import RecommendationsSection from './recommendations-section';

const renderItem = (item: { id: string; title: string }) => (
    <div key={item.id}>{item.title}</div>
);

describe('RecommendationsSection', () => {
    it('renders skeletons while loading', () => {
        render(
            <RecommendationsSection
                items={[]}
                isLoading
                emptyMessage="Empty"
                listClassName="list"
                renderSkeleton={(index) => <div key={`skeleton-${index}`}>Loading</div>}
                renderItem={renderItem}
            />
        );

        expect(screen.getAllByText('Loading')).toHaveLength(4);
    });

    it('renders empty state when no items', () => {
        render(
            <RecommendationsSection
                items={[]}
                isLoading={false}
                emptyMessage="Nothing here"
                listClassName="list"
                renderItem={renderItem}
            />
        );

        expect(screen.getByText('Nothing here')).toBeInTheDocument();
    });

    it('renders items when data is available', () => {
        render(
            <RecommendationsSection
                items={[{ id: '1', title: 'Game One' }]}
                isLoading={false}
                emptyMessage="Empty"
                listClassName="list"
                renderItem={renderItem}
            />
        );

        expect(screen.getByText('Game One')).toBeInTheDocument();
    });
});
