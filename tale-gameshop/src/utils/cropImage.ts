const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

const toRadian = (degree: number) => (degree * Math.PI) / 180;

export type AvatarPosition = {
  x: number;
  y: number;
};

const renderAvatarCanvas = async (
  imageSrc: string,
  position: AvatarPosition,
  zoom: number,
  rotation: number,
  viewportSize: number,
  cropSizePx: number,
  outputSize: number
): Promise<HTMLCanvasElement> => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas is not available.');
  }

  // baseScale — от базового вьюпорта (как картинка отрисована на сцене),
  // exportRatio — от диаметра КРУГА маски: экспортируем ровно то, что видит пользователь в круге.
  const baseScale = Math.max(viewportSize / image.width, viewportSize / image.height);
  const exportRatio = outputSize / cropSizePx;
  const finalScale = baseScale * zoom * exportRatio;

  context.translate(outputSize / 2 + position.x * exportRatio, outputSize / 2 + position.y * exportRatio);
  context.rotate(toRadian(rotation));
  context.scale(finalScale, finalScale);
  context.drawImage(image, -image.width / 2, -image.height / 2);

  return canvas;
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });

export const getCroppedAvatarFile = async (
  imageSrc: string,
  position: AvatarPosition,
  zoom: number,
  rotation: number,
  viewportSize = 360,
  cropSizePx = viewportSize,
  outputSize = 512
): Promise<File> => {
  const canvas = await renderAvatarCanvas(imageSrc, position, zoom, rotation, viewportSize, cropSizePx, outputSize);

  const webpBlob = await canvasToBlob(canvas, 'image/webp', 0.92);
  const blob = webpBlob ?? (await canvasToBlob(canvas, 'image/png'));

  if (!blob) {
    throw new Error('Unable to generate cropped image.');
  }

  const extension = blob.type === 'image/webp' ? 'webp' : 'png';
  return new File([blob], `avatar.${extension}`, {
    type: blob.type,
    lastModified: Date.now()
  });
};
