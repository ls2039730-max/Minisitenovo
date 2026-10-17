/**
 * Image processing and optimization utilities:
 * - Smart Aspect Ratio Padding / Fitting (letterbox/pillarbox with transparent or solid background)
 * - Compression and auto-resizing to maximize performance and prevent image cut-off
 * - Aspect ratio estimation and dimensions detection
 */

export interface ImageOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0
  fitMode?: 'original' | 'cover' | 'contain-pad' | 'smart-expand';
  padColor?: string; // e.g. '#ffffff', 'transparent', or theme background
  targetAspectRatio?: number; // width / height, e.g. 4/3 = 1.333, 16/9 = 1.777, 1 = 1.0
}

/**
 * Loads an image from File, Blob, or base64 data URL into an HTMLImageElement
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Falha ao carregar imagem para processamento.'));
    img.src = src;
  });
}

/**
 * Optimizes an image (resizes, fits, prevents cut-off, compresses to WebP/JPEG)
 * Returns { dataUrl, width, height, aspectRatio }
 */
export async function optimizeImage(
  dataUrlOrFile: string | File,
  options: ImageOptimizationOptions = {}
): Promise<{ dataUrl: string; width: number; height: number; aspectRatio: number }> {
  let sourceDataUrl = '';

  if (typeof dataUrlOrFile === 'string') {
    sourceDataUrl = dataUrlOrFile;
  } else {
    sourceDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
      reader.readAsDataURL(dataUrlOrFile);
    });
  }

  const img = await loadImage(sourceDataUrl);
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.88,
    fitMode = 'original',
    padColor = 'transparent',
    targetAspectRatio,
  } = options;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context não suportado neste navegador.');
  }

  let finalW = origW;
  let finalH = origH;

  // 1. Constrain max bounds preserving aspect ratio
  if (finalW > maxWidth || finalH > maxHeight) {
    const ratio = Math.min(maxWidth / finalW, maxHeight / finalH);
    finalW = Math.round(finalW * ratio);
    finalH = Math.round(finalH * ratio);
  }

  // 2. If targetAspectRatio and 'contain-pad' mode are requested:
  // Pad canvas so the entire original image fits inside without ANY cropping!
  if (fitMode === 'contain-pad' && targetAspectRatio && targetAspectRatio > 0) {
    const curRatio = finalW / finalH;
    let canvasW = finalW;
    let canvasH = finalH;

    if (curRatio > targetAspectRatio) {
      // Image is wider than target ratio: increase height (add padding top/bottom)
      canvasH = Math.round(finalW / targetAspectRatio);
    } else {
      // Image is taller than target ratio: increase width (add padding left/right)
      canvasW = Math.round(finalH * targetAspectRatio);
    }

    canvas.width = canvasW;
    canvas.height = canvasH;

    if (padColor !== 'transparent') {
      ctx.fillStyle = padColor;
      ctx.fillRect(0, 0, canvasW, canvasH);
    } else {
      ctx.clearRect(0, 0, canvasW, canvasH);
    }

    // Draw original image centered
    const dx = Math.round((canvasW - finalW) / 2);
    const dy = Math.round((canvasH - finalH) / 2);
    ctx.drawImage(img, 0, 0, origW, origH, dx, dy, finalW, finalH);

    const isPngOrHasTransparency = sourceDataUrl.startsWith('data:image/png') || padColor === 'transparent';
    const outputFormat = isPngOrHasTransparency ? 'image/png' : 'image/jpeg';
    const outputDataUrl = canvas.toDataURL(outputFormat, quality);

    return {
      dataUrl: outputDataUrl,
      width: canvasW,
      height: canvasH,
      aspectRatio: canvasW / canvasH,
    };
  }

  // Standard high-quality resize / optimize
  canvas.width = finalW;
  canvas.height = finalH;
  ctx.drawImage(img, 0, 0, origW, origH, 0, 0, finalW, finalH);

  const isPng = sourceDataUrl.startsWith('data:image/png');
  const outputFormat = isPng ? 'image/png' : 'image/jpeg';
  const outputDataUrl = canvas.toDataURL(outputFormat, quality);

  return {
    dataUrl: outputDataUrl,
    width: finalW,
    height: finalH,
    aspectRatio: finalW / finalH,
  };
}
