export interface IAuthStorageService {
    getItem(key: string): string | undefined;

    setItem(key: string, value: string): void;
}