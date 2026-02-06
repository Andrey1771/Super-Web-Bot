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

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

const VIEWPORT_SIZE = 360;

const AvatarCropModal: React.FC<AvatarCropModalProps> = ({ imageSrc, isOpen, isSaving, onClose, onSave }) => {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const hasUnsavedChanges = useMemo(
    () => Boolean(imageSrc) && (Math.abs(position.x) > 0 || Math.abs(position.y) > 0 || zoom !== 1 || rotation !== 0),
    [imageSrc, position.x, position.y, zoom, rotation]
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
      setRotation(0);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
    }
  }, [isOpen, previewUrl]);

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

  const handleSave = useCallback(async () => {
    if (!imageSrc || isSaving) {
      return;
    }

    const file = await getCroppedAvatarFile(imageSrc, position, zoom, rotation, VIEWPORT_SIZE, 512);
    await onSave(file);
  }, [imageSrc, isSaving, onSave, position, rotation, zoom]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) {
      return;
    }

    const deltaX = event.clientX - dragRef.current.x;
    const deltaY = event.clientY - dragRef.current.y;
    dragRef.current = { x: event.clientX, y: event.clientY };

    setPosition((current) => ({ x: current.x + deltaX, y: current.y + deltaY }));
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.08 : -0.08;
    setZoom((current) => Math.min(3, Math.max(1, Number((current + delta).toFixed(2)))));
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
              <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
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
