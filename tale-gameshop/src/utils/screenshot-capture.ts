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

const renderStitchedScreenshot = async (
  html2canvas: Html2CanvasFn,
  scale: number,
  settleFrames: number
): Promise<{canvas: HTMLCanvasElement; segments: number}> => {
  const root = document.documentElement;
  const body = document.body;

  const pageWidth = Math.max(root.scrollWidth, body.scrollWidth, root.clientWidth);
  const pageHeight = Math.max(root.scrollHeight, body.scrollHeight, root.clientHeight);
  const viewportHeight = window.innerHeight;

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = Math.ceil(pageWidth * scale);
  outputCanvas.height = Math.ceil(pageHeight * scale);
  const context = outputCanvas.getContext('2d');

  if (!context) {
    throw new Error('Unable to allocate screenshot canvas context.');
  }

  const segments = Math.max(1, Math.ceil(pageHeight / viewportHeight));

  for (let index = 0; index < segments; index += 1) {
    const offsetY = index * viewportHeight;
    const remaining = pageHeight - offsetY;
    const segmentHeight = Math.min(viewportHeight, remaining);

    window.scrollTo(0, offsetY);
    await waitAnimationFrames(settleFrames);

    const segmentCanvas = await html2canvas(document.body, {
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

    const targetY = Math.round(offsetY * scale);
    context.drawImage(segmentCanvas, 0, 0, segmentCanvas.width, Math.round(segmentHeight * scale), 0, targetY, segmentCanvas.width, Math.round(segmentHeight * scale));
  }

  return {canvas: outputCanvas, segments};
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

    await waitAnimationFrames(Math.max(2, resolved.settleFrames));

    const html2canvas = await getHtml2Canvas();
    const {canvas, segments} = await renderStitchedScreenshot(html2canvas, resolved.scale, resolved.settleFrames);

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
      fileName
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
