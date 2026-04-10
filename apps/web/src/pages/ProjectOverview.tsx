import { useState, useEffect } from 'react';
import { api } from '../lib/api-client';
import type { Project } from '@ai-writer/shared';

interface ProjectOverviewProps {
  projectId: string;
  onNavigate: (path: string) => void;
}

interface ProjectStats {
  pages_crawled: number;
  gsc_keywords: number;
  articles: number;
  link_suggestions: number;
  topical_maps: number;
  content_briefs: number;
}

export function ProjectOverview({ projectId, onNavigate }: ProjectOverviewProps) {
  const [project, setProject] = useState<(Project & { stats: ProjectStats }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProject();
  }, [projectId]);

  const loadProject = async () => {
    setLoading(true);
    try {
      const res = await api.get<Project & { stats: ProjectStats }>(`/projects/${projectId}`);
      setProject(res.data ?? null);
    } catch {
      setProject(null);
    }
    setLoading(false);
  };

  if (loading) return <div className="text-gray-400">Loading project...</div>;
  if (!project) return <div className="text-red-400">Project not found</div>;

  const stats = project.stats || {
    pages_crawled: 0,
    gsc_keywords: 0,
    articles: 0,
    link_suggestions: 0,
    topical_maps: 0,
    content_briefs: 0,
  };

  const coreEntities = typeof project.core_entities === 'string'
    ? safeJsonParse<string[]>(project.core_entities, [])
    : project.core_entities ?? [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{project.name}</h1>
        <p className="text-gray-400 mt-1">{project.domain} • {project.language?.toUpperCase()}</p>
        {project.theme_summary && (
          <p className="text-gray-500 text-sm mt-2">{project.theme_summary}</p>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {[
          { label: 'Pages Crawled', value: stats.pages_crawled, action: 'discovery', icon: '🌐' },
          { label: 'GSC Keywords', value: stats.gsc_keywords, action: 'gsc', icon: '🔍' },
          { label: 'Topical Maps', value: stats.topical_maps, action: 'topical-map', icon: '🗺️' },
          { label: 'Content Briefs', value: stats.content_briefs, action: 'calendar', icon: '📋' },
          { label: 'Articles', value: stats.articles, action: 'articles', icon: '📝' },
          { label: 'Link Suggestions', value: stats.link_suggestions, action: 'links', icon: '🔗' },
        ].map((stat) => (
          <button
            key={stat.label}
            className="card text-center py-4 hover:border-brand-500/50 transition-colors"
            onClick={() => onNavigate(`/projects/${projectId}/${stat.action}`)}
          >
            <div className="text-2xl mb-1">{stat.icon}</div>
            <p className="text-2xl font-bold text-brand-400">{stat.value}</p>
            <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
          </button>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            className="btn-primary text-sm"
            onClick={() => onNavigate(`/projects/${projectId}/pipeline`)}
          >
            ▶ Run Pipeline
          </button>
          <button
            className="btn-secondary text-sm"
            onClick={() => onNavigate(`/projects/${projectId}/topical-map`)}
          >
            View Topical Map
          </button>
          <button
            className="btn-secondary text-sm"
            onClick={() => onNavigate(`/projects/${projectId}/articles`)}
          >
            View Articles
          </button>
          <button
            className="btn-secondary text-sm"
            onClick={() => onNavigate(`/projects/${projectId}/links`)}
          >
            View Links
          </button>
        </div>
      </div>

      {/* Core Entities */}
      {coreEntities.length > 0 && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-3">Core Entities</h2>
          <div className="flex flex-wrap gap-2">
            {coreEntities.map((entity) => (
              <span key={entity} className="text-sm bg-brand-500/10 text-brand-400 px-3 py-1.5 rounded-lg">
                {entity}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* GSC Connection Status */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-3">Integrations</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-gray-800">
            <span className="text-gray-300">Google Search Console</span>
            {project.gsc_connected ? (
              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
                Connected: {project.gsc_property}
              </span>
            ) : (
              <span className="text-xs bg-gray-700 text-gray-400 px-2 py-1 rounded">Not connected</span>
            )}
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-gray-300">CMS</span>
            <span className="text-xs bg-gray-700 text-gray-400 px-2 py-1 rounded">
              {project.cms_type || 'None'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
}
