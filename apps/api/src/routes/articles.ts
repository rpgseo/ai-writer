import { Hono } from 'hono';
import type { Env } from '../types/env';
import { generateId } from '../utils/id';
import { safeJsonParse } from '../utils/json';
import { parsePagination, isValidEnum, ARTICLE_STATUSES } from '../utils/validation';

const app = new Hono<{ Bindings: Env }>();

// List articles for a project
app.get('/project/:projectId', async (c) => {
  const { projectId } = c.req.param();
  const status = c.req.query('status');
  const { limit, offset } = parsePagination(c.req.query('limit'), c.req.query('offset'));

  if (status && !isValidEnum(status, [...ARTICLE_STATUSES])) {
    return c.json({ success: false, error: `Invalid status. Allowed: ${ARTICLE_STATUSES.join(', ')}` }, 400);
  }

  let query = 'SELECT id, project_id, brief_id, title, slug, meta_title, meta_description, excerpt, language, word_count, nw_score, eeat_score, readability_score, status, published_url, optimization_iterations, created_at, updated_at FROM articles WHERE project_id = ?';
  const params: unknown[] = [projectId];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  // Count with same filter
  let countQuery = 'SELECT COUNT(*) as total FROM articles WHERE project_id = ?';
  const countParams: unknown[] = [projectId];
  if (status) {
    countQuery += ' AND status = ?';
    countParams.push(status);
  }

  query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const [results, countResult] = await Promise.all([
    c.env.DB.prepare(query).bind(...params).all(),
    c.env.DB.prepare(countQuery).bind(...countParams).first<{ total: number }>(),
  ]);

  return c.json({
    success: true,
    data: results.results.map(parseArticleListItem),
    meta: {
      total: countResult?.total ?? 0,
      limit,
      offset,
    },
  });
});

// Get single article (full content)
app.get('/:id', async (c) => {
  const { id } = c.req.param();
  const result = await c.env.DB.prepare(
    'SELECT * FROM articles WHERE id = ?'
  ).bind(id).first();

  if (!result) {
    return c.json({ success: false, error: 'Article not found' }, 404);
  }

  return c.json({ success: true, data: parseArticle(result) });
});

// Create article manually
app.post('/', async (c) => {
  const body = await c.req.json<{
    project_id: string;
    title: string;
    slug?: string;
    content_markdown?: string;
    language?: string;
    brief_id?: string;
  }>();

  if (!body.project_id || !body.title) {
    return c.json({ success: false, error: 'project_id and title are required' }, 400);
  }

  if (body.title.length > 500) {
    return c.json({ success: false, error: 'Title must be 500 characters or less' }, 400);
  }

  const id = generateId();
  const slug = body.slug ?? slugify(body.title);

  if (!slug) {
    return c.json({ success: false, error: 'Could not generate a valid slug from title' }, 400);
  }

  // Check slug uniqueness within project
  const existing = await c.env.DB.prepare(
    'SELECT id FROM articles WHERE project_id = ? AND slug = ?'
  ).bind(body.project_id, slug).first();

  if (existing) {
    return c.json({ success: false, error: 'An article with this slug already exists in this project' }, 409);
  }

  const wordCount = body.content_markdown
    ? body.content_markdown.split(/\s+/).filter(Boolean).length
    : 0;

  await c.env.DB.prepare(
    `INSERT INTO articles (id, project_id, brief_id, title, slug, content_markdown, language, word_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    body.project_id,
    body.brief_id ?? null,
    body.title,
    slug,
    body.content_markdown ?? null,
    body.language ?? 'es',
    wordCount
  ).run();

  const article = await c.env.DB.prepare(
    'SELECT * FROM articles WHERE id = ?'
  ).bind(id).first();

  if (!article) {
    return c.json({ success: false, error: 'Failed to create article' }, 500);
  }

  return c.json({ success: true, data: parseArticle(article) }, 201);
});

// Update article
app.put('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<Record<string, unknown>>();

  const existing = await c.env.DB.prepare(
    'SELECT id FROM articles WHERE id = ?'
  ).bind(id).first();

  if (!existing) {
    return c.json({ success: false, error: 'Article not found' }, 404);
  }

  const allowedFields = [
    'title', 'slug', 'meta_title', 'meta_description',
    'content_markdown', 'content_html', 'excerpt', 'language',
    'status', 'schema_article', 'schema_faq', 'schema_howto',
    'internal_links',
  ];

  const updates: string[] = [];
  const values: unknown[] = [];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      // Validate status enum
      if (field === 'status' && !isValidEnum(body[field] as string, [...ARTICLE_STATUSES])) {
        return c.json({ success: false, error: `Invalid status. Allowed: ${ARTICLE_STATUSES.join(', ')}` }, 400);
      }
      updates.push(`${field} = ?`);
      const val = body[field];
      values.push(typeof val === 'object' ? JSON.stringify(val) : val);
    }
  }

  if (body.content_markdown && typeof body.content_markdown === 'string') {
    updates.push('word_count = ?');
    values.push(body.content_markdown.split(/\s+/).filter(Boolean).length);
  }

  if (updates.length === 0) {
    return c.json({ success: false, error: 'No valid fields to update' }, 400);
  }

  updates.push("updated_at = datetime('now')");
  values.push(id);

  await c.env.DB.prepare(
    `UPDATE articles SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  const updated = await c.env.DB.prepare(
    'SELECT * FROM articles WHERE id = ?'
  ).bind(id).first();

  if (!updated) {
    return c.json({ success: false, error: 'Failed to retrieve updated article' }, 500);
  }

  return c.json({ success: true, data: parseArticle(updated) });
});

// Delete article
app.delete('/:id', async (c) => {
  const { id } = c.req.param();

  const result = await c.env.DB.prepare(
    'DELETE FROM articles WHERE id = ?'
  ).bind(id).run();

  if (!result.meta.changes) {
    return c.json({ success: false, error: 'Article not found' }, 404);
  }

  return c.json({ success: true, data: { deleted: id } });
});

// ============================================================
// Helpers
// ============================================================

/** Parse article for list view (no heavy content fields) */
function parseArticleListItem(row: Record<string, unknown>) {
  return row;
}

/** Parse article for detail view (with all JSON fields) */
function parseArticle(row: Record<string, unknown>) {
  return {
    ...row,
    nw_recommendations: safeJsonParse(row.nw_recommendations as string, null),
    internal_links: safeJsonParse(row.internal_links as string, []),
    schema_article: safeJsonParse(row.schema_article as string, null),
    schema_faq: safeJsonParse(row.schema_faq as string, null),
    schema_howto: safeJsonParse(row.schema_howto as string, null),
  };
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // Fallback if slug is empty after processing
  return slug || `article-${generateId().slice(0, 8)}`;
}

export default app;
