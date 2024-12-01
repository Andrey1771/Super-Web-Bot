import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';

function CallbackPage() {
    const oidc = useAuth();
    const navigate = useNavigate();

    React.useEffect(() => {
        (async () => {
            //navigate('/');
        })()
    }, [oidc]);

    return <p>Loading...</p>;
}

export default CallbackPage;