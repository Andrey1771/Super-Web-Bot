import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../context/cart-context';
import container from "../../inversify.config";
import {IKeycloakService} from "../../iterfaces/i-keycloak-service";
import IDENTIFIERS from "../../constants/identifiers";

function CallbackPage() {
    const navigate = useNavigate();
    const { syncCartWithServer } = useCart();

    React.useEffect(() => {
        (async () => {
            const keycloakService = container.get<IKeycloakService>(IDENTIFIERS.IKeycloakService);
            const s = keycloakService.keycloak;
            //await syncCartWithServer(userId);
            try {
                //const profile = await keycloakService.keycloak.loadUserProfile();
                //console.log('Retrieved user profile:', profile);
            } catch (error) {
                console.error('Failed to load user profile:', error);
            }
            navigate("/");
        })()
    });

    return <p>Loading...</p>;
}

export default CallbackPage;