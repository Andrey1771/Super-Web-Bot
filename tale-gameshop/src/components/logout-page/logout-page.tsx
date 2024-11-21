import React, {useState} from "react";
import {useNavigate} from "react-router-dom";
import container from "../../inversify.config";
import {IAuthStorageService} from "../../iterfaces/i-auth-storage-service";
import IDENTIFIERS from "../../constants/identifiers";
import {login} from "../../services/auth-service";

const LogoutForm: React.FC = () => {
    const navigate = useNavigate();

    const tokenStorage = container.get<IAuthStorageService>(IDENTIFIERS.IAuthStorageService);

    const handleSubmit = () => {
        try {
            tokenStorage.setItem("token", "");
            navigate('/');//TODO home
            console.log('Logout successful');
            // Дополнительная обработка, например, сохранение токена или перенаправление
        } catch (error) {
            console.error('Error logout:', error);
        }
        return (<div></div>);
    };

    return (<div>{
        handleSubmit()
    }</div>);//TODO home});
};

export default LogoutForm;