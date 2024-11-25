import { useEffect } from 'react';
import { UserManager } from 'oidc-client-ts';
import { useNavigate } from 'react-router-dom';

const Callback = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const userManager = new UserManager({
            authority: 'https://localhost:7083',
            client_id: 'your-client-id',
            redirect_uri: 'http://localhost:3000/callback',
            response_type: 'code',
            scope: 'openid profile api_scope',
        });

        userManager.signinRedirectCallback().then(user => {
            if (user.state) {
                navigate(user.state);
            } else {
                navigate('/');
            }
        }).catch(err => {
            console.error('Error during callback processing:', err);
            navigate('/error');
        });
    }, [navigate]);

    return <div>Processing login...</div>;
};

export default Callback;