import { useEffect, useState } from "react";
import { useKeycloak } from "@react-keycloak/web";
import { getDemoConfig, type DemoConfig } from "./demoApi";

/**
 * Настройки демо-сайта — один запрос на вкладку: их читают кружок «Демо», окно приглашения и подсказка на кассе.
 * На обычном магазине сервер отвечает { enabled: false }, при ошибке считаем так же.
 */
let pending: Promise<DemoConfig> | null = null;

export const loadDemoConfig = (refresh = false): Promise<DemoConfig> => {
  if (!pending || refresh) {
    pending = getDemoConfig().catch(() => ({ enabled: false }));
  }
  return pending;
};

export const useDemoConfig = (): DemoConfig | null => {
  const [config, setConfig] = useState<DemoConfig | null>(null);
  useEffect(() => {
    let active = true;
    loadDemoConfig().then((value) => {
      if (active) setConfig(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return config;
};

/**
 * Вошёл общий демо-админ (учётка с ролью admin из настроек демо) — тот же признак, что у сервера. Ему закрыты записи,
 * и витрина заранее показывает это там, где иначе он нажал бы кнопку и получил отказ.
 */
export const useIsDemoViewer = (): boolean => {
  const config = useDemoConfig();
  const { keycloak } = useKeycloak();
  const username = (keycloak.tokenParsed as { preferred_username?: string } | undefined)?.preferred_username;
  return Boolean(
    config?.enabled
      && username
      && config.accounts?.some((account) => account.role === "admin" && account.username.toLowerCase() === username.toLowerCase()),
  );
};
