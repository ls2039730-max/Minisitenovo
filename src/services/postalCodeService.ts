import { CepLookupResult } from '../types/order';

/**
 * Postal Code (CEP) Service Abstraction
 * Decouples CEP lookup provider from UI and handles fallbacks gracefully.
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
   * Look up CEP data with timeout and fallback to manual entry
   */
  public async lookup(cep: string): Promise<CepLookupResult> {
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

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const response = await fetch(`https://viacep.com.br/ws/${clean}/json/`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return emptyResult;
      }

      const data = await response.json();
      if (data.erro) {
        return emptyResult;
      }

      return {
        cep: clean,
        street: data.logradouro || '',
        neighborhood: data.bairro || '',
        city: data.localidade || '',
        state: data.uf || '',
        found: true,
      };
    } catch {
      // Graceful fallback - never block customer checkout if CEP service fails
      return emptyResult;
    }
  }
}

export const postalCodeService = new PostalCodeService();
