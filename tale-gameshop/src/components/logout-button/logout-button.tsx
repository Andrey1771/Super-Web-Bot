import React from 'react';
import {useNavigate} from "react-router-dom";
import container from "../../inversify.config";
import {IAuthStorageService} from "../../iterfaces/i-auth-storage-service";
import IDENTIFIERS from "../../constants/identifiers";
import {decodeToken} from "../../utils/token-utils";
import {useDispatch} from "react-redux";

const LogOutButton: React.FC = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const tokenStorage = container.get<IAuthStorageService>(IDENTIFIERS.IAuthStorageService);

    const handleLogOut = () => {
        try {
            navigate('/');//TODO home
            dispatch({ type: 'SET_JWT', payload: "" })
            console.log('Logout successful');
            // Дополнительная обработка, например, сохранение токена или перенаправление
        } catch (error) {
            console.error('Error logout:', error);
        }
    };

    return <button className="px-4 py-2 bg-black text-white animated-button" onClick={handleLogOut}>Sign Out</button>;
};

export default LogOutButton;