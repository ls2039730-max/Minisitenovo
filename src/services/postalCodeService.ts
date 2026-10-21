import { CepLookupResult } from '../types/order';

/**
 * Postal Code (CEP) Service Abstraction
 * Decouples CEP lookup provider from UI and handles ViaCEP + BrasilAPI + Server Proxy fallbacks gracefully.
 */
class PostalCodeService {
  /**
   * Normalizes CEP to exactly 8 digits string
   */
  public cleanCep(cep: string): string {
    return (cep || '').replace(/\D/g, '').slice(0, 8);
  }

  /**
   * Formats CEP with 00000-000 mask
   */
  public formatCep(cep: string): string {
    const clean = this.cleanCep(cep);
    if (clean.length <= 5) return clean;
    return `${clean.slice(0, 5)}-${clean.slice(5, 8)}`;
  }

  /**
   * Validates if string has 8 digits
   */
  public isValidCep(cep: string): boolean {
    return this.cleanCep(cep).length === 8;
  }

  /**
   * Look up CEP data with timeout and multi-provider fallback (ViaCEP -> BrasilAPI -> Server Proxy)
   */
  public async lookup(cep: string, slug = 'default'): Promise<CepLookupResult> {
    const clean = this.cleanCep(cep);
    const emptyResult: CepLookupResult = {
      cep: clean,
      street: '',
      neighborhood: '',
      city: '',
      state: '',
      found: false,
    };

    if (clean.length !== 8) {
      return emptyResult;
    }

    // 1. Try server-side proxy first (includes caching + ViaCEP + BrasilAPI coordinates)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);
      const safeSlug = encodeURIComponent(slug || 'default');
      const res = await fetch(`/api/site/public/${safeSlug}/cep/${clean}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const json = await res.json();
        if (json?.data?.found) {
          return json.data;
        }
      }
    } catch {
      // Fallback to direct client-side lookup below
    }

    // 2. Fallback to direct ViaCEP
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const response = await fetch(`https://viacep.com.br/ws/${clean}/json/`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (!data.erro) {
          return {
            cep: clean,
            street: data.logradouro || '',
            neighborhood: data.bairro || '',
            city: data.localidade || '',
            state: (data.uf || '').toUpperCase(),
            found: true,
          };
        }
      }
    } catch {
      // Fallback to BrasilAPI below
    }

    // 3. Fallback to BrasilAPI v2
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${clean}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        return {
          cep: clean,
          street: data.street || '',
          neighborhood: data.neighborhood || '',
          city: data.city || '',
          state: (data.state || '').toUpperCase(),
          found: true,
          latitude: data?.location?.coordinates?.latitude
            ? Number(data.location.coordinates.latitude)
            : null,
          longitude: data?.location?.coordinates?.longitude
            ? Number(data.location.coordinates.longitude)
            : null,
        };
      }
    } catch {
      // Graceful fallback
    }

    return emptyResult;
  }
}

export const postalCodeService = new PostalCodeService();

export async function lookupPostalCode(cep: string, slug = 'default'): Promise<CepLookupResult> {
  return postalCodeService.lookup(cep, slug);
}

export function formatPostalCode(cep: string): string {
  return postalCodeService.formatCep(cep);
}

