/**
 * Input validation utilities.
 */

const DOMAIN_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
const HEX_ID_REGEX = /^[a-f0-9]{16}$/;

export function isValidDomain(domain: string): boolean {
  if (!domain || domain.length > 253) return false;
  const cleaned = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
  return DOMAIN_REGEX.test(cleaned);
}

export function isValidId(id: string): boolean {
  return HEX_ID_REGEX.test(id);
}

export function sanitizeDomain(domain: string): string {
  return domain.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
}

/**
 * Parse and validate pagination parameters.
 */
export function parsePagination(
  limitStr: string | undefined,
  offsetStr: string | undefined,
  maxLimit = 100,
  defaultLimit = 50
): { limit: number; offset: number } {
  const limit = Math.max(1, Math.min(parseInt(limitStr || String(defaultLimit), 10) || defaultLimit, maxLimit));
  const offset = Math.max(0, parseInt(offsetStr || '0', 10) || 0);
  return { limit, offset };
}

/**
 * Validate a string is one of allowed enum values.
 */
export function isValidEnum<T extends string>(value: string | undefined, allowed: T[]): value is T {
  if (!value) return false;
  return allowed.includes(value as T);
}

/**
 * Validate max string length.
 */
export function isWithinLength(value: string | null | undefined, maxLength: number): boolean {
  if (!value) return true;
  return value.length <= maxLength;
}

/**
 * Valid article statuses.
 */
export const ARTICLE_STATUSES = ['draft', 'optimizing', 'optimized', 'published'] as const;

/**
 * Valid brief statuses.
 */
export const BRIEF_STATUSES = ['pending', 'in_progress', 'completed'] as const;

/**
 * Valid link statuses.
 */
export const LINK_STATUSES = ['pending', 'approved', 'inserted', 'rejected'] as const;
