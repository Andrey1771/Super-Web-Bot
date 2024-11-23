import { LoginResponse } from "../models/login-response";
import { RegisterResponse } from "../models/register-response";
import axios from 'axios';

export const login = async (email: string, password: string): Promise<LoginResponse> => {
    try {
        const response = await axios.post('https://localhost:7083/api/Auth/login', {
            username: email,
            password: password,
        }, {
            headers: {
                'Content-Type': 'application/json',
            },
        });
        return response.data;
    } catch (error) {
        throw new Error('Login failed');
    }
};

export const register = async (email: string, password: string): Promise<RegisterResponse> => {
    try {
        const response = await axios.post('https://localhost:7083/api/Auth/register', {
            username: email,
            password: password,
        }, {
            headers: {
                'Content-Type': 'application/json',
            },
        });
        return response.data;
    } catch (error) {
        throw new Error('Registration failed');
    }
};
/*

import { UserManager } from "oidc-client-ts";

const config = {
    authority: "https://localhost:7083/api", // IdentityServer
    client_id: "tale-gameshop",
    redirect_uri: "http://localhost:3000/callback", // URL для редиректа после логина
    response_type: "code",
    scope: "openid profile api1 roles",
    post_logout_redirect_uri: "http://localhost:3000/",
};

const userManager = new UserManager(config);

export const login = () => userManager.signinRedirect();
export const logout = () => userManager.signoutRedirect();
export const getUser = () => userManager.getUser();
export const renewToken = () => userManager.signinSilent();*/
