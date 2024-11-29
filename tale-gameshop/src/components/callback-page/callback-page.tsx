import React, { useEffect } from 'react';
import {UserManager, WebStorageStateStore} from 'oidc-client-ts';
import { useNavigate } from 'react-router-dom';
//import { userManager } from '../../services/auth-service';
import { useAuth } from 'react-oidc-context';
import authService, { userManager } from '../../services/auth-service';

function CallbackPage() {
    const oidc = useAuth();
    const navigate = useNavigate();

    React.useEffect(() => {
        (async () => {
            //const oidcStorage = localStorage.getItem(`oidc.user:<your authority>:<your client id>`)
            console.log(oidc.user);
            console.log(aaa(oidc))
            console.log(localStorage)
            //const user = await userManager.signinRedirectCallback();
           // console.log(oidc.user);
            /*oidc.signinRedirect().then(() => {
                console.log(oidc.user);
                window.location.replace('/');
            });*/
            //const user = oidc.signinPopup();
            //console.log(user);
            /*await userManager.signinRedirectCallback().then(() => {
                navigate("/");
            });

            return oidc.events.addAccessTokenExpiring(() => {
                oidc.signinSilent();
            })*/
            console.log(await authService.signinRedirectCallback());
            navigate('/');
        })()
    }, [oidc]);

    return <p>Loading...</p>;
}

function aaa(auth: any) {
    switch (auth.activeNavigator) {
        case "signinSilent":
            return <div>Signing you in...</div>;
        case "signoutRedirect":
            return <div>Signing you out...</div>;
    }

    if (auth.isLoading) {
        return <div>Loading...</div>;
    }

    if (auth.error) {
        return <div>Oops... {auth.error.message}</div>;
    }

    if (auth.isAuthenticated) {
        return (
            <div>
                Hello {auth.user?.profile.sub}{" "}
                <button onClick={() => void auth.removeUser()}>Log out</button>
            </div>
        );
    }

    return <button onClick={() => void auth.signinRedirect()}>Log in</button>;
}

/*function getUser() {
    const oidcStorage = localStorage.getItem(`oidc.user:<your authority>:<your client id>`)
    if (!oidcStorage) {
        return null;
    }

    return User.fromStorageString(oidcStorage);
}*/

/*const CallbackPage = () => {
    const navigate = useNavigate();

    let k = 0;
    useEffect(() => {
        (async () => {
            try {
                if (k== 1) return;
                k=1;
                console.warn(localStorage);
                /!*if (localStorage.getItem('callback_processed')) {
                    console.warn('Callback already processed, skipping...');
                    navigate('/');
                    return;
                }*!/

                console.log(window.localStorage)
                //userManager.signinCallback();
                const user = await userManager.signinRedirectCallback(); //userManager.signinRedirectCallback(); //userManager.signinCallback(window.location.href); //await userManager.signinRedirectCallback();
                console.log(user)
                //localStorage.setItem('callback_processed', 'true');
                //navigate(user.state || '/');
            } catch (err) {
                console.error('Error during callback processing:', err);
                //navigate('/error');
                console.log(await userManager.getUser())
            }
        })();
    }, [navigate]);

    return <div>Processing login...</div>;
};*/
export default CallbackPage;