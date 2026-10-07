import { apiClient } from "../../api/client";

/** Демо-сайт для портфолио: своя копия магазина на сутки, демо-аккаунты, демо-почта. */
export interface DemoSandbox {
  createdAt: string;
  expiresAt: string;
}

export interface DemoAccount {
  role: "admin" | "buyer" | string;
  username: string;
  password: string;
}

export interface DemoConfig {
  enabled: boolean;
  sandbox?: DemoSandbox | null;
  sandboxHours?: number;
  accounts?: DemoAccount[];
}

export interface DemoLetter {
  id: string;
  to: string;
  subject: string;
  text: string;
  html: string | null;
  sentAt: string;
}

export const getDemoConfig = async (): Promise<DemoConfig> =>
  (await apiClient().get<DemoConfig>("/api/demo/config")).data;

export const openDemoSandbox = async (): Promise<DemoSandbox> =>
  (await apiClient().post<DemoSandbox>("/api/demo/sandbox")).data;

export const resetDemoSandbox = async (): Promise<DemoSandbox> =>
  (await apiClient().post<DemoSandbox>("/api/demo/sandbox/reset")).data;

export const getDemoMailbox = async (): Promise<DemoLetter[]> =>
  (await apiClient().get<DemoLetter[]>("/api/demo/mailbox")).data;

export { DEMO_EVENT, demoRefusalCode } from "./demoEvents";
export type { DemoRefusalCode } from "./demoEvents";
