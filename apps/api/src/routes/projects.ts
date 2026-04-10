import { Hono } from 'hono';
import type { Env } from '../types/env';
import { generateId } from '../utils/id';
import { safeJsonParse } from '../utils/json';
import { isValidDomain, sanitizeDomain, isWithinLength, parsePagination } from '../utils/validation';
import { DEFAULT_PROJECT_SETTINGS } from '@ai-writer/shared';

const app = new Hono<{ Bindings: Env }>();

// List all projects (with pagination)
app.get('/', async (c) => {
  const { limit, offset } = parsePagination(c.req.query('limit'), c.req.query('offset'));

  const results = await c.env.DB.prepare(
    'SELECT id, domain, name, language, theme_summary, gsc_connected, gsc_property, cms_type, settings, created_at, updated_at FROM projects ORDER BY updated_at DESC LIMIT ? OFFSET ?'
  ).bind(limit, offset).all();

  return c.json({
    success: true,
    data: results.results.map(parseProject),
  });
});

// Get single project
app.get('/:id', async (c) => {
  const { id } = c.req.param();
  const result = await c.env.DB.prepare(
    'SELECT * FROM projects WHERE id = ?'
  ).bind(id).first();

  if (!result) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  // Get stats in parallel
  const [pagesCount, keywordsCount, articlesCount, linksCount, mapsCount, briefsCount] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM site_pages WHERE project_id = ?').bind(id).first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM gsc_keywords WHERE project_id = ?').bind(id).first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM articles WHERE project_id = ?').bind(id).first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM link_graph WHERE project_id = ?').bind(id).first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM topical_maps WHERE project_id = ?').bind(id).first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM content_briefs WHERE project_id = ?').bind(id).first<{ count: number }>(),
  ]);

  return c.json({
    success: true,
    data: {
      ...parseProject(result),
      stats: {
        pages_crawled: pagesCount?.count ?? 0,
        gsc_keywords: keywordsCount?.count ?? 0,
        articles: articlesCount?.count ?? 0,
        link_suggestions: linksCount?.count ?? 0,
        topical_maps: mapsCount?.count ?? 0,
        content_briefs: briefsCount?.count ?? 0,
      },
    },
  });
});

// Create project
app.post('/', async (c) => {
  const body = await c.req.json<{
    domain: string;
    name: string;
    language?: string;
    cms_type?: string;
    cms_api_url?: string;
    settings?: Record<string, unknown>;
  }>();

  if (!body.domain || !body.name) {
    return c.json({ success: false, error: 'domain and name are required' }, 400);
  }

  if (!isValidDomain(body.domain)) {
    return c.json({ success: false, error: 'Invalid domain format' }, 400);
  }

  if (!isWithinLength(body.name, 200)) {
    return c.json({ success: false, error: 'Name must be 200 characters or less' }, 400);
  }

  const domain = sanitizeDomain(body.domain);
  const id = generateId();
  const settings = JSON.stringify({ ...DEFAULT_PROJECT_SETTINGS, ...body.settings });

  await c.env.DB.prepare(
    `INSERT INTO projects (id, domain, name, language, cms_type, cms_api_url, settings)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      domain,
      body.name,
      body.language ?? 'es',
      body.cms_type ?? 'none',
      body.cms_api_url ?? null,
      settings
    )
    .run();

  const project = await c.env.DB.prepare(
    'SELECT * FROM projects WHERE id = ?'
  ).bind(id).first();

  if (!project) {
    return c.json({ success: false, error: 'Failed to create project' }, 500);
  }

  return c.json({ success: true, data: parseProject(project) }, 201);
});

// Update project
app.put('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<Record<string, unknown>>();

  const existing = await c.env.DB.prepare(
    'SELECT * FROM projects WHERE id = ?'
  ).bind(id).first();

  if (!existing) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  // gsc_property excluded - use /gsc/connect endpoint instead
  const allowedFields = ['name', 'language', 'cms_type', 'cms_api_url', 'settings'];
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(
        field === 'settings'
          ? JSON.stringify({ ...safeJsonParse(existing.settings as string, {}), ...body[field] as object })
          : body[field]
      );
    }
  }

  if (updates.length === 0) {
    return c.json({ success: false, error: 'No valid fields to update' }, 400);
  }

  updates.push("updated_at = datetime('now')");
  values.push(id);

  await c.env.DB.prepare(
    `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  const updated = await c.env.DB.prepare(
    'SELECT * FROM projects WHERE id = ?'
  ).bind(id).first();

  if (!updated) {
    return c.json({ success: false, error: 'Failed to retrieve updated project' }, 500);
  }

  return c.json({ success: true, data: parseProject(updated) });
});

// Delete project
app.delete('/:id', async (c) => {
  const { id } = c.req.param();

  const result = await c.env.DB.prepare(
    'DELETE FROM projects WHERE id = ?'
  ).bind(id).run();

  if (!result.meta.changes) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  return c.json({ success: true, data: { deleted: id } });
});

// ============================================================
// Helpers
// ============================================================

function parseProject(row: Record<string, unknown>) {
  return {
    ...row,
    gsc_connected: Boolean(row.gsc_connected),
    core_entities: safeJsonParse(row.core_entities as string, []),
    settings: safeJsonParse(row.settings as string, DEFAULT_PROJECT_SETTINGS),
  };
}

export default app;
