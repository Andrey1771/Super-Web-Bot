/**
 * Сервер отказал по правилам демо: без своей копии менять нельзя (409) или действие меняет сайт для всех (403).
 * Клиент API сообщает об этом событием — его слушает DemoLayer.
 */
export const DEMO_EVENT = "taleshop:demo";

export type DemoRefusalCode = "demo_sandbox_required" | "demo_readonly";

export const demoRefusalCode = (status: number | undefined, data: unknown): DemoRefusalCode | null => {
  const code = (data as { code?: unknown } | null | undefined)?.code;
  if (status === 409 && code === "demo_sandbox_required") return code;
  if (status === 403 && code === "demo_readonly") return code;
  return null;
};
