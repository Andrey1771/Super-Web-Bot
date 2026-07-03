import { useEffect, useState } from 'react';
import container from '../inversify.config';
import IDENTIFIERS from '../constants/identifiers';
import type { ISettingsService } from '../iterfaces/i-settings-service';
import type { Settings } from '../models/settings';

// Единая точка чтения настроек сайта (почта поддержки и т.п.).
// Результат кешируется на время жизни вкладки — настройки меняются редко,
// и десяток компонентов не должен дёргать /api/Settings каждый по разу.

export const DEFAULT_SUPPORT_EMAIL = 'support@taleshop.local';

let settingsPromise: Promise<Settings | null> | null = null;

const loadSettings = (): Promise<Settings | null> => {
    if (!settingsPromise) {
        const settingsService = container.get<ISettingsService>(IDENTIFIERS.ISettingsService);
        settingsPromise = settingsService
            .getAllSettings()
            .then((all) => all[0] ?? null)
            .catch((error) => {
                console.error('Failed to load site settings:', error);
                settingsPromise = null; // не кешируем неудачу — следующий вызов попробует снова
                return null;
            });
    }
    return settingsPromise;
};

// Сбрасывает кеш (зовём после сохранения настроек в админке).
export const invalidateSiteSettings = () => {
    settingsPromise = null;
};

export const useSiteSettings = () => {
    const [settings, setSettings] = useState<Settings | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let active = true;
        loadSettings().then((data) => {
            if (active) {
                setSettings(data);
                setIsLoading(false);
            }
        });
        return () => {
            active = false;
        };
    }, []);

    const supportEmail = settings?.supportEmail?.trim() || DEFAULT_SUPPORT_EMAIL;

    return { settings, supportEmail, isLoading };
};
