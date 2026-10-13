import { apiClient } from "../../api/client";

/**
 * Демо-сайт для портфолио: обычный магазин, где посетители регистрируются и покупают тестовой картой,
 * а общий демо-админ видит админку в режиме «только просмотр».
 */
export interface DemoAccount {
  role: "admin" | string;
  username: string;
  password: string;
}

export interface DemoConfig {
  enabled: boolean;
  accounts?: DemoAccount[];
}

export const getDemoConfig = async (): Promise<DemoConfig> =>
  (await apiClient().get<DemoConfig>("/api/demo/config")).data;

export { DEMO_EVENT } from "./demoEvents";
export type { DemoRefusalCode } from "./demoEvents";
