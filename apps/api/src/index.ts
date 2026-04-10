import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env } from './types/env';
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/error-handler';
import { parsePagination, isValidEnum, BRIEF_STATUSES } from './utils/validation';
import { safeJsonParse } from './utils/json';
import projectsRoute from './routes/projects';
import articlesRoute from './routes/articles';
import pipelineRoute from './routes/pipeline';

const app = new Hono<{ Bindings: Env }>();

// ============================================================
// Global middleware
// ============================================================

app.use('*', logger());
app.use('*', cors({
  origin: (origin, c) => {
    const allowed = [
      c.env.CORS_ORIGIN,
      'http://localhost:5173',
      'http://localhost:3000',
    ].filter(Boolean);
    // Return the origin only if it matches; otherwise return empty string to block
    return allowed.includes(origin) ? origin : '';
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  maxAge: 86400,
}));

// Body size limit middleware (1MB max)
app.use('*', async (c, next) => {
  const contentLength = c.req.header('Content-Length');
  if (contentLength && parseInt(contentLength, 10) > 1_048_576) {
    return c.json({ success: false, error: 'Request body too large (max 1MB)' }, 413);
  }
  await next();
});

// Error handler
app.onError(errorHandler);

// ============================================================
// Health check (no auth)
// ============================================================

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// API routes (with auth)
// ============================================================

const api = new Hono<{ Bindings: Env }>();
api.use('*', authMiddleware);

// Mount route modules
api.route('/projects', projectsRoute);
api.route('/articles', articlesRoute);
api.route('/pipeline', pipelineRoute);

// GSC connect
api.post('/projects/:id/gsc/connect', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<{ gsc_property: string }>();

  if (!body.gsc_property || typeof body.gsc_property !== 'string') {
    return c.json({ success: false, error: 'gsc_property is required' }, 400);
  }

  // Verify project exists
  const project = await c.env.DB.prepare(
    'SELECT id FROM projects WHERE id = ?'
  ).bind(id).first();

  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  await c.env.DB.prepare(
    "UPDATE projects SET gsc_connected = 1, gsc_property = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(body.gsc_property, id).run();

  return c.json({ success: true, data: { connected: true, property: body.gsc_property } });
});

// Topical map list (with pagination)
api.get('/projects/:id/topical-map', async (c) => {
  const { id } = c.req.param();
  const { limit, offset } = parsePagination(c.req.query('limit'), c.req.query('offset'));

  const maps = await c.env.DB.prepare(
    'SELECT * FROM topical_maps WHERE project_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).bind(id, limit, offset).all();

  return c.json({ success: true, data: maps.results });
});

// Topical map clusters
api.get('/projects/:id/topical-map/:mapId/clusters', async (c) => {
  const { id, mapId } = c.req.param();
  const { limit, offset } = parsePagination(c.req.query('limit'), c.req.query('offset'));

  const clusters = await c.env.DB.prepare(
    'SELECT * FROM topic_clusters WHERE project_id = ? AND topical_map_id = ? ORDER BY priority_score DESC LIMIT ? OFFSET ?'
  ).bind(id, mapId, limit, offset).all();

  return c.json({ success: true, data: clusters.results });
});

// Briefs list (with pagination and status filter)
api.get('/projects/:id/briefs', async (c) => {
  const { id } = c.req.param();
  const status = c.req.query('status');
  const { limit, offset } = parsePagination(c.req.query('limit'), c.req.query('offset'));

  if (status && !isValidEnum(status, [...BRIEF_STATUSES])) {
    return c.json({ success: false, error: `Invalid status. Allowed: ${BRIEF_STATUSES.join(', ')}` }, 400);
  }

  let query = 'SELECT * FROM content_briefs WHERE project_id = ?';
  const params: unknown[] = [id];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY priority_score DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const briefs = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ success: true, data: briefs.results });
});

// Link graph list (with pagination)
api.get('/projects/:id/link-graph', async (c) => {
  const { id } = c.req.param();
  const { limit, offset } = parsePagination(c.req.query('limit'), c.req.query('offset'));

  const links = await c.env.DB.prepare(
    'SELECT * FROM link_graph WHERE project_id = ? ORDER BY priority DESC LIMIT ? OFFSET ?'
  ).bind(id, limit, offset).all();

  return c.json({ success: true, data: links.results });
});

// Update link graph status
api.put('/projects/:id/link-graph/:linkId', async (c) => {
  const { id, linkId } = c.req.param();
  const body = await c.req.json<{ status: string }>();

  const LINK_STATUSES = ['pending', 'approved', 'inserted', 'rejected'];
  if (!body.status || !LINK_STATUSES.includes(body.status)) {
    return c.json({ success: false, error: `Invalid status. Allowed: ${LINK_STATUSES.join(', ')}` }, 400);
  }

  const result = await c.env.DB.prepare(
    'UPDATE link_graph SET status = ? WHERE id = ? AND project_id = ?'
  ).bind(body.status, linkId, id).run();

  if (!result.meta.changes) {
    return c.json({ success: false, error: 'Link not found' }, 404);
  }

  return c.json({ success: true, data: { id: linkId, status: body.status } });
});

// Mount API under /api
app.route('/api', api);

// ============================================================
// 404 fallback
// ============================================================

app.notFound((c) => {
  return c.json({ success: false, error: 'Not found' }, 404);
});

export default app;
