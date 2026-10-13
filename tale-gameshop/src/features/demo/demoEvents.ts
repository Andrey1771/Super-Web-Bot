/**
 * Сервер отказал по правилам демо: демо-админ — «только просмотр» (403 demo_readonly).
 * Клиент API сообщает об этом событием — его слушает DemoLayer и показывает пояснение.
 */
export const DEMO_EVENT = "taleshop:demo";

export type DemoRefusalCode = "demo_readonly";

export const demoRefusalCode = (status: number | undefined, data: unknown): DemoRefusalCode | null => {
  const code = (data as { code?: unknown } | null | undefined)?.code;
  if (status === 403 && code === "demo_readonly") return code;
  return null;
};
