import React, {ImgHTMLAttributes, SyntheticEvent, useEffect, useMemo, useState} from "react";
import {BLOG_FALLBACK_COVER, getBlogCoverAlt, getBlogCoverUrl} from "../../utils/blog-cover";

type SafeBlogImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
    src?: string | null;
    alt?: string | null;
};

export default function SafeBlogImage({src, alt, onError, ...props}: SafeBlogImageProps) {
    const normalizedSrc = useMemo(() => getBlogCoverUrl(src), [src]);
    const [currentSrc, setCurrentSrc] = useState(normalizedSrc);

    useEffect(() => {
        setCurrentSrc(normalizedSrc);
    }, [normalizedSrc]);

    const handleError = (event: SyntheticEvent<HTMLImageElement, Event>) => {
        if (currentSrc !== BLOG_FALLBACK_COVER) {
            setCurrentSrc(BLOG_FALLBACK_COVER);
        }

        if (onError) {
            onError(event);
        }
    };

    return <img {...props} src={currentSrc} alt={getBlogCoverAlt(alt)} onError={handleError} />;
}
