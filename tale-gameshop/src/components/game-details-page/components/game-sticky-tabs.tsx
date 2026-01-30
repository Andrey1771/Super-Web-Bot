import React from 'react';

interface TabItem {
    id: string;
    label: string;
}

interface GameStickyTabsProps {
    tabs: TabItem[];
    activeId: string;
    onSelect: (id: string) => void;
}

const GameStickyTabs: React.FC<GameStickyTabsProps> = ({ tabs, activeId, onSelect }) => {
    return (
        <div className="gd-sticky-tabs">
            <div className="gd-sticky-tabs-inner">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        className={`gd-tab ${activeId === tab.id ? 'gd-tab-active' : ''}`}
                        type="button"
                        onClick={() => onSelect(tab.id)}
                        aria-current={activeId === tab.id ? 'page' : undefined}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default GameStickyTabs;
