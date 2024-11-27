import { useEffect } from 'react';
import {UserManager, WebStorageStateStore} from 'oidc-client-ts';
import { useNavigate } from 'react-router-dom';
import { userManager } from '../../services/auth-service';

const CallbackPage = () => {
    const navigate = useNavigate();

    useEffect(() => {
        (async () => {
            try {
                /*if (localStorage.getItem('callback_processed')) {
                    console.warn('Callback already processed, skipping...');
                    navigate('/');
                    return;
                }*/

                console.log(window.localStorage)
                const user = await userManager.signinRedirectCallback(window.location.href); //userManager.signinCallback(window.location.href,); //await userManager.signinRedirectCallback();
                //localStorage.setItem('callback_processed', 'true');
                //navigate(user.state || '/');
            } catch (err) {
                console.error('Error during callback processing:', err);
                navigate('/error');
            }
        })();
    }, [navigate]);

    return <div>Processing login...</div>;
};
export default CallbackPage;