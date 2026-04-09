const CAPTURE_MODE_ATTRIBUTE = 'data-capture-mode';
const CAPTURE_MODE_VALUE = 'true';

const getRootElement = (): HTMLElement | null => {
  if (typeof document === 'undefined') {
    return null;
  }

  return document.documentElement;
};

export const enableCaptureMode = (): void => {
  const root = getRootElement();
  if (!root) {
    return;
  }

  root.setAttribute(CAPTURE_MODE_ATTRIBUTE, CAPTURE_MODE_VALUE);
};

export const disableCaptureMode = (): void => {
  const root = getRootElement();
  if (!root) {
    return;
  }

  root.removeAttribute(CAPTURE_MODE_ATTRIBUTE);
};
