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