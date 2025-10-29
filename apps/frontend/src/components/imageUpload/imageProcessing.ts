export type AutoScaleOptions = {
  maxWidth?: number;
  maxHeight?: number;
  maxBytes?: number;
  output?: 'auto' | 'jpeg' | 'webp';
  quality?: number;
  downscaleOnly?: boolean;
  /** Minimum output width in pixels to avoid over-downscaling (default 100) */
  minWidth?: number;
  /** Minimum output height in pixels to avoid over-downscaling (default 100) */
  minHeight?: number;
};

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

export function fitWithin(
  srcWidth: number,
  srcHeight: number,
  maxWidth?: number,
  maxHeight?: number,
  downscaleOnly = true,
): { width: number; height: number } {
  if (!maxWidth && !maxHeight) {
    return { width: srcWidth, height: srcHeight };
  }
  const widthLimit = maxWidth ?? Number.POSITIVE_INFINITY;
  const heightLimit = maxHeight ?? Number.POSITIVE_INFINITY;
  let targetWidth = srcWidth;
  let targetHeight = srcHeight;

  const widthScale = widthLimit / srcWidth;
  const heightScale = heightLimit / srcHeight;
  const scale = Math.min(widthScale, heightScale);

  if (downscaleOnly && scale >= 1) {
    return { width: srcWidth, height: srcHeight };
  }

  targetWidth = Math.max(1, Math.floor(srcWidth * Math.min(scale, 1)));
  targetHeight = Math.max(1, Math.floor(srcHeight * Math.min(scale, 1)));
  return { width: targetWidth, height: targetHeight };
}

export function detectHasAlpha(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const step = Math.max(1, Math.floor(Math.min(width, height) / 64));
  const data = ctx.getImageData(0, 0, width, height).data;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4 + 3;
      if (data[idx] !== 255) return true;
    }
  }
  return false;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Failed to create blob'));
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

export async function processImageWithAutoScale(file: File, options: AutoScaleOptions): Promise<File> {
  const img = await loadImageFromFile(file);
  const downscaleOnly = options.downscaleOnly ?? true;
  const initialQuality = options.quality ?? 0.92;
  const targetMaxBytes = options.maxBytes ?? DEFAULT_MAX_FILE_SIZE;

  const fit = fitWithin(
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
    options.maxWidth,
    options.maxHeight,
    downscaleOnly,
  );
  let width = fit.width;
  let height = fit.height;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  const renderToCanvas = () => {
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
  };

  renderToCanvas();

  let mimeType: 'image/jpeg' | 'image/webp';
  const hasAlpha = detectHasAlpha(ctx, width, height);
  if (options.output === 'jpeg') {
    mimeType = 'image/jpeg';
  } else if (options.output === 'webp') {
    mimeType = 'image/webp';
  } else {
    mimeType = hasAlpha ? 'image/webp' : 'image/jpeg';
  }

  async function encodeWithQuality(q: number): Promise<Blob> {
    return await canvasToBlob(canvas, mimeType, q);
  }

  const minQuality = 0.4;
  const maxQuality = 0.95;
  let qualityLow = minQuality;
  let qualityHigh = Math.min(maxQuality, Math.max(minQuality, initialQuality));
  let chosenBlob = await encodeWithQuality(qualityHigh);

  const runQualitySearch = async () => {
    qualityLow = minQuality;
    qualityHigh = Math.min(maxQuality, Math.max(minQuality, initialQuality));
    for (let i = 0; i < 7; i++) {
      const mid = (qualityLow + qualityHigh) / 2;
      const blob = await encodeWithQuality(mid);
      if (blob.size > targetMaxBytes) {
        qualityHigh = mid;
      } else {
        chosenBlob = blob;
        qualityLow = mid;
      }
    }
    if (chosenBlob.size > targetMaxBytes) {
      chosenBlob = await encodeWithQuality(qualityLow);
    }
  };

  await runQualitySearch();

  let attempts = 0;
  const minWidth = options.minWidth ?? 100;
  const minHeight = options.minHeight ?? 100;
  while (
    chosenBlob.size > targetMaxBytes &&
    attempts < 6 &&
    (options.maxWidth || options.maxHeight || !downscaleOnly) &&
    (width > minWidth || height > minHeight)
  ) {
    width = Math.max(minWidth, Math.floor(width * 0.85));
    height = Math.max(minHeight, Math.floor(height * 0.85));
    renderToCanvas();
    await runQualitySearch();
    attempts++;
  }

  const outputName =
    file.name.replace(/\.(jpe?g|png|webp|gif|bmp|heic|tiff?)$/i, '') + (mimeType === 'image/webp' ? '.webp' : '.jpg');
  const outputFile = new File([chosenBlob], outputName, { type: mimeType, lastModified: Date.now() });
  return outputFile;
}
