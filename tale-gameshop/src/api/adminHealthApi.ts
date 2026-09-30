import { apiClient } from "./client";

export type ServiceHealthState = "ok" | "configured" | "warn" | "down" | "unconfigured";

export interface ServiceHealthSnapshot {
  name: string;
  state: ServiceHealthState;
  detail?: string | null;
  /** С какого момента держится это состояние — отсюда «сломано уже 3 часа». */
  since?: string | null;
  /** Когда проверка выполнялась в последний раз. */
  updatedAt?: string | null;
}

/** Последние снимки фонового прогона. Ничего не проверяет заново — просто читает. */
export const fetchServiceHealth = async (): Promise<ServiceHealthSnapshot[]> => {
  const response = await apiClient().get("/api/admin/health");
  return response.data as ServiceHealthSnapshot[];
};

/**
 * Прогнать проверки сейчас. Это тот же прогон, что и по расписанию, со всеми последствиями:
 * снимки обновятся, а изменившееся состояние уедет письмом владельцу.
 */
export const runServiceHealthCheck = async (): Promise<ServiceHealthSnapshot[]> => {
  const response = await apiClient().post("/api/admin/health/run");
  return response.data as ServiceHealthSnapshot[];
};
