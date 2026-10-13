import { apiClient } from "./client";

/** Сеть из списка, для которого у подвала есть иконка. */
export type SocialNetwork = "telegram" | "discord" | "x";

export type SocialLink = { network: SocialNetwork; url: string };

/** Ссылки на соцсети магазина из настроек сайта. Пустой список — блока соцсетей в подвале нет. */
export const getSocialLinks = async (): Promise<SocialLink[]> => {
  const response = await apiClient().get("/api/about/social");
  return Array.isArray(response.data) ? response.data : [];
};
