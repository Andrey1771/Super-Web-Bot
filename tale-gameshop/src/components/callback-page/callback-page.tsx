import { useEffect } from 'react';
import {UserManager, WebStorageStateStore} from 'oidc-client-ts';
import { useNavigate } from 'react-router-dom';
import { userManager } from '../../services/auth-service';

const CallbackPage = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const processCallback = async () => {
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const code = urlParams.get('code');
                if (!code) {
                    console.error('No authorization code in the URL');
                    navigate('/error');
                    return;
                }

                const user = await userManager.signinRedirectCallback();
                if (user.state) {
                    navigate(user.state);
                } else {
                    navigate('/');
                }
            } catch (err) {
                console.error('Error during callback processing:', err);
                navigate('/error');
            }
        };

        processCallback();
    }, [navigate]);

    return <div>Processing login...</div>;
};
export default CallbackPage;