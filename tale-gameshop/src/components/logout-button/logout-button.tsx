import React from 'react';
import {useNavigate} from "react-router-dom";
import container from "../../inversify.config";
import {IAuthStorageService} from "../../iterfaces/i-auth-storage-service";
import IDENTIFIERS from "../../constants/identifiers";

interface ChildComponentProps {
    onTokenChange: (token: string) => void; // Функция из родителя
}

const LogOutButton: React.FC<ChildComponentProps> = ({ onTokenChange }) => {
    const navigate = useNavigate();

    const tokenStorage = container.get<IAuthStorageService>(IDENTIFIERS.IAuthStorageService);

    const handleLogOut = () => {
        try {
            tokenStorage.setItem("token", "");
            navigate('/');//TODO home
            onTokenChange("");
            console.log('Logout successful');
            // Дополнительная обработка, например, сохранение токена или перенаправление
        } catch (error) {
            console.error('Error logout:', error);
        }
    };

    return <button className="px-4 py-2 bg-black text-white animated-button" onClick={handleLogOut}>Sign Out</button>;
};

export default LogOutButton;