import {disableCaptureMode, enableCaptureMode, verifyCaptureMode} from './capture-mode';

type Html2CanvasOptions = {
  backgroundColor?: string | null;
  useCORS?: boolean;
  allowTaint?: boolean;
  logging?: boolean;
  scale?: number;
  width?: number;
  height?: number;
  windowWidth?: number;
  windowHeight?: number;
  x?: number;
  y?: number;
  scrollX?: number;
  scrollY?: number;
};

type Html2CanvasFn = (element: HTMLElement, options?: Html2CanvasOptions) => Promise<HTMLCanvasElement>;

type OverlayRole = 'top' | 'floating' | 'other';

type OverlayStyleSnapshot = {
  display: string;
  visibility: string;
  opacity: string;
  pointerEvents: string;
};

type OverlayCandidate = {
  element: HTMLElement;
  selector: string;
  position: string;
  role: OverlayRole;
  rectTop: number;
  rectRight: number;
  rectBottom: number;
  rectHeight: number;
  styleSnapshot: OverlayStyleSnapshot;
};

export type OverlayDiagnostics = {
  total: number;
  top: number;
  floating: number;
  hiddenAfterFirstFrame: number;
  hiddenSelectors: string[];
  entries: Array<{
    selector: string;
    role: OverlayRole;
    position: string;
    rectTop: number;
    rectRight: number;
    rectBottom: number;
    hiddenAfterFirstFrame: boolean;
  }>;
};

export type ScreenshotCaptureOptions = {
  fileName?: string;
  format?: 'image/png' | 'image/jpeg' | 'image/webp';
  quality?: number;
  scale?: number;
  settleFrames?: number;
  scrollToTop?: boolean;
  autoDownload?: boolean;
};

export type ScreenshotCaptureResult = {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  segments: number;
  modeVerification: ReturnType<typeof verifyCaptureMode>;
  fileName: string;
  overlayDiagnostics: OverlayDiagnostics;
};

const DEFAULT_OPTIONS: Required<Omit<ScreenshotCaptureOptions, 'quality'>> & {quality: number} = {
  fileName: 'tale-full-page.png',
  format: 'image/png',
  quality: 0.92,
  scale: Math.max(1, Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)),
  settleFrames: 2,
  scrollToTop: true,
  autoDownload: true
};

const OVERLAY_PRIORITY_SELECTORS = [
  '.header-nav',
  '.blog-toolbar-wrap',
  '.blog-post-aside',
  '.support-chat',
  '.cookie-banner',
  '.admin-topbar',
  '.admin-sidebar'
];

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

const blobToDataUrl = async (blob: Blob): Promise<string> => {
  const reader = new FileReader();
  return new Promise<string>((resolve, reject) => {
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to convert screenshot blob to data URL.'));
    reader.readAsDataURL(blob);
  });
};

const downloadBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.click();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
};

const buildDebugSelector = (element: HTMLElement): string => {
  if (element.id) {
    return `#${element.id}`;
  }

  const classNames = Array.from(element.classList).filter(Boolean);
  if (classNames.length > 0) {
    return `.${classNames.slice(0, 3).join('.')}`;
  }

  return element.tagName.toLowerCase();
};

const isElementVisible = (element: HTMLElement, style: CSSStyleDeclaration): boolean => {
  if (style.display === 'none' || style.visibility === 'hidden' || Number.parseFloat(style.opacity || '1') === 0) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const detectOverlayRole = (element: HTMLElement, position: string, rect: DOMRect): OverlayRole => {
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  const isPriorityTop = OVERLAY_PRIORITY_SELECTORS.some((selector) => {
    if (!selector.startsWith('.')) {
      return false;
    }

    return element.classList.contains(selector.replace('.', ''));
  }) && rect.top <= 8;

  if (isPriorityTop) {
    return 'top';
  }

  const touchesTopEdge = rect.top <= 8;
  const spansLargeWidth = rect.width >= viewportWidth * 0.45;
  if ((position === 'fixed' || position === 'sticky') && touchesTopEdge && spansLargeWidth) {
    return 'top';
  }

  const nearRight = rect.right >= viewportWidth - 24;
  const nearBottom = rect.bottom >= viewportHeight - 24;
  if (position === 'fixed' && (nearRight || nearBottom)) {
    return 'floating';
  }

  return 'other';
};

const collectOverlayCandidates = (): OverlayCandidate[] => {
  const elements = Array.from(document.body.querySelectorAll<HTMLElement>('*'));
  const candidates: OverlayCandidate[] = [];

  for (const element of elements) {
    const computedStyle = window.getComputedStyle(element);
    const position = computedStyle.position;

    if (position !== 'fixed' && position !== 'sticky') {
      continue;
    }

    if (!isElementVisible(element, computedStyle)) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
      continue;
    }

    const role = detectOverlayRole(element, position, rect);

    candidates.push({
      element,
      selector: buildDebugSelector(element),
      position,
      role,
      rectTop: rect.top,
      rectRight: rect.right,
      rectBottom: rect.bottom,
      rectHeight: rect.height,
      styleSnapshot: {
        display: element.style.display,
        visibility: element.style.visibility,
        opacity: element.style.opacity,
        pointerEvents: element.style.pointerEvents
      }
    });
  }

  return candidates;
};

const hideOverlayCandidates = (items: OverlayCandidate[]): void => {
  items.forEach(({element}) => {
    element.style.display = 'none';
    element.style.visibility = 'hidden';
    element.style.opacity = '0';
    element.style.pointerEvents = 'none';
  });
};

const restoreOverlayCandidates = (items: OverlayCandidate[]): void => {
  items.forEach(({element, styleSnapshot}) => {
    element.style.display = styleSnapshot.display;
    element.style.visibility = styleSnapshot.visibility;
    element.style.opacity = styleSnapshot.opacity;
    element.style.pointerEvents = styleSnapshot.pointerEvents;
  });
};

const getOverlayDiagnostics = (all: OverlayCandidate[], hidden: OverlayCandidate[]): OverlayDiagnostics => {
  const hiddenSet = new Set(hidden.map((item) => item.element));

  return {
    total: all.length,
    top: all.filter((item) => item.role === 'top').length,
    floating: all.filter((item) => item.role === 'floating').length,
    hiddenAfterFirstFrame: hidden.length,
    hiddenSelectors: hidden.map((item) => item.selector),
    entries: all.map((item) => ({
      selector: item.selector,
      role: item.role,
      position: item.position,
      rectTop: item.rectTop,
      rectRight: item.rectRight,
      rectBottom: item.rectBottom,
      hiddenAfterFirstFrame: hiddenSet.has(item.element)
    }))
  };
};

const getHtml2Canvas = async (): Promise<Html2CanvasFn> => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Screenshot capture can run only in a browser context.');
  }

  if (window.__TALE_HTML2CANVAS__) {
    return window.__TALE_HTML2CANVAS__;
  }

  const existingScript = document.querySelector<HTMLScriptElement>('script[data-tale-html2canvas="true"]');

  if (!existingScript) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    script.async = true;
    script.defer = true;
    script.dataset.taleHtml2canvas = 'true';
    document.head.appendChild(script);
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.querySelector<HTMLScriptElement>('script[data-tale-html2canvas="true"]');
    if (!script) {
      reject(new Error('Failed to initialize html2canvas script tag.'));
      return;
    }

    if (window.__TALE_HTML2CANVAS__) {
      resolve();
      return;
    }

    const handleLoad = () => {
      const html2canvasFromWindow = (window as Window & {html2canvas?: Html2CanvasFn}).html2canvas;
      if (!html2canvasFromWindow) {
        reject(new Error('html2canvas loaded but global entry was not found.'));
        return;
      }

      window.__TALE_HTML2CANVAS__ = html2canvasFromWindow;
      resolve();
    };

    const handleError = () => reject(new Error('Failed to load html2canvas from CDN.'));

    script.addEventListener('load', handleLoad, {once: true});
    script.addEventListener('error', handleError, {once: true});
  });

  if (!window.__TALE_HTML2CANVAS__) {
    throw new Error('html2canvas initialization failed.');
  }

  return window.__TALE_HTML2CANVAS__;
};

const captureSegment = async (
  html2canvas: Html2CanvasFn,
  pageWidth: number,
  viewportHeight: number,
  offsetY: number,
  segmentHeight: number,
  scale: number
): Promise<HTMLCanvasElement> => {
  window.scrollTo(0, offsetY);

  await waitAnimationFrames(2);

  return html2canvas(document.body, {
    backgroundColor: '#ffffff',
    useCORS: true,
    allowTaint: false,
    logging: false,
    scale,
    width: pageWidth,
    height: segmentHeight,
    x: 0,
    y: offsetY,
    scrollX: 0,
    scrollY: 0,
    windowWidth: pageWidth,
    windowHeight: viewportHeight
  });
};

const renderStitchedScreenshot = async (
  html2canvas: Html2CanvasFn,
  scale: number,
  settleFrames: number
): Promise<{canvas: HTMLCanvasElement; segments: number; overlayDiagnostics: OverlayDiagnostics}> => {
  const root = document.documentElement;
  const body = document.body;

  const pageWidth = Math.max(root.scrollWidth, body.scrollWidth, root.clientWidth);
  const pageHeight = Math.max(root.scrollHeight, body.scrollHeight, root.clientHeight);
  const viewportHeight = window.innerHeight;
  const segments = Math.max(1, Math.ceil(pageHeight / viewportHeight));

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = Math.ceil(pageWidth * scale);
  outputCanvas.height = Math.ceil(pageHeight * scale);
  const context = outputCanvas.getContext('2d');

  if (!context) {
    throw new Error('Unable to allocate screenshot canvas context.');
  }

  const allOverlays = collectOverlayCandidates();
  const overlaysToHide = allOverlays.filter((item) => item.role === 'top' || item.role === 'floating');

  const firstSegmentHeight = Math.min(viewportHeight, pageHeight);
  const firstSegmentCanvas = await captureSegment(html2canvas, pageWidth, viewportHeight, 0, firstSegmentHeight, scale);
  context.drawImage(
    firstSegmentCanvas,
    0,
    0,
    firstSegmentCanvas.width,
    Math.round(firstSegmentHeight * scale),
    0,
    0,
    firstSegmentCanvas.width,
    Math.round(firstSegmentHeight * scale)
  );

  try {
    if (segments > 1 && overlaysToHide.length > 0) {
      hideOverlayCandidates(overlaysToHide);
      await waitAnimationFrames(Math.max(2, settleFrames));
    }

    for (let index = 1; index < segments; index += 1) {
      const offsetY = index * viewportHeight;
      const remaining = pageHeight - offsetY;
      const segmentHeight = Math.min(viewportHeight, remaining);

      const segmentCanvas = await captureSegment(
        html2canvas,
        pageWidth,
        viewportHeight,
        offsetY,
        segmentHeight,
        scale
      );

      const targetY = Math.round(offsetY * scale);
      context.drawImage(
        segmentCanvas,
        0,
        0,
        segmentCanvas.width,
        Math.round(segmentHeight * scale),
        0,
        targetY,
        segmentCanvas.width,
        Math.round(segmentHeight * scale)
      );
    }
  } finally {
    restoreOverlayCandidates(overlaysToHide);
  }

  return {
    canvas: outputCanvas,
    segments,
    overlayDiagnostics: getOverlayDiagnostics(allOverlays, overlaysToHide)
  };
};

export const capturePage = async (options: ScreenshotCaptureOptions = {}): Promise<ScreenshotCaptureResult> => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Capture helper can only run in browser runtime.');
  }

  const resolved = {
    ...DEFAULT_OPTIONS,
    ...options,
    quality: options.quality ?? DEFAULT_OPTIONS.quality
  };

  const previousScrollX = window.scrollX;
  const previousScrollY = window.scrollY;

  try {
    await enableCaptureMode({
      scrollToTop: resolved.scrollToTop,
      settleFrames: resolved.settleFrames
    });

    await waitAnimationFrames(Math.max(3, resolved.settleFrames));
    window.scrollTo(0, 0);
    await waitAnimationFrames(2);

    const html2canvas = await getHtml2Canvas();
    const {canvas, segments, overlayDiagnostics} = await renderStitchedScreenshot(
      html2canvas,
      resolved.scale,
      resolved.settleFrames
    );

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), resolved.format, resolved.quality);
    });

    if (!blob) {
      throw new Error('Failed to serialize screenshot canvas to Blob.');
    }

    const dataUrl = await blobToDataUrl(blob);
    const fileName = resolved.fileName;

    if (resolved.autoDownload) {
      downloadBlob(blob, fileName);
    }

    return {
      blob,
      dataUrl,
      width: canvas.width,
      height: canvas.height,
      segments,
      modeVerification: verifyCaptureMode(),
      fileName,
      overlayDiagnostics
    };
  } finally {
    disableCaptureMode();
    window.scrollTo(previousScrollX, previousScrollY);
  }
};

declare global {
  interface Window {
    __TALE_HTML2CANVAS__?: Html2CanvasFn;
    __TALE_CAPTURE_PAGE__?: (options?: ScreenshotCaptureOptions) => Promise<ScreenshotCaptureResult>;
    __TALE_SCREENSHOT__?: {
      capturePage: (options?: ScreenshotCaptureOptions) => Promise<ScreenshotCaptureResult>;
    };
  }
}

export const installScreenshotDevBridge = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.__TALE_CAPTURE_PAGE__ = (options) => capturePage(options);
  window.__TALE_SCREENSHOT__ = {
    capturePage: (options) => capturePage(options)
  };

  window.console.info('[screenshot] Dev bridge ready. Use __TALE_CAPTURE_PAGE__() or __TALE_SCREENSHOT__.capturePage().');
};
