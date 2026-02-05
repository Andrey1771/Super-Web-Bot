export const resolveMediaUrl = (url: string | null | undefined, apiBaseUrl: string): string | undefined => {
  if (!url) {
    return undefined;
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (url.startsWith("data:")) {
    return url;
  }

  const normalizedBase = apiBaseUrl.replace(/\/$/, "");
  if (url.startsWith("/")) {
    return `${normalizedBase}${url}`;
  }

  return `${normalizedBase}/${url}`;
};

export const isPlaceholderThumbnailUrl = (url: string | null | undefined): boolean => {
  if (!url) {
    return false;
  }
  return url.includes("video-placeholder.svg");
};
