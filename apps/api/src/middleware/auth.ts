import { Context, Next } from 'hono';
import type { Env } from '../types/env';

/**
 * API Key authentication middleware.
 * Expects header: Authorization: Bearer <APP_API_KEY>
 * Uses timing-safe comparison to prevent timing attacks.
 */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  const isValid = await timingSafeEqual(token, c.env.APP_API_KEY);

  if (!isValid) {
    return c.json({ success: false, error: 'Invalid API key' }, 403);
  }

  await next();
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) {
    // Still do the comparison to maintain constant time
    // but use b against itself to avoid length-based timing leak
    const encoder = new TextEncoder();
    const bufB = encoder.encode(b);
    await crypto.subtle.timingSafeEqual(bufB, bufB);
    return false;
  }

  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  return crypto.subtle.timingSafeEqual(bufA, bufB);
}
