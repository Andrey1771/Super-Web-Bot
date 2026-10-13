import i18n from "../i18n";
import gameCoverFallback from "../assets/images/placeholders/game-cover-fallback.webp";

const ABSOLUTE_URL_RE = /^(?:[a-z]+:)?\/\//i;

export const GAME_COVER_FALLBACK = gameCoverFallback;
/** Подпись-запаска обложки — на языке сайта, поэтому функция, а не константа. */
export const gameCoverFallbackAlt = () => i18n.t("common.gameCover");

const trimToUndefined = (value?: string | null): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizePath = (value: string): string => value.replace(/^\/?wwwroot\//, "/");

export const normalizeGameCoverUrl = (value?: string | null, baseUrl?: string | null): string | undefined => {
  const normalizedInput = trimToUndefined(value);
  if (!normalizedInput || normalizedInput.toLowerCase() === "string") {
    return undefined;
  }

  const normalizedPath = normalizePath(normalizedInput);
  if (ABSOLUTE_URL_RE.test(normalizedPath) || normalizedPath.startsWith("data:") || normalizedPath.startsWith("blob:")) {
    return normalizedPath;
  }

  const trimmedBaseUrl = trimToUndefined(baseUrl)?.replace(/\/$/, "");
  if (!trimmedBaseUrl) {
    return normalizedPath;
  }

  const urlPath = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  return `${trimmedBaseUrl}${urlPath}`;
};

