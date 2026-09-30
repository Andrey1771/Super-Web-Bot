import { getSocialLinks, type SocialLink } from "../api/socialApi";
import { createCachedResource } from "./use-cached-resource";

/** Подвал есть на каждой странице — один запрос на вкладку и короткий кэш. */
const useSocialLinksResource = createCachedResource(getSocialLinks, [] as SocialLink[]);

export const useSocialLinks = (): SocialLink[] => useSocialLinksResource().data;
