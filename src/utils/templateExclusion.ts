/**
 * Template Exclusion Rule & Registry
 * 
 * INEGOTIABLE RULE:
 * The template 'otica_editorial' ("Ótica Editorial Premium") has its own unique,
 * custom-tailored editorial art direction, bespoke typography, and experimental
 * animations inspired by high-fashion eyewear studios (e.g. Max & Tiber).
 * 
 * It must NEVER be overridden or altered by the shared global standard layer.
 */

export const EXCLUDED_TEMPLATES = ['otica_editorial'] as const;

export type ExcludedTemplateId = typeof EXCLUDED_TEMPLATES[number];

/**
 * Checks whether a given template ID is explicitly excluded from the global template enhancements.
 * Uses exact identifier matching rather than display names to prevent accidental overrides.
 */
export function isTemplateExcludedFromGlobalStandard(templateId?: string | null): boolean {
  if (!templateId || typeof templateId !== 'string') return false;
  const normalized = templateId.trim().toLowerCase();
  return EXCLUDED_TEMPLATES.some((excluded) => excluded.toLowerCase() === normalized);
}
