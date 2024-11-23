import React, {useEffect} from 'react';
import { Game } from '../../models/game';
import axios from "axios";
import container from "../../inversify.config";
import type {IAuthStorageService} from "../../iterfaces/i-auth-storage-service";
import IDENTIFIERS from "../../constants/identifiers";
import {decodeToken} from "../../utils/token-utils";

const AdminPanelPage: () => React.JSX.Element = () => {
    useEffect(() => {
        (async () => {
            try {
                const response = await axios.get('https://localhost:7117/api/Admin');
            } catch (error) {
                console.error('Error get data:', error);
            }
        })();
    }, []);

    return (
        <div>
            response
        </div>
    );
};

export default AdminPanelPage;