const CAPTURE_MODE_ATTRIBUTE = 'data-capture-mode';
const CAPTURE_MODE_VALUE = 'true';

export type CaptureModeOptions = {
  scrollToTop?: boolean;
  settleFrames?: number;
};

type CaptureModeVerification = {
  enabled: boolean;
  attributeTarget: 'html' | 'body' | 'none';
  rootAttributeValue: string | null;
  headerPosition: string | null;
  headerBackdropFilter: string | null;
  stickyElements: Record<string, string | null>;
};

const CAPTURE_SELECTOR = ':is(html[data-capture-mode="true"], body[data-capture-mode="true"])';

const getRootElement = (): HTMLElement | null => {
  if (typeof document === 'undefined') {
    return null;
  }

  return document.documentElement;
};

const waitAnimationFrames = async (frames: number): Promise<void> => {
  if (typeof window === 'undefined') {
    return;
  }

  const normalizedFrames = Math.max(1, frames);

  for (let i = 0; i < normalizedFrames; i += 1) {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }
};

export const enableCaptureMode = async (options: CaptureModeOptions = {}): Promise<void> => {
  const root = getRootElement();
  if (!root || typeof window === 'undefined') {
    return;
  }

  const {scrollToTop = true, settleFrames = 2} = options;

  root.setAttribute(CAPTURE_MODE_ATTRIBUTE, CAPTURE_MODE_VALUE);

  if (scrollToTop) {
    window.scrollTo({top: 0, left: 0, behavior: 'auto'});
  }

  await waitAnimationFrames(settleFrames);
};

export const disableCaptureMode = (): void => {
  const root = getRootElement();
  if (!root) {
    return;
  }

  root.removeAttribute(CAPTURE_MODE_ATTRIBUTE);
};

export const verifyCaptureMode = (): CaptureModeVerification => {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return {
      enabled: false,
      attributeTarget: 'none',
      rootAttributeValue: null,
      headerPosition: null,
      headerBackdropFilter: null,
      stickyElements: {}
    };
  }

  const htmlEnabled = document.documentElement.getAttribute(CAPTURE_MODE_ATTRIBUTE) === CAPTURE_MODE_VALUE;
  const bodyEnabled = document.body?.getAttribute(CAPTURE_MODE_ATTRIBUTE) === CAPTURE_MODE_VALUE;
  const target = htmlEnabled ? 'html' : bodyEnabled ? 'body' : 'none';

  const header = document.querySelector<HTMLElement>('.header-nav');
  const headerStyle = header ? window.getComputedStyle(header) : null;

  const trackedSelectors = [
    '.blog-toolbar-wrap',
    '.blog-post-aside',
    '.support-chat',
    '.cookie-banner'
  ];

  const stickyElements = trackedSelectors.reduce<Record<string, string | null>>((accumulator, selector) => {
    const element = document.querySelector<HTMLElement>(selector);
    accumulator[selector] = element ? window.getComputedStyle(element).position : null;
    return accumulator;
  }, {});

  return {
    enabled: htmlEnabled || bodyEnabled,
    attributeTarget: target,
    rootAttributeValue: document.documentElement.getAttribute(CAPTURE_MODE_ATTRIBUTE),
    headerPosition: headerStyle?.position ?? null,
    headerBackdropFilter: headerStyle?.backdropFilter ?? null,
    stickyElements
  };
};

declare global {
  interface Window {
    __TALE_ENABLE_CAPTURE_MODE__?: (options?: CaptureModeOptions) => Promise<void>;
    __TALE_DISABLE_CAPTURE_MODE__?: () => void;
    __TALE_VERIFY_CAPTURE_MODE__?: () => CaptureModeVerification;
  }
}

export const installCaptureModeDevBridge = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.__TALE_ENABLE_CAPTURE_MODE__ = (options) => enableCaptureMode(options);
  window.__TALE_DISABLE_CAPTURE_MODE__ = () => disableCaptureMode();
  window.__TALE_VERIFY_CAPTURE_MODE__ = () => verifyCaptureMode();

  // Keep an explicit marker for debugging the selector resolution from DevTools.
  window.console.info('[capture-mode] Dev bridge ready. Use __TALE_ENABLE_CAPTURE_MODE__, __TALE_DISABLE_CAPTURE_MODE__, __TALE_VERIFY_CAPTURE_MODE__.');
};

export {CAPTURE_SELECTOR};
