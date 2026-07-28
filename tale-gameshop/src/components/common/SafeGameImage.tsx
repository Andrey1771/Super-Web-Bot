import React, { ImgHTMLAttributes, useEffect, useMemo, useState } from "react";
import { GAME_COVER_FALLBACK_ALT, normalizeGameCoverUrl } from "../../utils/game-cover";
import GameCoverPlaceholder from "./GameCoverPlaceholder";

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
  className,
  style,
  width,
  height,
  ...props
}: SafeGameImageProps) {
  const normalizedSrc = useMemo(() => normalizeGameCoverUrl(src, baseUrl), [src, baseUrl]);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [normalizedSrc]);

  // Нет валидного src или картинка не загрузилась → рисуем сгенерированную обложку
  // (градиент + название) вместо статичной заглушки. Работает и для реальных игр без обложки.
  if (hasError || !normalizedSrc) {
    return (
      <GameCoverPlaceholder
        title={trimText(gameTitle) ?? fallbackAlt}
        className={className}
        style={style}
        width={width}
        height={height}
      />
    );
  }

  const handleError: ImgHTMLAttributes<HTMLImageElement>["onError"] = (event) => {
    if (!hasError) {
      setHasError(true);
    }

    onError?.(event);
  };

  return (
    <img
      {...props}
      className={className}
      style={style}
      width={width}
      height={height}
      src={normalizedSrc}
      alt={trimText(gameTitle) ?? GAME_COVER_FALLBACK_ALT}
      onError={handleError}
    />
  );
}
