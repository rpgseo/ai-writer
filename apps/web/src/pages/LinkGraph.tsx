import { useState, useEffect } from 'react';
import { api } from '../lib/api-client';

interface LinkGraphProps {
  projectId: string;
}

interface LinkEdgeData {
  id: string;
  source_url: string;
  target_url: string;
  anchor_text: string | null;
  link_type: string;
  keyword_target: string | null;
  context_snippet: string | null;
  priority: number;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-700 text-gray-300',
  approved: 'bg-brand-500/20 text-brand-400',
  inserted: 'bg-green-500/20 text-green-400',
  rejected: 'bg-red-500/20 text-red-400',
};

const TYPE_COLORS: Record<string, string> = {
  existing: 'text-gray-400',
  suggested: 'text-brand-400',
  inserted: 'text-green-400',
};

export function LinkGraph({ projectId }: LinkGraphProps) {
  const [links, setLinks] = useState<LinkEdgeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    loadLinks();
  }, [projectId]);

  const loadLinks = async () => {
    setLoading(true);
    try {
      const res = await api.get<LinkEdgeData[]>(`/projects/${projectId}/link-graph`);
      setLinks(res.data ?? []);
    } catch {
      setLinks([]);
    }
    setLoading(false);
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      await api.put(`/projects/${projectId}/link-graph/${id}`, { status: newStatus });
      setLinks((prev) => prev.map((l) => l.id === id ? { ...l, status: newStatus } : l));
    } catch {
      // Silently handle
    }
  };

  const filtered = links.filter((l) => {
    if (statusFilter && l.status !== statusFilter) return false;
    if (typeFilter && l.link_type !== typeFilter) return false;
    return true;
  });

  const stats = {
    total: links.length,
    pending: links.filter((l) => l.status === 'pending').length,
    approved: links.filter((l) => l.status === 'approved').length,
    inserted: links.filter((l) => l.status === 'inserted').length,
    suggested: links.filter((l) => l.link_type === 'suggested').length,
    existing: links.filter((l) => l.link_type === 'existing').length,
  };

  if (loading) return <div className="text-gray-400">Loading link graph...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Internal Links</h1>
          <p className="text-gray-400 mt-1">
            {stats.total} links • {stats.pending} pending review
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card text-center py-4">
          <p className="text-2xl font-bold text-brand-400">{stats.total}</p>
          <p className="text-xs text-gray-500 mt-1">Total Links</p>
        </div>
        <div className="card text-center py-4">
          <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
          <p className="text-xs text-gray-500 mt-1">Pending Review</p>
        </div>
        <div className="card text-center py-4">
          <p className="text-2xl font-bold text-green-400">{stats.inserted}</p>
          <p className="text-xs text-gray-500 mt-1">Inserted</p>
        </div>
        <div className="card text-center py-4">
          <p className="text-2xl font-bold text-brand-400">{stats.suggested}</p>
          <p className="text-xs text-gray-500 mt-1">AI Suggested</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex gap-2">
          <span className="text-sm text-gray-500 self-center">Status:</span>
          {['', 'pending', 'approved', 'inserted', 'rejected'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs px-2 py-1 rounded capitalize ${
                statusFilter === s ? 'bg-brand-500/20 text-brand-400' : 'bg-gray-800 text-gray-400'
              }`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <span className="text-sm text-gray-500 self-center">Type:</span>
          {['', 'existing', 'suggested', 'inserted'].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`text-xs px-2 py-1 rounded capitalize ${
                typeFilter === t ? 'bg-brand-500/20 text-brand-400' : 'bg-gray-800 text-gray-400'
              }`}
            >
              {t || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Links Table */}
      {filtered.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400">No links found</p>
          <p className="text-gray-500 text-sm mt-2">Run the internal linking phase in the pipeline</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((link) => (
            <div key={link.id} className="card flex items-center justify-between py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono ${TYPE_COLORS[link.link_type] || 'text-gray-400'}`}>
                    [{link.link_type}]
                  </span>
                  <span className="text-sm text-gray-300 truncate">{shortenUrl(link.source_url)}</span>
                  <span className="text-gray-600">→</span>
                  <span className="text-sm text-brand-400 truncate">{shortenUrl(link.target_url)}</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  {link.anchor_text && (
                    <span className="text-xs text-gray-500">
                      anchor: <span className="text-gray-400">"{link.anchor_text}"</span>
                    </span>
                  )}
                  {link.context_snippet && (
                    <span className="text-xs text-gray-600 truncate max-w-md">{link.context_snippet}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 ml-4">
                <span className="text-xs text-gray-500">P{link.priority}</span>
                <span className={`text-xs px-2 py-0.5 rounded capitalize ${STATUS_COLORS[link.status] || ''}`}>
                  {link.status}
                </span>
                {link.status === 'pending' && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => updateStatus(link.id, 'approved')}
                      className="text-xs text-green-400 hover:bg-green-500/10 px-2 py-1 rounded"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => updateStatus(link.id, 'rejected')}
                      className="text-xs text-red-400 hover:bg-red-500/10 px-2 py-1 rounded"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function shortenUrl(url: string): string {
  try {
    const parsed = new URL(url, 'https://placeholder.com');
    return parsed.pathname.length > 50 ? parsed.pathname.slice(0, 47) + '...' : parsed.pathname;
  } catch {
    return url.length > 50 ? url.slice(0, 47) + '...' : url;
  }
}
