import { useEffect } from 'react';
import {UserManager, WebStorageStateStore} from 'oidc-client-ts';
import { useNavigate } from 'react-router-dom';
import { userManager } from '../../services/auth-service';

const CallbackPage = () => {
    const navigate = useNavigate();
    let t = 0;

    useEffect(() => {
        (async () => {
            try {
                if(t===1) return;
                t = 1;
                if (localStorage.getItem('callback_processed')) {
                    console.warn('Callback already processed, skipping...');
                    navigate('/');
                    return;
                }

                const user = await userManager.signinRedirectCallback();
                localStorage.setItem('callback_processed', 'true');
                navigate(user.state || '/');
            } catch (err) {
                console.error('Error during callback processing:', err);
                navigate('/error');
            }
        })();
    }, [navigate]);

    return <div>Processing login...</div>;
};
export default CallbackPage;