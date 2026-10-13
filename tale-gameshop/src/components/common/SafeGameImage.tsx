import React, { ImgHTMLAttributes, useEffect, useMemo, useState } from "react";
import {
  GAME_COVER_FALLBACK,
  gameCoverFallbackAlt,
  normalizeGameCoverUrl,
} from "../../utils/game-cover";

type SafeGameImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  src?: string | null;
  gameTitle?: string | null;
  baseUrl?: string | null;
  fallbackAlt?: string;
};

const trimText = (value?: string | null): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export default function SafeGameImage({
  src,
  gameTitle,
  baseUrl,
  fallbackAlt,
  onError,
  ...props
}: SafeGameImageProps) {
  const normalizedSrc = useMemo(() => normalizeGameCoverUrl(src, baseUrl), [src, baseUrl]);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [normalizedSrc]);

  const resolvedSrc = hasError || !normalizedSrc ? GAME_COVER_FALLBACK : normalizedSrc;
  const resolvedAlt = !hasError && normalizedSrc ? trimText(gameTitle) ?? gameCoverFallbackAlt() : fallbackAlt ?? gameCoverFallbackAlt();

  const handleError: ImgHTMLAttributes<HTMLImageElement>["onError"] = (event) => {
    if (!hasError) {
      setHasError(true);
    }

    onError?.(event);
  };

  // Заглушка — один файл без вариантов: srcset исходника с ней не сочетается и повторял бы ошибку.
  const { srcSet, sizes, ...rest } = props;
  return (
    <img
      {...rest}
      src={resolvedSrc}
      alt={resolvedAlt}
      srcSet={hasError ? undefined : srcSet}
      sizes={hasError ? undefined : sizes}
      onError={handleError}
    />
  );
}
