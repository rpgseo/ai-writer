import { useState, useEffect } from 'react';
import { api } from '../lib/api-client';

interface TopicalMapProps {
  projectId: string;
  onNavigate: (path: string) => void;
}

interface TopicalMapData {
  id: string;
  name: string;
  pillar_topics: string;
  total_clusters: number;
  total_keywords: number;
  coverage_score: number;
  status: string;
  created_at: string;
}

interface ClusterData {
  id: string;
  cluster_name: string;
  pillar_keyword: string;
  keywords: string;
  funnel_stage: string;
  entity_gaps: string;
  priority_score: number;
  status: string;
  assigned_brief_id: string | null;
}

const FUNNEL_COLORS: Record<string, string> = {
  tofu: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  mofu: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  bofu: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const FUNNEL_LABELS: Record<string, string> = {
  tofu: 'Top of Funnel',
  mofu: 'Middle of Funnel',
  bofu: 'Bottom of Funnel',
};

export function TopicalMap({ projectId, onNavigate }: TopicalMapProps) {
  const [maps, setMaps] = useState<TopicalMapData[]>([]);
  const [selectedMap, setSelectedMap] = useState<TopicalMapData | null>(null);
  const [clusters, setClusters] = useState<ClusterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [funnelFilter, setFunnelFilter] = useState<string>('');

  useEffect(() => {
    loadMaps();
  }, [projectId]);

  const loadMaps = async () => {
    setLoading(true);
    try {
      const res = await api.get<TopicalMapData[]>(`/projects/${projectId}/topical-map`);
      const data = res.data ?? [];
      setMaps(data);
      if (data.length > 0) {
        setSelectedMap(data[0]);
        loadClusters(data[0].id);
      }
    } catch {
      // No maps yet
    }
    setLoading(false);
  };

  const loadClusters = async (mapId: string) => {
    try {
      const res = await api.get<ClusterData[]>(`/projects/${projectId}/topical-map/${mapId}/clusters`);
      setClusters(res.data ?? []);
    } catch {
      setClusters([]);
    }
  };

  const filteredClusters = funnelFilter
    ? clusters.filter((c) => c.funnel_stage === funnelFilter)
    : clusters;

  const funnelCounts = clusters.reduce<Record<string, number>>((acc, c) => {
    acc[c.funnel_stage] = (acc[c.funnel_stage] || 0) + 1;
    return acc;
  }, {});

  if (loading) {
    return <div className="text-gray-400">Loading topical map...</div>;
  }

  if (maps.length === 0) {
    return (
      <div className="card text-center py-12">
        <h1 className="text-2xl font-bold mb-2">Topical Map</h1>
        <p className="text-gray-400">No topical maps generated yet</p>
        <p className="text-gray-500 text-sm mt-2">
          Run the pipeline to crawl your site, analyze GSC data, and build a topical map
        </p>
        <button
          className="btn-primary mt-4"
          onClick={() => onNavigate(`/projects/${projectId}/pipeline`)}
        >
          Go to Pipeline
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Topical Map</h1>
          <p className="text-gray-400 mt-1">
            {selectedMap?.total_clusters} clusters • {selectedMap?.total_keywords} keywords • {selectedMap?.coverage_score}% coverage
          </p>
        </div>
      </div>

      {/* Stats Bar */}
      {selectedMap && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-brand-400">{selectedMap.total_clusters}</p>
            <p className="text-xs text-gray-500 mt-1">Clusters</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-brand-400">{selectedMap.total_keywords}</p>
            <p className="text-xs text-gray-500 mt-1">Keywords</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-brand-400">{selectedMap.coverage_score}%</p>
            <p className="text-xs text-gray-500 mt-1">Entity Coverage</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-brand-400">
              {safeJsonParse<string[]>(selectedMap.pillar_topics, []).length}
            </p>
            <p className="text-xs text-gray-500 mt-1">Pillar Topics</p>
          </div>
        </div>
      )}

      {/* Funnel Filters */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFunnelFilter('')}
          className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
            !funnelFilter ? 'bg-brand-500/20 text-brand-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          All ({clusters.length})
        </button>
        {(['tofu', 'mofu', 'bofu'] as const).map((stage) => (
          <button
            key={stage}
            onClick={() => setFunnelFilter(funnelFilter === stage ? '' : stage)}
            className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
              funnelFilter === stage ? FUNNEL_COLORS[stage] : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border-transparent'
            }`}
          >
            {FUNNEL_LABELS[stage]} ({funnelCounts[stage] || 0})
          </button>
        ))}
      </div>

      {/* Cluster Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredClusters.map((cluster) => {
          const keywords = safeJsonParse<Array<{ keyword: string; volume: number; kd: number }>>(cluster.keywords, []);
          const entityGaps = safeJsonParse<string[]>(cluster.entity_gaps, []);

          return (
            <div key={cluster.id} className="card">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-lg">{cluster.cluster_name}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Pillar: {cluster.pillar_keyword}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded border ${FUNNEL_COLORS[cluster.funnel_stage] || ''}`}>
                    {cluster.funnel_stage.toUpperCase()}
                  </span>
                  <span className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">
                    P{cluster.priority_score}
                  </span>
                </div>
              </div>

              {/* Keywords */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {keywords.slice(0, 8).map((kw) => (
                  <span key={kw.keyword} className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded">
                    {kw.keyword}
                    {kw.volume > 0 && <span className="text-gray-600 ml-1">({kw.volume})</span>}
                  </span>
                ))}
                {keywords.length > 8 && (
                  <span className="text-xs text-gray-600">+{keywords.length - 8} more</span>
                )}
              </div>

              {/* Entity Gaps */}
              {entityGaps.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-1">Entity gaps:</p>
                  <div className="flex flex-wrap gap-1">
                    {entityGaps.slice(0, 5).map((gap) => (
                      <span key={gap} className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded">
                        {gap}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Status & Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                <span className={`text-xs px-2 py-0.5 rounded ${
                  cluster.status === 'covered' ? 'bg-green-500/20 text-green-400' :
                  cluster.status === 'in_progress' ? 'bg-brand-500/20 text-brand-400' :
                  'bg-gray-700 text-gray-400'
                }`}>
                  {cluster.status}
                </span>
                <span className="text-xs text-gray-600">
                  {keywords.length} keywords
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
