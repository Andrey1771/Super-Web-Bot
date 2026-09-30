import { Game } from './game';

export type GameKey = {
    game: Game | null;
    key: string;
    keyType: string;
    issuedAt: string;
    isActive: boolean;
    /** Game или Software. Нет поля — игра (старый ответ). */
    kind?: 'Game' | 'Software';
    /** Лицензия ПО: «1 year · 3 devices» (английский запас; подпись собирает licenseText). */
    license?: string | null;
    licenseTermMonths?: number | null;
    licenseDevices?: number | null;
    licenseIsSubscription?: boolean;
    /** Где активировать ключ ПО. */
    activation?: { target: string; url?: string | null; label?: string | null } | null;
};
