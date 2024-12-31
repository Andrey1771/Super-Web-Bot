import React from 'react';
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
    const columnCount = 3; // Количество столбцов
    const rowCount = Math.ceil(games.length / columnCount); // Количество строк

    const ITEM_WIDTH = 300; // Ширина карточки игры без учета отступов
    const ITEM_HEIGHT = 200; // Высота карточки игры без учета отступов
    const GAP = 16; // Отступы между элементами

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
                    top: Number(style.top) + GAP, // Добавляем отступ сверху
                    left: Number(style.left) + GAP, // Добавляем отступ слева
                    width: style.width ? Number(style.width) - GAP : undefined, // Уменьшаем ширину ячейки
                    height: style.height ? Number(style.height) - GAP : undefined, // Уменьшаем высоту ячейки
                }}
            >
                <GameCard key={game.id} game={game} />
            </div>
        );
    };

    return (
        <section key={category}>
            <h2 className="text-2xl font-bold mb-4">{category}</h2>
            <div className="flex justify-between w-full">
                <Grid
                    className="mb-8"
                    columnCount={columnCount}
                    columnWidth={ITEM_WIDTH + GAP} // Увеличиваем ширину ячейки, чтобы учесть отступы
                    rowCount={rowCount}
                    rowHeight={ITEM_HEIGHT + GAP} // Увеличиваем высоту ячейки, чтобы учесть отступы
                    height={500} // Высота видимой области
                    width={(ITEM_WIDTH + GAP) * columnCount} // Ширина всей сетки с учетом отступов
                >
                    {Cell}
                </Grid>
            </div>
        </section>
    );
};

export default GameListItem;
