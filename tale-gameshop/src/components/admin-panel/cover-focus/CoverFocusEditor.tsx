import React, { useCallback, useEffect, useRef, useState } from "react";
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import type { IApiClient } from "../../../iterfaces/i-api-client";
import { useToast } from "../../ui/ToastProvider";
import "./cover-focus-editor.css";

export interface CoverMeta {
  path: string;
  focusX: number;
  focusY: number;
  width?: number | null;
  height?: number | null;
  dominantColor?: string | null;
  minLongSide: number;
  recommendedLongSide: number;
}

interface CoverFocusEditorProps {
  /** Адрес обложки под /uploads: по нему сервер находит файл и его метаданные. */
  imageUrl: string;
}

/** Рамки витрины, в которых обложка показывается: то же, что CoverRatio в utils/cover-variants.ts. */
const FRAMES: Array<{ label: string; ratio: string; note: string }> = [
  { label: "Catalog tile", ratio: "1 / 1", note: "square" },
  { label: "Star deal", ratio: "3 / 4", note: "portrait" },
  { label: "Banner", ratio: "16 / 9", note: "wide" },
];

const UNUSUAL_RATIO = 2.2;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const same = (a: number, b: number) => Math.abs(a - b) < 0.0005;

/**
 * Точка фокуса обложки.
 *
 * Одна картинка живёт в квадрате плитки, в вертикали Star deal и в широкой полосе баннера. Обрезка по центру
 * срезает голову персонажу или логотип, поэтому админ кликом ставит главное место картинки, и все рамки режутся
 * вокруг него (сервер — при сборке вариантов, здесь — предпросмотр через object-position). Тут же видно, хватает
 * ли исходника по размеру и не слишком ли он вытянут.
 */
const CoverFocusEditor: React.FC<CoverFocusEditorProps> = ({ imageUrl }) => {
  const { addToast } = useToast();
  const [meta, setMeta] = useState<CoverMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const [saving, setSaving] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setMeta(null);
    setError(null);
    const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
    apiClient.api
      .get("/api/images/meta", { params: { path: imageUrl } })
      .then((response) => {
        if (cancelled) {
          return;
        }
        const data = response.data as CoverMeta;
        setMeta(data);
        setFocus({ x: data.focusX ?? 0.5, y: data.focusY ?? 0.5 });
      })
      .catch(() => {
        if (!cancelled) {
          // Не наша загрузка (внешний адрес, svg): фокус ставить негде — редактор просто не показывается.
          setError("This picture is not in the uploads folder, so its crop cannot be tuned here.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const pointFromEvent = useCallback((event: React.PointerEvent | PointerEvent) => {
    const stage = stageRef.current;
    if (!stage) {
      return null;
    }
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
      return null;
    }
    return { x: clamp01((event.clientX - rect.left) / rect.width), y: clamp01((event.clientY - rect.top) / rect.height) };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = pointFromEvent(event);
    if (!point) {
      return;
    }
    dragging.current = true;
    setFocus(point);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) {
      return;
    }
    const point = pointFromEvent(event);
    if (point) {
      setFocus(point);
    }
  };
  const stopDragging = () => {
    dragging.current = false;
  };

  const handleKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (!move) {
      return;
    }
    event.preventDefault();
    setFocus((current) => ({ x: clamp01(current.x + move[0]), y: clamp01(current.y + move[1]) }));
  };

  const dirty = meta ? !same(focus.x, meta.focusX) || !same(focus.y, meta.focusY) : false;

  const save = async () => {
    if (!meta) {
      return;
    }
    try {
      setSaving(true);
      const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
      const response = await apiClient.api.put("/api/images/meta", { path: imageUrl, focusX: focus.x, focusY: focus.y });
      const saved = response.data as CoverMeta;
      setMeta(saved);
      setFocus({ x: saved.focusX, y: saved.focusY });
      addToast("Cover focus saved. Storefront crops will follow within a day.", "success");
    } catch (err) {
      console.error("Failed to save cover focus", err);
      addToast("Could not save the focus point. Try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return <p className="cover-focus__unavailable">{error}</p>;
  }
  if (!meta) {
    return <p className="cover-focus__unavailable">Loading cover details…</p>;
  }

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const longSide = Math.max(width, height);
  const aspect = width > 0 && height > 0 ? width / height : 1;
  const warnings: string[] = [];
  if (longSide > 0 && longSide < meta.recommendedLongSide) {
    warnings.push(`Small source: ${longSide}px on the long side. ${meta.recommendedLongSide}px or more stays sharp on large screens.`);
  }
  if (aspect > UNUSUAL_RATIO || aspect < 1 / UNUSUAL_RATIO) {
    warnings.push("Unusual shape: a big part of this picture is cropped in every frame. A picture closer to 4:3 fits better.");
  }
  const position = `${(focus.x * 100).toFixed(1)}% ${(focus.y * 100).toFixed(1)}%`;

  return (
    <div className="cover-focus" data-testid="cover-focus-editor">
      <div className="cover-focus__head">
        <strong>Focus point</strong>
        <span className="cover-focus__meta">
          {width > 0 && height > 0 ? `${width} × ${height}` : "size unknown"}
          {meta.dominantColor && (
            <i className="cover-focus__swatch" style={{ background: meta.dominantColor }} title={`Placeholder color ${meta.dominantColor}`} aria-hidden="true" />
          )}
        </span>
      </div>
      <p className="cover-focus__hint">Click or drag to mark the main part of the picture. Every frame on the site crops around it.</p>

      <div className="cover-focus__body">
        <div
          ref={stageRef}
          className="cover-focus__stage"
          role="slider"
          aria-label="Focus point"
          aria-valuetext={`${Math.round(focus.x * 100)}% from the left, ${Math.round(focus.y * 100)}% from the top`}
          aria-valuenow={Math.round(focus.x * 100)}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          onKeyDown={handleKey}
          style={{ aspectRatio: width > 0 && height > 0 ? `${width} / ${height}` : "4 / 3" }}
        >
          <img src={imageUrl} alt="" draggable={false} />
          <span className="cover-focus__marker" style={{ left: `${focus.x * 100}%`, top: `${focus.y * 100}%` }} aria-hidden="true" />
        </div>

        <ul className="cover-focus__frames" aria-label="How it will be cropped">
          {FRAMES.map((frame) => (
            <li key={frame.label}>
              <span className="cover-focus__frame" style={{ aspectRatio: frame.ratio }}>
                <img src={imageUrl} alt="" style={{ objectPosition: position }} data-testid={`frame-${frame.note}`} />
              </span>
              <small>{frame.label}</small>
            </li>
          ))}
        </ul>
      </div>

      {warnings.length > 0 && (
        <ul className="cover-focus__warnings" role="status">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <div className="cover-focus__actions">
        <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save focus"}
        </button>
        <button type="button" className="btn btn-outline" onClick={() => setFocus({ x: 0.5, y: 0.5 })} disabled={same(focus.x, 0.5) && same(focus.y, 0.5)}>
          Center
        </button>
      </div>
    </div>
  );
};

export default CoverFocusEditor;
