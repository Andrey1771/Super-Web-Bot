import i18n from "../i18n";

// Подпись берётся из словаря в момент показа — на языке сайта.
const fallbackCoverAlt = () => i18n.t("common.blogCover");

export const normalizeBlogCoverUrl = (value?: string | null): string | null => {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
};

export const getBlogCoverAlt = (title?: string | null): string => {
    if (typeof title !== "string") {
        return fallbackCoverAlt();
    }

    const normalized = title.trim();
    return normalized.length > 0 ? normalized : fallbackCoverAlt();
};

