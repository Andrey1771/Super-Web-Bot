import fallbackCoverImage from "../assets/images/untitled_cover.png";

const FALLBACK_COVER_ALT = "Blog post cover";

export const BLOG_FALLBACK_COVER = fallbackCoverImage;

export const normalizeBlogCoverUrl = (value?: string | null): string | null => {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
};

export const getBlogCoverUrl = (value?: string | null): string => normalizeBlogCoverUrl(value) ?? BLOG_FALLBACK_COVER;

export const getBlogCoverAlt = (title?: string | null): string => {
    if (typeof title !== "string") {
        return FALLBACK_COVER_ALT;
    }

    const normalized = title.trim();
    return normalized.length > 0 ? normalized : FALLBACK_COVER_ALT;
};
