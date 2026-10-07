import { getSocialLinks, type SocialLink } from "../api/socialApi";
import { createCachedResource } from "./use-cached-resource";

/** Подвал есть на каждой странице — один запрос на вкладку и короткий кэш. В ссылках нет текстов, поэтому язык не важен. */
const useSocialLinksResource = createCachedResource(getSocialLinks, [] as SocialLink[], undefined, { perLanguage: false });

export const useSocialLinks = (): SocialLink[] => useSocialLinksResource().data;
