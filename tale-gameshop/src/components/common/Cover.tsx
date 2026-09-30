import React, { CSSProperties, ImgHTMLAttributes, useMemo } from 'react';
import SafeGameImage from './SafeGameImage';
import { normalizeGameCoverUrl } from '../../utils/game-cover';
import {
    COVER_PLACEHOLDER_WIDTH,
    COVER_RATIO_CSS,
    COVER_WIDTHS,
    CoverRatio,
    buildCoverSrcSet,
    coverVariantUrl,
} from '../../utils/cover-variants';
import './cover.css';

export interface CoverProps {
    src?: string | null;
    /** Название товара — в alt. */
    title?: string | null;
    baseUrl?: string | null;
    /** Рамка. Картинка обрезается под неё, а не растягивает карточку. */
    ratio?: CoverRatio;
    /**
     * Сколько места рамка занимает на экране — атрибут sizes для srcset, например
     * "(max-width: 640px) 50vw, 240px". Без него браузер считает картинку во всю ширину окна и берёт самую большую.
     */
    sizes?: string;
    widths?: readonly number[];
    /** Первый экран: грузить сразу, без lazy. */
    priority?: boolean;
    /** Размытая крошечная копия под картинкой, пока та грузится: для крупных рамок. */
    blur?: boolean;
    className?: string;
    style?: CSSProperties;
    /** Тег рамки: внутри кнопки или ссылки-строки нужен span. */
    as?: 'div' | 'span';
    imgClassName?: string;
    imgProps?: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'srcSet' | 'sizes' | 'loading' | 'className'>;
    /** Бейджи, цена, сердечко: кладутся поверх картинки, позиционируются относительно рамки. */
    children?: React.ReactNode;
}

/**
 * Обложка товара в рамке.
 *
 * Рамку задаёт сайт, а не файл: у плитки каталога квадрат, у Star deal вертикаль, у баннера широкая полоса.
 * Картинка кладётся внутрь и обрезается по краям, поэтому карточка не зависит от того, какой формы файл загрузил
 * админ. Раньше рамка была объявлена, но не держалась: вертикальная обложка вытягивала весь ряд карточек.
 *
 * Внутри — варианты нужной ширины (srcset), чтобы плитка весила килобайты, а не исходник на мегабайты.
 */
const Cover: React.FC<CoverProps> = ({
    src,
    title,
    baseUrl,
    ratio = 'square',
    sizes,
    widths = COVER_WIDTHS,
    priority = false,
    blur = false,
    className,
    style,
    as: Tag = 'div',
    imgClassName,
    imgProps,
    children,
}) => {
    const resolved = useMemo(() => normalizeGameCoverUrl(src, baseUrl), [src, baseUrl]);
    const srcSet = useMemo(() => buildCoverSrcSet(resolved, ratio, widths), [resolved, ratio, widths]);
    const placeholder = useMemo(
        () => (blur ? coverVariantUrl(resolved, COVER_PLACEHOLDER_WIDTH, ratio) : null),
        [blur, resolved, ratio],
    );

    const frameStyle: CSSProperties = {
        ...style,
        ['--cover-ratio' as string]: COVER_RATIO_CSS[ratio],
        ...(placeholder ? { backgroundImage: `url("${placeholder}")` } : {}),
    };

    return (
        <Tag className={`cover${blur && placeholder ? ' cover--blur' : ''}${className ? ` ${className}` : ''}`} style={frameStyle} data-ratio={ratio}>
            <SafeGameImage
                {...imgProps}
                className={`cover__img${imgClassName ? ` ${imgClassName}` : ''}`}
                src={resolved}
                gameTitle={title}
                srcSet={srcSet}
                sizes={srcSet ? sizes : undefined}
                loading={priority ? 'eager' : 'lazy'}
                decoding="async"
                fetchPriority={priority ? 'high' : undefined}
            />
            {children}
        </Tag>
    );
};

export default Cover;
