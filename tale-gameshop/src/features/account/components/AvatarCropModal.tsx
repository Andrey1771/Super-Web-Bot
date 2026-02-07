import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRotateLeft, faRotateRight, faXmark } from '@fortawesome/free-solid-svg-icons';
import { buildAvatarPreviewUrl, getCroppedAvatarFile } from '../../../utils/cropImage';

type AvatarCropModalProps = {
  imageSrc: string | null;
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (file: File) => Promise<void>;
};

type Size = {
  width: number;
  height: number;
};

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

const VIEWPORT_SIZE = 360;
const MASK_RATIO = 0.72;
const MAX_ZOOM = 4;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getRotatedBounds = (width: number, height: number, rotation: number): Size => {
  const radians = (Math.PI * rotation) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos
  };
};

const AvatarCropModal: React.FC<AvatarCropModalProps> = ({ imageSrc, isOpen, isSaving, onClose, onSave }) => {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);
  const shouldFitOnReadyRef = useRef(false);

  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropSize, setCropSize] = useState<Size | null>(null);
  const [mediaSize, setMediaSize] = useState<Size | null>(null);

  const hasUnsavedChanges = useMemo(
    () => Boolean(imageSrc) && (Math.abs(position.x) > 0 || Math.abs(position.y) > 0 || Math.abs(zoom - minZoom) > 0.001 || rotation !== 0),
    [imageSrc, minZoom, position.x, position.y, rotation, zoom]
  );

  const requestClose = useCallback(() => {
    if (isSaving) {
      return;
    }
    if (hasUnsavedChanges && !window.confirm('Discard avatar changes?')) {
      return;
    }
    onClose();
  }, [hasUnsavedChanges, isSaving, onClose]);

  const getClampedPosition = useCallback(
    (nextPosition: { x: number; y: number }, nextZoom: number, nextRotation: number) => {
      if (!cropSize || !mediaSize) {
        return nextPosition;
      }

      const rotatedBounds = getRotatedBounds(mediaSize.width * nextZoom, mediaSize.height * nextZoom, nextRotation);
      const maxX = Math.max(0, (rotatedBounds.width - cropSize.width) / 2);
      const maxY = Math.max(0, (rotatedBounds.height - cropSize.height) / 2);

      return {
        x: clamp(nextPosition.x, -maxX, maxX),
        y: clamp(nextPosition.y, -maxY, maxY)
      };
    },
    [cropSize, mediaSize]
  );

  const setClampedZoom = useCallback(
    (nextZoom: number) => {
      setZoom((currentZoom) => {
        const clampedZoom = clamp(nextZoom, minZoom, MAX_ZOOM);
        if (clampedZoom === currentZoom) {
          return currentZoom;
        }
        setPosition((currentPosition) => getClampedPosition(currentPosition, clampedZoom, rotation));
        return clampedZoom;
      });
    },
    [getClampedPosition, minZoom, rotation]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    const modalElement = modalRef.current;
    const focusables = modalElement?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    focusables?.[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }

      if (event.key !== 'Tab' || !modalElement) {
        return;
      }

      const nodes = modalElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!nodes.length) {
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      body.style.overflow = previousOverflow;
    };
  }, [isOpen, requestClose]);

  useEffect(() => {
    if (!isOpen) {
      setPosition({ x: 0, y: 0 });
      setZoom(1);
      setMinZoom(1);
      setRotation(0);
      setCropSize(null);
      setMediaSize(null);
      pointersRef.current.clear();
      pinchDistanceRef.current = null;
      dragRef.current = null;
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
    }
  }, [isOpen, previewUrl]);

  useEffect(() => {
    if (!cropSize || !mediaSize) {
      return;
    }

    const coverZoom = Math.max(cropSize.width / mediaSize.width, cropSize.height / mediaSize.height);
    setMinZoom(coverZoom);

    if (shouldFitOnReadyRef.current) {
      shouldFitOnReadyRef.current = false;
      setZoom(coverZoom);
      setPosition({ x: 0, y: 0 });
      return;
    }

    setZoom((currentZoom) => clamp(currentZoom, coverZoom, MAX_ZOOM));
  }, [cropSize, mediaSize]);

  useEffect(() => {
    if (!cropSize || !mediaSize) {
      return;
    }

    setPosition((currentPosition) => getClampedPosition(currentPosition, zoom, rotation));
  }, [cropSize, mediaSize, getClampedPosition, rotation, zoom]);

  useEffect(() => {
    if (!isOpen || !imageSrc) {
      return;
    }

    let isMounted = true;
    const timerId = window.setTimeout(async () => {
      try {
        const url = await buildAvatarPreviewUrl(imageSrc, position, zoom, rotation, VIEWPORT_SIZE, 128);
        if (!isMounted) {
          URL.revokeObjectURL(url);
          return;
        }
        setPreviewUrl((current) => {
          if (current) {
            URL.revokeObjectURL(current);
          }
          return url;
        });
      } catch (error) {
        console.error(error);
      }
    }, 120);

    return () => {
      isMounted = false;
      window.clearTimeout(timerId);
    };
  }, [imageSrc, isOpen, position, rotation, zoom]);

  useEffect(() => {
    if (!isOpen || !imageSrc) {
      return;
    }

    shouldFitOnReadyRef.current = true;
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  }, [imageSrc, isOpen]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!isOpen || !stage) {
      return;
    }

    const updateCropSize = () => {
      const size = Math.min(stage.clientWidth, stage.clientHeight) * MASK_RATIO;
      setCropSize({ width: size, height: size });
    };

    updateCropSize();
    const observer = new ResizeObserver(updateCropSize);
    observer.observe(stage);

    return () => observer.disconnect();
  }, [isOpen]);

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    const baseScale = Math.max(VIEWPORT_SIZE / image.naturalWidth, VIEWPORT_SIZE / image.naturalHeight);
    setMediaSize({
      width: image.naturalWidth * baseScale,
      height: image.naturalHeight * baseScale
    });
  };

  const handleSave = useCallback(async () => {
    if (!imageSrc || isSaving) {
      return;
    }

    const file = await getCroppedAvatarFile(imageSrc, position, zoom, rotation, VIEWPORT_SIZE, 512);
    await onSave(file);
  }, [imageSrc, isSaving, onSave, position, rotation, zoom]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size === 1) {
      dragRef.current = { x: event.clientX, y: event.clientY };
    }

    if (pointersRef.current.size === 2) {
      const [first, second] = Array.from(pointersRef.current.values());
      pinchDistanceRef.current = Math.hypot(second.x - first.x, second.y - first.y);
      pinchStartZoomRef.current = zoom;
      dragRef.current = null;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) {
      return;
    }

    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size === 2) {
      const [first, second] = Array.from(pointersRef.current.values());
      const currentDistance = Math.hypot(second.x - first.x, second.y - first.y);
      if (!pinchDistanceRef.current || pinchDistanceRef.current === 0) {
        pinchDistanceRef.current = currentDistance;
        pinchStartZoomRef.current = zoom;
        return;
      }

      const scaleRatio = currentDistance / pinchDistanceRef.current;
      setClampedZoom(Number((pinchStartZoomRef.current * scaleRatio).toFixed(3)));
      return;
    }

    if (!dragRef.current) {
      return;
    }

    const deltaX = event.clientX - dragRef.current.x;
    const deltaY = event.clientY - dragRef.current.y;
    dragRef.current = { x: event.clientX, y: event.clientY };

    setPosition((current) => getClampedPosition({ x: current.x + deltaX, y: current.y + deltaY }, zoom, rotation));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    event.currentTarget.releasePointerCapture(event.pointerId);

    if (pointersRef.current.size < 2) {
      pinchDistanceRef.current = null;
    }

    if (pointersRef.current.size === 1) {
      const remaining = Array.from(pointersRef.current.values())[0];
      dragRef.current = { x: remaining.x, y: remaining.y };
    } else {
      dragRef.current = null;
    }
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.08 : -0.08;
    setClampedZoom(Number((zoom + delta).toFixed(2)));
  };

  const handleResetFit = () => {
    setPosition({ x: 0, y: 0 });
    setClampedZoom(minZoom);
  };

  if (!isOpen || !imageSrc) {
    return null;
  }

  return (
    <div className="ts-modal-overlay" onMouseDown={requestClose}>
      <div
        className="ts-modal ts-avatar-crop-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-crop-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="ts-avatar-crop-modal__header">
          <div>
            <h3 id="avatar-crop-title">Edit avatar</h3>
            <p>Drag to reposition. Use zoom to fit.</p>
          </div>
          <button type="button" className="ts-modal-close" onClick={requestClose} aria-label="Close avatar editor">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="ts-avatar-crop-modal__body">
          <div
            className="ts-avatar-cropper-stage"
            ref={stageRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            <img
              src={imageSrc}
              alt="Crop avatar"
              draggable={false}
              onLoad={handleImageLoad}
              style={{
                transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px)) scale(${zoom}) rotate(${rotation}deg)`
              }}
            />
            <div className="ts-avatar-cropper-mask" aria-hidden="true" />
          </div>

          <aside className="ts-avatar-crop-controls">
            <div>
              <span className="ts-avatar-crop-controls__label">Preview</span>
              <div className="ts-avatar-crop-preview">{previewUrl ? <img src={previewUrl} alt="Avatar preview" /> : <span />}</div>
            </div>

            <label className="ts-avatar-crop-controls__group">
              <span>Zoom</span>
              <div className="ts-avatar-crop-controls__zoom-row">
                <button type="button" className="btn btn-outline" onClick={() => setClampedZoom(zoom - 0.1)}>
                  -
                </button>
                <input
                  type="range"
                  min={minZoom}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={zoom}
                  onChange={(event) => setClampedZoom(Number(event.target.value))}
                />
                <button type="button" className="btn btn-outline" onClick={() => setClampedZoom(zoom + 0.1)}>
                  +
                </button>
              </div>
              <span className="ts-avatar-crop-controls__zoom-value">{zoom.toFixed(2)}x</span>
            </label>

            <label className="ts-avatar-crop-controls__group">
              <span>Rotate</span>
              <input
                type="range"
                min={-45}
                max={45}
                step={1}
                value={rotation}
                onChange={(event) => setRotation(Number(event.target.value))}
              />
            </label>

            <div className="ts-avatar-crop-controls__buttons">
              <button type="button" className="btn btn-outline" onClick={() => setRotation((value) => value - 90)}>
                <FontAwesomeIcon icon={faRotateLeft} /> 90°
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setRotation((value) => value + 90)}>
                <FontAwesomeIcon icon={faRotateRight} /> 90°
              </button>
              <button type="button" className="btn btn-outline" onClick={handleResetFit}>
                Fit
              </button>
            </div>
          </aside>
        </div>

        <div className="ts-avatar-crop-modal__footer">
          <button type="button" className="btn btn-outline" onClick={requestClose} disabled={isSaving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save avatar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AvatarCropModal;
