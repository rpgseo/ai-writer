/**
 * Generate a SHA-256 hash of text for use as cache keys.
 * Uses Web Crypto API available in Cloudflare Workers.
 */
export async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a deterministic cache key from a list of strings.
 * Hashes the sorted, joined input to produce a fixed-length key.
 */
export async function hashKeyList(keys: string[]): Promise<string> {
  const sorted = [...keys].sort();
  return hashText(sorted.join('\n'));
}
