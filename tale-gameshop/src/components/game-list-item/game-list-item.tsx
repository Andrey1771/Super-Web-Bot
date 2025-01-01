import React, { useRef, useState, useEffect } from 'react';
import { FixedSizeGrid as Grid } from 'react-window';
import './game-list-item.css';
import { Game } from "../../models/game";
import GameCard from '../game-card/game-card';

interface GameListItemProps {
    filteredGamesByCategory: Map<string, Game[]>;
    category: string;
}

const GameListItem: React.FC<GameListItemProps> = ({ filteredGamesByCategory, category }) => {
    const games = filteredGamesByCategory.get(category) || [];
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const [columnCount, setColumnCount] = useState(3);

    const ITEM_WIDTH = 400; // Ширина карточки игры
    const ITEM_HEIGHT = 265; // Высота карточки игры
    const GAP = 24; // Отступы между элементами
    const MAX_WIDTH = 1504;

    useEffect(() => {
        const handleResize = () => {
            if (containerRef.current) {
                const width = containerRef.current.offsetWidth > MAX_WIDTH ? MAX_WIDTH : containerRef.current.offsetWidth;
                const newColumnCount = Math.max(1, Math.floor(width / (ITEM_WIDTH + GAP)));
                setColumnCount(newColumnCount);
                setContainerWidth(newColumnCount * (ITEM_WIDTH + GAP) + GAP/*Отступ от скролла*/);
            }
        };

        // Используем ResizeObserver для отслеживания изменений размера контейнера
        const resizeObserver = new ResizeObserver(() => handleResize());
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        handleResize(); // Вызываем сразу для установки начальных значений

        return () => resizeObserver.disconnect(); // Очищаем наблюдатель
    }, []);

    const rowCount = Math.ceil(games.length / columnCount);

    const Cell = ({ columnIndex, rowIndex, style }: { columnIndex: number; rowIndex: number; style: React.CSSProperties }) => {
        const gameIndex = rowIndex * columnCount + columnIndex;
        if (gameIndex >= games.length) {
            return null; // Если индекс выходит за пределы массива
        }

        const game = games[gameIndex];
        return (
            <div
                style={{
                    ...style,
                    top: Number(style.top) + GAP,
                    left: Number(style.left) + GAP,
                    width: style.width ? Number(style.width) - GAP : undefined,
                    height: style.height ? Number(style.height) - GAP : undefined,
                }}
            >
                <GameCard key={game.id} game={game} />
            </div>
        );
    };

    return (
        <section className="flex justify-center flex-col" key={category}>
            <div className="flex flex-col items-start container">
                <h2 className="text-2xl font-bold mb-4">{category}</h2>
                <div ref={containerRef} className="w-full mb-8 flex justify-center" style={{overflow: 'hidden'}}>
                    {containerWidth > 0 && (
                        <Grid
                            columnCount={columnCount}
                            columnWidth={ITEM_WIDTH + GAP}
                            rowCount={rowCount}
                            rowHeight={ITEM_HEIGHT + GAP}
                            height={500}
                            width={containerWidth}
                        >
                            {Cell}
                        </Grid>
                    )}
                </div>
            </div>
        </section>
    );
};

export default GameListItem;
