import React, {useEffect, useMemo, useState} from "react";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import type {IconDefinition} from "@fortawesome/fontawesome-svg-core";
import {
    faBookOpen,
    faDice,
    faGamepad,
    faNewspaper,
    faRotate,
    faStar,
    faTags,
    faTrophy,
    faWandMagicSparkles
} from "@fortawesome/free-solid-svg-icons";
import {getBlogCoverAlt, normalizeBlogCoverUrl} from "../../utils/blog-cover";
import "./post-cover-art.css";

/**
 * Обложка поста. Если у поста есть настоящая картинка — рисуем её; если нет
 * (или она не загрузилась) — детерминированную заглушку по первой метке поста:
 * градиент + иконка рубрики. Один пост выглядит одинаково везде — в ленте,
 * в хиро статьи и в related, а разные рубрики перестают сливаться в один
 * повторяющийся плейсхолдер.
 */

type CoverTheme = {
    icon: IconDefinition;
    from: string;
    to: string;
    accent: string;
};

// Именованные палитры известных рубрик — светлые пастельные градиенты в тон сайта.
const TAG_THEMES: Record<string, CoverTheme> = {
    news: {icon: faNewspaper, from: "#efeaff", to: "#dbceff", accent: "#6b3ff2"},
    deals: {icon: faTags, from: "#fff0e2", to: "#ffd6bc", accent: "#e2662f"},
    guides: {icon: faBookOpen, from: "#e3f6f0", to: "#c2ecdc", accent: "#11916f"},
    updates: {icon: faRotate, from: "#e7f0fe", to: "#c9defd", accent: "#2f6fd8"}
};

// Пул для неизвестных меток: тема выбирается хэшем от названия метки,
// поэтому одна и та же метка всегда даёт одну и ту же обложку.
const FALLBACK_THEMES: CoverTheme[] = [
    {icon: faGamepad, from: "#efeaff", to: "#dbceff", accent: "#6b3ff2"},
    {icon: faStar, from: "#fdeef7", to: "#f8cfe6", accent: "#c9407e"},
    {icon: faDice, from: "#e3f6f0", to: "#c2ecdc", accent: "#11916f"},
    {icon: faTrophy, from: "#fff5df", to: "#ffe2ad", accent: "#c07f14"},
    {icon: faWandMagicSparkles, from: "#e7f0fe", to: "#c9defd", accent: "#2f6fd8"}
];

const themeForTag = (tag?: string): CoverTheme => {
    const key = tag?.trim().toLowerCase() ?? "";
    const named = key ? TAG_THEMES[key] : undefined;
    if (named) {
        return named;
    }

    let hash = 0;
    for (const char of key) {
        hash = (hash * 31 + char.charCodeAt(0)) % 997;
    }
    return FALLBACK_THEMES[hash % FALLBACK_THEMES.length];
};

type PostCoverArtProps = {
    post?: {
        coverUrl?: string | null;
        imageUrl?: string | null;
        tags?: string[];
        title?: string;
    } | null;
    className?: string;
    loading?: "eager" | "lazy";
};

export default function PostCoverArt({post, className, loading}: PostCoverArtProps) {
    const coverUrl = normalizeBlogCoverUrl(post?.coverUrl ?? post?.imageUrl);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setFailed(false);
    }, [coverUrl]);

    const theme = useMemo(() => themeForTag(post?.tags?.[0]), [post?.tags]);

    if (coverUrl && !failed) {
        return (
            <img
                className={className}
                src={coverUrl}
                alt={getBlogCoverAlt(post?.title)}
                loading={loading}
                onError={() => setFailed(true)}
            />
        );
    }

    return (
        <div
            className={`post-cover-art${className ? ` ${className}` : ""}`}
            role="img"
            aria-label={getBlogCoverAlt(post?.title)}
            style={{background: `linear-gradient(135deg, ${theme.from}, ${theme.to})`}}
        >
            <FontAwesomeIcon className="post-cover-art__icon" icon={theme.icon} style={{color: theme.accent}} />
            <FontAwesomeIcon
                className="post-cover-art__ghost"
                icon={theme.icon}
                style={{color: theme.accent}}
                aria-hidden="true"
            />
        </div>
    );
}
