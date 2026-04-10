import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api-client';
import { PIPELINE_PHASE_LABELS } from '@ai-writer/shared';

interface PipelineProps {
  projectId: string;
}

interface PhaseStatus {
  phase: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  stats: Record<string, number>;
}

interface PipelineRun {
  id: string;
  project_id: string;
  current_phase: string;
  phases: PhaseStatus[];
  started_at: string;
  completed_at: string | null;
}

export function Pipeline({ projectId }: PipelineProps) {
  const [status, setStatus] = useState<PipelineRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load current status
  useEffect(() => {
    loadStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [projectId]);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const res = await api.get<PipelineRun>(`/pipeline/${projectId}/status`);
      setStatus(res.data ?? null);

      // If pipeline is running, start polling
      const isRunning = res.data?.phases?.some((p) => p.status === 'running');
      if (isRunning) {
        startPolling();
      }
    } catch {
      // No pipeline runs yet — that's OK
      setStatus(null);
    }
    setLoading(false);
  };

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get<PipelineRun>(`/pipeline/${projectId}/status`);
        setStatus(res.data ?? null);

        const stillRunning = res.data?.phases?.some((p) => p.status === 'running');
        if (!stillRunning && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 3000);
  };

  const startPipeline = async (phases?: string[]) => {
    setStarting(true);
    setError('');
    try {
      await api.post(`/pipeline/${projectId}/pipeline`, phases ? { phases } : {});
      // Wait a moment then start polling
      setTimeout(() => {
        loadStatus();
        startPolling();
      }, 1000);
    } catch (err) {
      setError((err as Error).message);
    }
    setStarting(false);
  };

  const runSinglePhase = async (phase: string) => {
    setStarting(true);
    setError('');
    try {
      await api.post(`/pipeline/${projectId}/pipeline/${phase}`);
      setTimeout(() => {
        loadStatus();
        startPolling();
      }, 1000);
    } catch (err) {
      setError((err as Error).message);
    }
    setStarting(false);
  };

  const isRunning = status?.phases?.some((p) => p.status === 'running');

  if (loading && !status) {
    return <div className="text-gray-400">Loading pipeline status...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Content Pipeline</h1>
          <p className="text-gray-400 mt-1">Run and monitor the full content creation pipeline</p>
        </div>
        <button
          onClick={() => startPipeline()}
          disabled={starting || isRunning}
          className="btn-primary"
        >
          {starting ? 'Starting...' : isRunning ? 'Running...' : '▶ Run Full Pipeline'}
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Phase Cards */}
      <div className="space-y-4">
        {(status?.phases || getDefaultPhases()).map((phase) => (
          <div
            key={phase.phase}
            className={`card flex items-center justify-between transition-colors ${
              phase.status === 'running' ? 'border-brand-500/50 bg-brand-500/5' :
              phase.status === 'completed' ? 'border-green-500/30' :
              phase.status === 'failed' ? 'border-red-500/30' : ''
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                phase.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                phase.status === 'running' ? 'bg-brand-500/20 text-brand-400 animate-pulse' :
                phase.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                'bg-gray-800 text-gray-500'
              }`}>
                {phase.status === 'completed' ? '✓' :
                 phase.status === 'running' ? '⟳' :
                 phase.status === 'failed' ? '✕' : '○'}
              </div>
              <div>
                <h3 className="font-semibold">
                  {PIPELINE_PHASE_LABELS[phase.phase] || phase.phase}
                </h3>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    phase.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                    phase.status === 'running' ? 'bg-brand-500/20 text-brand-400' :
                    phase.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                    'bg-gray-800 text-gray-500'
                  }`}>
                    {phase.status}
                  </span>
                  {phase.started_at && (
                    <span className="text-xs text-gray-600">
                      {new Date(phase.started_at).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                {phase.error && (
                  <p className="text-xs text-red-400 mt-1">{phase.error}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Stats */}
              {phase.stats && Object.keys(phase.stats).length > 0 && (
                <div className="flex gap-3">
                  {Object.entries(phase.stats).map(([key, value]) => (
                    <span key={key} className="text-xs text-gray-400">
                      {key.replace(/_/g, ' ')}: <span className="text-brand-400 font-medium">{value}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Run single phase */}
              <button
                onClick={() => runSinglePhase(phase.phase)}
                disabled={starting || isRunning}
                className="text-xs text-gray-500 hover:text-brand-400 transition-colors disabled:opacity-30"
              >
                Run
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mt-8 card">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => startPipeline(['discovery', 'gsc_intelligence'])}
            disabled={starting || isRunning}
            className="btn-secondary text-sm"
          >
            Crawl & Analyze
          </button>
          <button
            onClick={() => startPipeline(['topical_map', 'content_planning'])}
            disabled={starting || isRunning}
            className="btn-secondary text-sm"
          >
            Build Topical Map
          </button>
          <button
            onClick={() => startPipeline(['content_generation', 'optimization'])}
            disabled={starting || isRunning}
            className="btn-secondary text-sm"
          >
            Generate & Optimize
          </button>
          <button
            onClick={() => startPipeline(['internal_linking', 'export'])}
            disabled={starting || isRunning}
            className="btn-secondary text-sm"
          >
            Link & Export
          </button>
        </div>
      </div>
    </div>
  );
}

function getDefaultPhases(): PhaseStatus[] {
  return [
    'discovery', 'gsc_intelligence', 'topical_map', 'content_planning',
    'content_generation', 'optimization', 'internal_linking', 'export',
  ].map((phase) => ({
    phase,
    status: 'pending',
    started_at: null,
    completed_at: null,
    error: null,
    stats: {},
  }));
}
