import React from 'react';
import {useNavigate} from "react-router-dom";
import container from "../../inversify.config";
import {IAuthStorageService} from "../../iterfaces/i-auth-storage-service";
import IDENTIFIERS from "../../constants/identifiers";

const SignOutButton: React.FC = () => {
    const navigate = useNavigate();

    const tokenStorage = container.get<IAuthStorageService>(IDENTIFIERS.IAuthStorageService);

    const handleSignOut = () => {
        try {
            tokenStorage.setItem("token", "");
            navigate('/');//TODO home
            console.log('Logout successful');
            // Дополнительная обработка, например, сохранение токена или перенаправление
        } catch (error) {
            console.error('Error logout:', error);
        }
    };

    return <button className="px-4 py-2 bg-black text-white animated-button" onClick={handleSignOut}>Sign Out</button>;
};

export default SignOutButton;