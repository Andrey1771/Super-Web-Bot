import { jwtDecode, JwtPayload } from 'jwt-decode';

export interface CustomJwtPayload extends JwtPayload {
    role?: string | string[];
    userId?: string;
    unique_name?: string;
}

// Функция для расшифровки токена
export const decodeToken = (token: string): CustomJwtPayload | null => {
    try {
        return jwtDecode<CustomJwtPayload>(token);
    } catch (error) {
        console.error('Invalid token:', error);
        return null;
    }
};