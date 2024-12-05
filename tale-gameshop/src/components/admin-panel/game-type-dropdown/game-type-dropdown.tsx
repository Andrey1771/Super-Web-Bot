import React, {useState} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Form } from '../../../store';

const gameTypes = {
    0: "Action",
    1: "Adventure",
    2: "Role-Playing Games",
    3: "Simulation",
    4: "Strategy",
    5: "Puzzle",
    6: "Sports",
    7: "Card and Board Games",
    8: "Massively Multiplayer Online",
    9: "Horror",
    10: "Casual Games",
    11: "Educational Games",
};


const GameTypeDropdown: React.FC = () => {
    const form = useSelector((state: {form: Form}) => state.form);//TODO
    const dispatch = useDispatch();

    const handleChangeSelect = (e: any) => {
        const value = parseInt(e.target.value, 10);
        if (!isNaN(value) && gameTypes.hasOwnProperty(value)) {
            dispatch({type: "SET_GAME_TYPE_FORM", payload: {...((form as unknown) as Form), gameType: value}})// TODO
        }
    }

    return (
        <div className="w-full">
            {/* Выпадающий список */}
            <select
                name="gameType"
                value={form.gameType}
                onChange={handleChangeSelect}
                className="w-full p-2 border rounded"
            >
                {Object.entries(gameTypes).map(([key, label]) => (
                    <option key={key} value={key}>
                        {label}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default GameTypeDropdown;
