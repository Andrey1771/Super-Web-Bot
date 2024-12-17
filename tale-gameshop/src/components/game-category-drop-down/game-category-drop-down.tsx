import React from "react";
import GameCategoryInternalDropDownItem
    from "../game-category-internal-drop-down/game-category-internal-drop-down";
import { Link } from "react-router-dom";

interface GameCategory {
    name: string;
    subgenres: string[];
}

interface GameCategoryDropDownProps {
    categories: GameCategory[];
}

const GameCategoryDropDown: React.FC<GameCategoryDropDownProps> = ({ categories }) => {
    categories = gameCategories; //TODO Временная заглушка, в планах получение с сервера
    return (
        <ul className="absolute left-0 mt-2 w-64 bg-white border border-gray-200 shadow-lg hidden dropdown-menu p-4">
            {categories.map((category, index) => (
                <li className="font-bold accordion-item mt-4" key={index}>
                    <Link to={`/games?filterCategory=${category.name}`} className="text-gray-700 menu-item">
                        {category.name}
                    </Link>
                    <GameCategoryInternalDropDownItem subgenres={category.subgenres} />
                </li>
            ))}
        </ul>
    );
};

const gameCategories = [
    {
        name: "Action",
        subgenres: ["Platformers", "Fighting", "Shooter", "Stealth"],
    },
    {
        name: "Adventure",
        subgenres: ["Graphic Adventure", "Text Adventure", "Interactive Fiction"],
    },
    {
        name: "Role-Playing Games (RPGs)",
        subgenres: ["Western RPG", "Japanese RPG", "Tactical RPG", "Action RPG"],
    },
    {
        name: "Simulation",
        subgenres: ["Life Simulation", "Flight Simulation", "Vehicle Simulation", "Farming Simulation"],
    },
    {
        name: "Strategy",
        subgenres: ["Real-Time Strategy (RTS)", "Turn-Based Strategy (TBS)", "Tower Defense"],
    },
    {
        name: "Puzzle",
        subgenres: ["Logic Puzzles", "Match-3", "Word Puzzles"],
    },
    {
        name: "Sports",
        subgenres: ["Team Sports", "Racing", "Fitness"],
    },
    {
        name: "Card and Board Games",
        subgenres: ["Trading Card Games (TCGs)", "Board Games", "Dice Games"],
    },
    {
        name: "Massively Multiplayer Online (MMO)",
        subgenres: ["MMORPG", "MMOFPS", "MMORTS"],
    },
    {
        name: "Horror",
        subgenres: ["Survival Horror", "Psychological Horror"],
    },
    {
        name: "Casual Games",
        subgenres: ["Mobile Games", "Party Games"],
    },
    {
        name: "Educational Games",
        subgenres: ["Trivia", "Language Learning"],
    },
];

export default GameCategoryDropDown;