import React, { CSSProperties, ImgHTMLAttributes, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
    /**
     * Основной цвет обложки (#rrggbb из каталога): рамка сразу закрашена им, а картинка проявляется поверх,
     * когда загрузится, — вместо одинаковых пустых сиреневых квадратов.
     */
    color?: string | null;
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
/** Цвет из каталога попадает в style — только строгое #rrggbb, никаких произвольных строк. */
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const Cover: React.FC<CoverProps> = ({
    src,
    title,
    baseUrl,
    ratio = 'square',
    sizes,
    widths = COVER_WIDTHS,
    priority = false,
    blur = false,
    color,
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

    // Картинка проявляется, когда загрузилась (фон рамки уже её цвета) — без резкого «щелчка» из пустоты.
    // «Загружена» помнится для конкретного адреса, а не флагом со сбросом: из кэша браузера (возврат в каталог)
    // картинка загружается раньше, чем отработал бы сброс, и он затирал «загружена» — обложки оставались прозрачными.
    const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
    // Без адреса показывается заглушка — у неё свой ключ, пустая строка.
    const srcKey = resolved ?? '';
    const loaded = loadedSrc === srcKey;
    const frameRef = useRef<HTMLElement | null>(null);
    // Уже готовая из кэша — показываем до первой отрисовки, без проявления.
    useLayoutEffect(() => {
        const img = frameRef.current?.querySelector('img');
        if (img?.complete && img.naturalWidth > 0) {
            setLoadedSrc(srcKey);
        }
    }, [srcKey]);

    const frameStyle: CSSProperties = {
        ...style,
        ['--cover-ratio' as string]: COVER_RATIO_CSS[ratio],
        ...(color && HEX_COLOR.test(color) ? { ['--cover-bg' as string]: color } : {}),
        ...(placeholder ? { backgroundImage: `url("${placeholder}")` } : {}),
    };

    return (
        <Tag className={`cover${blur && placeholder ? ' cover--blur' : ''}${loaded ? ' cover--loaded' : ''}${className ? ` ${className}` : ''}`} style={frameStyle} data-ratio={ratio} ref={frameRef as React.Ref<HTMLDivElement & HTMLSpanElement>}>
            <SafeGameImage
                {...imgProps}
                onLoad={(event) => {
                    setLoadedSrc(srcKey);
                    imgProps?.onLoad?.(event);
                }}
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
