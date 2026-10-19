import QRCode from 'qrcode';

export interface QrCodeOptions {
  width?: number;
  margin?: number;
  color?: {
    dark?: string;
    light?: string;
  };
}

export async function generateQrCodeDataUrl(
  text: string,
  options?: QrCodeOptions
): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      width: options?.width || 360,
      margin: options?.margin || 2,
      color: {
        dark: options?.color?.dark || '#0f172a',
        light: options?.color?.light || '#ffffff',
      },
      errorCorrectionLevel: 'H',
    });
  } catch (err) {
    console.error('Error generating QR Code:', err);
    throw err;
  }
}

export async function generateQrCodeSvg(
  text: string,
  options?: QrCodeOptions
): Promise<string> {
  try {
    return await QRCode.toString(text, {
      type: 'svg',
      width: options?.width || 360,
      margin: options?.margin || 2,
      color: {
        dark: options?.color?.dark || '#0f172a',
        light: options?.color?.light || '#ffffff',
      },
      errorCorrectionLevel: 'H',
    });
  } catch (err) {
    console.error('Error generating QR Code SVG:', err);
    throw err;
  }
}

export function buildTableCatalogUrl(tenantSlug: string, tableToken: string): string {
  if (typeof window === 'undefined') {
    return `/?mesa=${tableToken}&r=${tenantSlug}`;
  }
  const origin = window.location.origin;
  return `${origin}/?mesa=${tableToken}&r=${tenantSlug}`;
}
