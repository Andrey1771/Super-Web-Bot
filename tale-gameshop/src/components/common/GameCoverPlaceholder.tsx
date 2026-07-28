import React from "react";

// CSS-значение из width/height: число или "180" → "180px", "100%" оставляем как есть.
const toCss = (value?: string | number): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "number") {
    return `${value}px`;
  }
  return /^\d+$/.test(value) ? `${value}px` : value;
};

// Детерминированный оттенок из названия — у одной игры всегда одна и та же обложка.
const hueFromTitle = (title: string): number => {
  let hash = 0;
  for (let i = 0; i < title.length; i += 1) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
};

const monogramOf = (title: string): string => {
  const letters = title.replace(/[^A-Za-z0-9]/g, "");
  return (letters.slice(0, 2) || "TS").toUpperCase();
};

type GameCoverPlaceholderProps = {
  title?: string | null;
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * «Key-art» обложка-заглушка для игры без картинки: диагональный градиент по хешу названия,
 * крупный монограмм-вотермарк, свечение, нижний scrim и название снизу (как на постере).
 * Чистый DOM (не <img>, не data-URI) — обходит CSP. Масштабируется через container-query units
 * (cqw), поэтому одинаково хорошо смотрится и в маленькой карточке, и в большой hero-обложке.
 * Fallback в SafeGameImage — работает и для реальных игр без обложки, и для демо-каталога.
 */
const GameCoverPlaceholder: React.FC<GameCoverPlaceholderProps> = ({
  title,
  width,
  height,
  className,
  style,
}) => {
  const label = (title ?? "").trim() || "Tale Shop";
  const hue = hueFromTitle(label.toLowerCase());
  const background = `linear-gradient(150deg, hsl(${hue} 64% 46%) 0%, hsl(${(hue + 34) % 360} 60% 26%) 100%)`;
  const glow = `radial-gradient(70% 60% at 82% 12%, hsl(${hue} 92% 66% / 0.38), transparent 70%)`;
  const monogram = monogramOf(label);

  return (
    <div
      className={className}
      role="img"
      aria-label={label}
      style={{
        width: toCss(width) ?? "100%",
        height: toCss(height) ?? "100%",
        background,
        position: "relative",
        overflow: "hidden",
        containerType: "size",
        ...style,
      }}
    >
      <span aria-hidden style={{ position: "absolute", inset: 0, background: glow }} />
      <span
        aria-hidden
        style={{
          position: "absolute",
          right: "-4cqw",
          top: "-8cqw",
          fontSize: "clamp(90px, 46cqw, 240px)",
          fontWeight: 900,
          lineHeight: 1,
          letterSpacing: "-0.06em",
          color: "rgba(255, 255, 255, 0.12)",
          userSelect: "none",
        }}
      >
        {monogram}
      </span>
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "64%",
          background: "linear-gradient(to top, rgba(9, 7, 22, 0.6) 0%, rgba(9, 7, 22, 0.12) 55%, transparent 100%)",
        }}
      />
      <div style={{ position: "absolute", left: "5cqw", right: "5cqw", bottom: "5cqw" }}>
        <div
          style={{
            fontSize: "clamp(8px, 2.6cqw, 12px)",
            fontWeight: 800,
            letterSpacing: "0.18em",
            color: "rgba(255, 255, 255, 0.72)",
            marginBottom: "2cqw",
          }}
        >
          STEAM KEY
        </div>
        <div
          style={{
            fontSize: "clamp(15px, 7.5cqw, 34px)",
            fontWeight: 800,
            color: "#fff",
            lineHeight: 1.1,
            textShadow: "0 2px 12px rgba(0, 0, 0, 0.45)",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            wordBreak: "break-word",
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
};

export default GameCoverPlaceholder;
