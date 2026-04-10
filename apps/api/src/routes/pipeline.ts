import { Hono } from 'hono';
import type { Env } from '../types/env';
import { generateId } from '../utils/id';
import { PIPELINE_PHASES } from '@ai-writer/shared';
import { PipelineExecutor } from '../services/pipeline-executor';

const app = new Hono<{ Bindings: Env }>();

// Start full pipeline for a project
app.post('/:projectId/pipeline', async (c) => {
  const { projectId } = c.req.param();
  const body = await c.req.json<{
    phases?: string[];
  }>().catch(() => ({ phases: undefined as string[] | undefined }));

  // Verify project exists
  const project = await c.env.DB.prepare(
    'SELECT * FROM projects WHERE id = ?'
  ).bind(projectId).first();

  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  const phasesToRun = body.phases ?? [...PIPELINE_PHASES];

  // Create pipeline run record
  const runId = generateId();
  const phases = phasesToRun.map((phase: string) => ({
    phase,
    status: 'pending',
    started_at: null,
    completed_at: null,
    error: null,
    stats: {},
  }));

  await c.env.DB.prepare(
    `INSERT INTO pipeline_runs (id, project_id, current_phase, phases)
     VALUES (?, ?, ?, ?)`
  ).bind(runId, projectId, phasesToRun[0], JSON.stringify(phases)).run();

  // Execute pipeline phases sequentially
  // In production, this would be a Cloudflare Workflow.
  // For now, we run the first phase and return immediately.
  const executor = new PipelineExecutor(c.env);

  // Start first phase in background (don't await)
  c.executionCtx.waitUntil(
    (async () => {
      for (const phase of phasesToRun) {
        const result = await executor.executePhase(projectId, runId, phase as any);
        if (result.status === 'failed') break;
      }
    })()
  );

  return c.json({
    success: true,
    data: {
      run_id: runId,
      project_id: projectId,
      phases: phasesToRun,
      status: 'started',
      message: 'Pipeline started. Check status at GET /pipeline/:projectId/status',
    },
  }, 202);
});

// Run a single pipeline phase
app.post('/:projectId/pipeline/:phase', async (c) => {
  const { projectId, phase } = c.req.param();

  if (!PIPELINE_PHASES.includes(phase as any)) {
    return c.json({ success: false, error: `Invalid phase. Valid: ${PIPELINE_PHASES.join(', ')}` }, 400);
  }

  const project = await c.env.DB.prepare(
    'SELECT id FROM projects WHERE id = ?'
  ).bind(projectId).first();

  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  // Create a single-phase run
  const runId = generateId();
  const phases = [{
    phase,
    status: 'pending',
    started_at: null,
    completed_at: null,
    error: null,
    stats: {},
  }];

  await c.env.DB.prepare(
    `INSERT INTO pipeline_runs (id, project_id, current_phase, phases)
     VALUES (?, ?, ?, ?)`
  ).bind(runId, projectId, phase, JSON.stringify(phases)).run();

  const executor = new PipelineExecutor(c.env);

  c.executionCtx.waitUntil(
    executor.executePhase(projectId, runId, phase as any)
  );

  return c.json({
    success: true,
    data: { run_id: runId, phase, status: 'started' },
  }, 202);
});

// Get pipeline status
app.get('/:projectId/status', async (c) => {
  const { projectId } = c.req.param();

  const run = await c.env.DB.prepare(
    'SELECT * FROM pipeline_runs WHERE project_id = ? ORDER BY started_at DESC LIMIT 1'
  ).bind(projectId).first();

  if (!run) {
    return c.json({ success: false, error: 'No pipeline runs found' }, 404);
  }

  return c.json({
    success: true,
    data: {
      ...run,
      phases: safeJsonParse(run.phases as string, []),
    },
  });
});

// Get pipeline history
app.get('/:projectId/history', async (c) => {
  const { projectId } = c.req.param();

  const results = await c.env.DB.prepare(
    'SELECT * FROM pipeline_runs WHERE project_id = ? ORDER BY started_at DESC LIMIT 20'
  ).bind(projectId).all();

  return c.json({
    success: true,
    data: results.results.map((run) => ({
      ...run,
      phases: safeJsonParse(run.phases as string, []),
    })),
  });
});

function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

export default app;
