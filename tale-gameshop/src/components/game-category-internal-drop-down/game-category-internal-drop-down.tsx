import React from "react";

interface GameCategoryInternalDropDownItemProps {
    subgenres: string[]; // Массив поджанров
}

const GameCategoryInternalDropDownItem: React.FC<GameCategoryInternalDropDownItemProps> = ({ subgenres }) => {
    return (
        <ul className="accordion-content">
            {subgenres.map((subgenre, index) => (
                <li key={index}>
                    <a className="block px-4 py-2 text-gray-700 menu-item" href="#">
                        {subgenre}
                    </a>
                </li>
            ))}
        </ul>
    );
};

export default GameCategoryInternalDropDownItem;