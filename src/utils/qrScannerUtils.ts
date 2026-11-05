import jsQR from 'jsqr';

export type CameraErrorCode =
  | 'INSECURE_CONTEXT'
  | 'UNSUPPORTED_BROWSER'
  | 'PERMISSION_DENIED'
  | 'NO_CAMERA_FOUND'
  | 'CAMERA_IN_USE'
  | 'QR_NOT_RECOGNIZED'
  | 'UNKNOWN_CAMERA_ERROR';

export interface CameraErrorInfo {
  code: CameraErrorCode;
  title: string;
  message: string;
  instructions?: string;
}

/**
 * Extracts the route QR token (`rtqr_...`) from a scanned string,
 * whether it is a full URL (`https://.../?routeQr=rtqr_...`), a query string, or a raw token.
 */
export function extractRouteQrToken(rawPayload: string): string {
  const trimmed = String(rawPayload || '').trim();
  if (!trimmed) return '';

  if (trimmed.includes('routeQr=')) {
    try {
      const parsed = new URL(trimmed, 'https://minihub.tech');
      const fromParam = parsed.searchParams.get('routeQr');
      if (fromParam && fromParam.trim()) {
        return fromParam.trim();
      }
    } catch {
      const match = trimmed.match(/routeQr=([^&\s#]+)/i);
      if (match && match[1]) {
        try {
          return decodeURIComponent(match[1]).trim();
        } catch {
          return match[1].trim();
        }
      }
    }
  }

  return trimmed;
}

/**
 * Decodes a QR Code from an RGBA pixel buffer (Uint8ClampedArray) using jsQR.
 * Supports both standard (dark on light) and inverted (light on dark) QR codes.
 */
export function decodeQrFromRgbaBuffer(
  data: Uint8ClampedArray,
  width: number,
  height: number
): string | null {
  if (!data || width <= 0 || height <= 0) return null;
  try {
    const code = jsQR(data, width, height, {
      inversionAttempts: 'attemptBoth',
    });
    if (code && typeof code.data === 'string' && code.data.trim().length > 0) {
      return code.data.trim();
    }
  } catch {
    // Ignore frame decode errors
  }
  return null;
}

/**
 * Maps browser MediaDevices / getUserMedia exceptions into clear, user-friendly Portuguese messages
 * and step-by-step instructions.
 */
export function mapCameraErrorToPortuguese(
  error: any,
  isSecureContext = true
): CameraErrorInfo {
  if (!isSecureContext) {
    return {
      code: 'INSECURE_CONTEXT',
      title: 'Conexão HTTPS necessária para abrir a câmera',
      message:
        'O navegador bloqueia o acesso direto à câmera em conexões não seguras (HTTP).',
      instructions:
        'Acesse o sistema utilizando um endereço seguro (HTTPS) ou utilize o botão "Ler Imagem do QR Code" abaixo.',
    };
  }

  const name = String(error?.name || '');
  const msg = String(error?.message || '').toLowerCase();

  if (name === 'UNSUPPORTED_BROWSER' || msg.includes('unsupported_browser')) {
    return {
      code: 'UNSUPPORTED_BROWSER',
      title: 'Navegador sem suporte à leitura direta por câmera',
      message:
        'Este navegador não disponibiliza a API de câmera em tempo real (mediaDevices.getUserMedia).',
      instructions:
        'Abra no Google Chrome (Android) ou Safari (iPhone), ou toque em "Ler Imagem / Foto do QR Code" para enviar uma foto do código.',
    };
  }

  if (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    name === 'SecurityError' ||
    msg.includes('permission denied') ||
    msg.includes('not allowed')
  ) {
    return {
      code: 'PERMISSION_DENIED',
      title: 'Permissão da câmera negada',
      message:
        'O acesso à câmera não foi autorizado no seu navegador.',
      instructions:
        'Para liberar: toque no ícone de cadeado ou configurações ao lado do endereço do site no topo do navegador, altere "Câmera" para "Permitir" e clique em "Tentar Novamente".',
    };
  }

  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'OverconstrainedError' ||
    msg.includes('device not found') ||
    msg.includes('requested device not found')
  ) {
    return {
      code: 'NO_CAMERA_FOUND',
      title: 'Nenhuma câmera encontrada neste dispositivo',
      message:
        'Não detectamos uma câmera conectada ou disponível neste aparelho.',
      instructions:
        'Você pode enviar uma foto/captura de tela usando o botão "Ler Imagem do QR Code" ou colar o token manualmente abaixo.',
    };
  }

  if (
    name === 'NotReadableError' ||
    name === 'TrackStartError' ||
    name === 'AbortError' ||
    msg.includes('could not start video source') ||
    msg.includes('hardware error') ||
    msg.includes('in use')
  ) {
    return {
      code: 'CAMERA_IN_USE',
      title: 'A câmera está sendo utilizada por outro aplicativo',
      message:
        'Não foi possível iniciar o vídeo porque outro aplicativo ou aba está ocupando a câmera no momento.',
      instructions:
        'Feche outros aplicativos que utilizam a câmera (como WhatsApp, Câmera ou outra aba do navegador) e toque em "Tentar Novamente".',
    };
  }

  return {
    code: 'UNKNOWN_CAMERA_ERROR',
    title: 'Não foi possível iniciar a câmera',
    message:
      'Ocorreu um impedimento ao acessar a câmera deste dispositivo.',
    instructions:
      'Verifique as permissões do navegador ou utilize a opção "Ler Imagem do QR Code" / campo manual abaixo.',
  };
}
