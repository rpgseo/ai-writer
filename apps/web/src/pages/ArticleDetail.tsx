import { useState, useEffect } from 'react';
import { api } from '../lib/api-client';

interface ArticleDetailProps {
  projectId: string;
  articleId: string;
  onNavigate: (path: string) => void;
}

interface ArticleData {
  id: string;
  title: string;
  slug: string;
  meta_title: string | null;
  meta_description: string | null;
  content_markdown: string | null;
  content_html: string | null;
  excerpt: string | null;
  language: string;
  word_count: number;
  nw_score: number | null;
  eeat_score: number | null;
  readability_score: number | null;
  schema_article: string | null;
  schema_faq: string | null;
  internal_links: string | null;
  status: string;
  optimization_iterations: number;
  created_at: string;
  updated_at: string;
}

export function ArticleDetail({ projectId, articleId, onNavigate }: ArticleDetailProps) {
  const [article, setArticle] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'preview' | 'markdown' | 'seo' | 'schema'>('preview');

  useEffect(() => {
    loadArticle();
  }, [articleId]);

  const loadArticle = async () => {
    setLoading(true);
    try {
      const res = await api.get<ArticleData>(`/articles/${articleId}`);
      setArticle(res.data ?? null);
    } catch {
      setArticle(null);
    }
    setLoading(false);
  };

  if (loading) return <div className="text-gray-400">Loading article...</div>;
  if (!article) return <div className="text-red-400">Article not found</div>;

  const markdown = article.content_markdown || '';

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => onNavigate(`/projects/${projectId}/articles`)}
          className="text-gray-400 hover:text-white transition-colors"
        >
          ← Articles
        </button>
        <span className="text-gray-700">/</span>
        <span className="text-gray-300 truncate">{article.title}</span>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{article.title}</h1>
          <p className="text-sm text-gray-500 mt-1">/{article.slug}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded capitalize ${
          article.status === 'published' ? 'bg-green-500/20 text-green-400' :
          article.status === 'optimized' ? 'bg-brand-500/20 text-brand-400' :
          'bg-gray-700 text-gray-400'
        }`}>
          {article.status}
        </span>
      </div>

      {/* Score Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <ScoreCard label="Words" value={article.word_count.toLocaleString()} />
        <ScoreCard
          label="E-E-A-T"
          value={article.eeat_score !== null ? `${article.eeat_score}/100` : '—'}
          color={article.eeat_score !== null && article.eeat_score >= 60 ? 'green' : 'yellow'}
        />
        <ScoreCard
          label="NW Score"
          value={article.nw_score !== null ? `${article.nw_score}` : '—'}
          color={article.nw_score !== null && article.nw_score >= 70 ? 'green' : 'yellow'}
        />
        <ScoreCard
          label="Optimizations"
          value={String(article.optimization_iterations)}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800 mb-6">
        {(['preview', 'markdown', 'seo', 'schema'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm capitalize transition-colors border-b-2 ${
              activeTab === tab
                ? 'border-brand-400 text-brand-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="card">
        {activeTab === 'preview' && (
          <div
            className="prose prose-invert max-w-none"
            dangerouslySetInnerHTML={{
              __html: article.content_html || markdownToSimpleHtml(markdown),
            }}
          />
        )}

        {activeTab === 'markdown' && (
          <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
            {markdown || 'No content yet'}
          </pre>
        )}

        {activeTab === 'seo' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-2">Meta Title</h3>
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-blue-400">{article.meta_title || '—'}</p>
                <p className="text-xs text-gray-600 mt-1">
                  {(article.meta_title || '').length}/60 characters
                </p>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-2">Meta Description</h3>
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-gray-300">{article.meta_description || '—'}</p>
                <p className="text-xs text-gray-600 mt-1">
                  {(article.meta_description || '').length}/155 characters
                </p>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-2">Excerpt</h3>
              <p className="text-sm text-gray-400">{article.excerpt || '—'}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-2">Language</h3>
              <p className="text-sm text-gray-300">{article.language.toUpperCase()}</p>
            </div>
          </div>
        )}

        {activeTab === 'schema' && (
          <div className="space-y-6">
            {article.schema_article && (
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">Article Schema</h3>
                <pre className="text-xs text-gray-300 bg-gray-800 rounded-lg p-4 overflow-x-auto">
                  {formatJson(article.schema_article)}
                </pre>
              </div>
            )}
            {article.schema_faq && (
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">FAQ Schema</h3>
                <pre className="text-xs text-gray-300 bg-gray-800 rounded-lg p-4 overflow-x-auto">
                  {formatJson(article.schema_faq)}
                </pre>
              </div>
            )}
            {!article.schema_article && !article.schema_faq && (
              <p className="text-gray-500">No schema markup generated yet. Run the optimization phase.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreCard({ label, value, color }: { label: string; value: string; color?: string }) {
  const colorClass = color === 'green' ? 'text-green-400' : color === 'yellow' ? 'text-yellow-400' : 'text-brand-400';
  return (
    <div className="card text-center py-4">
      <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function markdownToSimpleHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-brand-400 hover:underline">$1</a>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hlo])/gm, '<p>')
    .replace(/$/gm, '</p>')
    .replace(/<p><\/p>/g, '')
    .replace(/<p>(<h[123]>)/g, '$1')
    .replace(/(<\/h[123]>)<\/p>/g, '$1');
}

function formatJson(json: string): string {
  try {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return json;
  }
}
