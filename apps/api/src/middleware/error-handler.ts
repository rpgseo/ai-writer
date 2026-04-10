import { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env } from '../types/env';

export function errorHandler(err: Error, c: Context<{ Bindings: Env }>) {
  const isDev = c.env.ENVIRONMENT !== 'production';

  if (isDev) {
    console.error(`[ERROR] ${err.message}`, err.stack);
  } else {
    console.error(`[ERROR] ${err.message}`);
  }

  if (err instanceof HTTPException) {
    return c.json(
      { success: false, error: err.message },
      err.status
    );
  }

  // Don't leak internal error details in production
  return c.json(
    {
      success: false,
      error: isDev ? err.message : 'Internal server error',
    },
    500
  );
}
