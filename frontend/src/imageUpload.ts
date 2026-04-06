export type ImageProcessingOptions = {
  width?: number;
  height?: number;
  quality?: number;
};

export async function processImage(
  file: File,
  options: number | ImageProcessingOptions = 1600
): Promise<string> {
  const normalizedOptions: ImageProcessingOptions =
    typeof options === "number"
      ? { width: options }
      : options;
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);

  const targetWidthLimit = normalizedOptions.width ?? 1600;
  const targetHeightLimit = normalizedOptions.height ?? targetWidthLimit;
  const widthScale = image.width > targetWidthLimit ? targetWidthLimit / image.width : 1;
  const heightScale = image.height > targetHeightLimit ? targetHeightLimit / image.height : 1;
  const scale = Math.min(widthScale, heightScale);
  const targetWidth = Math.max(1, Math.round(image.width * scale));
  const targetHeight = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to prepare image conversion");
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const webpBlob = await canvasToBlob(canvas, "image/webp", normalizedOptions.quality ?? 0.82);
  return await readBlobAsDataUrl(webpBlob);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read converted image"));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to convert image"));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}
