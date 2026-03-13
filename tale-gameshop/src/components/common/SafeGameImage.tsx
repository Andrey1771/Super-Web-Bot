import React, { ImgHTMLAttributes, useEffect, useMemo, useState } from "react";
import {
  GAME_COVER_FALLBACK,
  GAME_COVER_FALLBACK_ALT,
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
  fallbackAlt = GAME_COVER_FALLBACK_ALT,
  onError,
  ...props
}: SafeGameImageProps) {
  const normalizedSrc = useMemo(() => normalizeGameCoverUrl(src, baseUrl), [src, baseUrl]);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [normalizedSrc]);

  const resolvedSrc = hasError || !normalizedSrc ? GAME_COVER_FALLBACK : normalizedSrc;
  const resolvedAlt = !hasError && normalizedSrc ? trimText(gameTitle) ?? GAME_COVER_FALLBACK_ALT : fallbackAlt;

  const handleError: ImgHTMLAttributes<HTMLImageElement>["onError"] = (event) => {
    if (!hasError) {
      setHasError(true);
    }

    onError?.(event);
  };

  return <img {...props} src={resolvedSrc} alt={resolvedAlt} onError={handleError} />;
}
