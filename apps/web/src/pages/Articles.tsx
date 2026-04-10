import { useState, useEffect } from 'react';
import { api } from '../lib/api-client';

interface ArticlesProps {
  projectId: string;
  onNavigate: (path: string) => void;
}

interface ArticleSummary {
  id: string;
  title: string;
  slug: string;
  status: string;
  word_count: number;
  eeat_score: number | null;
  nw_score: number | null;
  language: string;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-700 text-gray-300',
  optimizing: 'bg-yellow-500/20 text-yellow-400',
  optimized: 'bg-brand-500/20 text-brand-400',
  published: 'bg-green-500/20 text-green-400',
};

export function Articles({ projectId, onNavigate }: ArticlesProps) {
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadArticles();
  }, [projectId, filter]);

  const loadArticles = async () => {
    setLoading(true);
    try {
      const query = filter ? `?status=${filter}` : '';
      const res = await api.get<ArticleSummary[]>(`/articles/project/${projectId}${query}`);
      setArticles(res.data ?? []);
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  };

  const statusCounts = articles.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Articles</h1>
          <p className="text-gray-400 mt-1">
            {articles.length} articles • {articles.reduce((s, a) => s + a.word_count, 0).toLocaleString()} total words
          </p>
        </div>
      </div>

      {/* Status Filters */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilter('')}
          className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
            !filter ? 'bg-brand-500/20 text-brand-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          All ({articles.length})
        </button>
        {['draft', 'optimizing', 'optimized', 'published'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(filter === status ? '' : status)}
            className={`text-sm px-3 py-1.5 rounded-lg transition-colors capitalize ${
              filter === status ? 'bg-brand-500/20 text-brand-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {status} ({statusCounts[status] || 0})
          </button>
        ))}
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 px-4 py-2 rounded-lg mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-gray-400">Loading articles...</div>
      ) : articles.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 text-lg">No articles yet</p>
          <p className="text-gray-500 text-sm mt-2">Run the content pipeline to generate articles</p>
          <button
            className="btn-primary mt-4"
            onClick={() => onNavigate(`/projects/${projectId}/pipeline`)}
          >
            Go to Pipeline
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map((article) => (
            <button
              key={article.id}
              className="card w-full text-left hover:border-brand-500/50 transition-colors group"
              onClick={() => onNavigate(`/projects/${projectId}/articles/${article.id}`)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg group-hover:text-brand-400 transition-colors truncate">
                    {article.title}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">/{article.slug}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded capitalize ml-3 ${STATUS_COLORS[article.status] || 'bg-gray-700 text-gray-400'}`}>
                  {article.status}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-6 text-sm text-gray-500">
                <span>{article.word_count.toLocaleString()} words</span>
                <span>{article.language.toUpperCase()}</span>
                {article.eeat_score !== null && (
                  <span className={article.eeat_score >= 60 ? 'text-green-400' : 'text-yellow-400'}>
                    E-E-A-T: {article.eeat_score}/100
                  </span>
                )}
                {article.nw_score !== null && (
                  <span className={article.nw_score >= 70 ? 'text-green-400' : 'text-yellow-400'}>
                    NW: {article.nw_score}
                  </span>
                )}
                <span className="ml-auto">{new Date(article.updated_at).toLocaleDateString()}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
