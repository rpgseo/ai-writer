import type { Env } from '../types/env';
import type { SitePage, LinkEdge, Article, ContentBrief } from '@ai-writer/shared';
import { generateId } from '../utils/id';

/**
 * Internal Linking Engine.
 * Analyzes site structure and suggests optimal internal links
 * based on keyword targets, entity overlap, and topical relevance.
 */
export class LinkEngine {
  constructor(private env: Env) {}

  /**
   * Analyze existing internal links for a project.
   */
  async analyzeExistingLinks(projectId: string): Promise<LinkAnalysis> {
    const pages = await this.env.DB.prepare(
      'SELECT id, url, title, entities, internal_links_out, internal_links_in_count FROM site_pages WHERE project_id = ?'
    ).bind(projectId).all<SitePage>();

    const allPages = pages.results || [];
    const linkCount = allPages.reduce((sum, p) => {
      const links = this.parseJsonField<string[]>(p.internal_links_out as unknown as string, []);
      return sum + links.length;
    }, 0);

    // Find orphan pages (no incoming links)
    const orphans = allPages.filter((p) => (p.internal_links_in_count ?? 0) === 0);

    // Find hub pages (many outgoing links)
    const hubs = allPages
      .map((p) => ({
        url: p.url,
        outCount: this.parseJsonField<string[]>(p.internal_links_out as unknown as string, []).length,
      }))
      .filter((p) => p.outCount >= 5)
      .sort((a, b) => b.outCount - a.outCount);

    return {
      totalPages: allPages.length,
      totalLinks: linkCount,
      orphanPages: orphans.map((p) => p.url),
      hubPages: hubs.map((h) => h.url),
      avgLinksPerPage: allPages.length > 0 ? Math.round(linkCount / allPages.length) : 0,
    };
  }

  /**
   * Generate internal link suggestions for a new article based on:
   * 1. Keyword-target matching with existing pages
   * 2. Entity overlap between pages
   * 3. Topical relevance from cluster membership
   * 4. Orphan page rescue (prioritize linking to isolated pages)
   */
  async suggestLinksForArticle(params: SuggestLinksParams): Promise<LinkSuggestion[]> {
    const { projectId, brief, articleUrl } = params;

    // Get all existing pages
    const pagesResult = await this.env.DB.prepare(
      'SELECT id, url, title, entities, internal_links_in_count, content_text FROM site_pages WHERE project_id = ?'
    ).bind(projectId).all<SitePage>();

    const pages = pagesResult.results || [];
    if (pages.length === 0) return [];

    // Get existing articles too
    const articlesResult = await this.env.DB.prepare(
      'SELECT id, title, slug, content_markdown FROM articles WHERE project_id = ? AND status != ?'
    ).bind(projectId, 'draft').all<Article>();

    const articles = articlesResult.results || [];

    const suggestions: LinkSuggestion[] = [];

    // 1. Links FROM our article TO existing pages (contextual links)
    for (const page of pages) {
      const score = this.calculateRelevanceScore(brief, page);
      if (score >= 0.3) {
        const anchor = this.suggestAnchorText(brief, page);
        suggestions.push({
          direction: 'from',
          sourceUrl: articleUrl || `/articles/${brief.target_keyword.replace(/\s+/g, '-')}`,
          targetUrl: page.url,
          suggestedAnchor: anchor,
          relevanceScore: score,
          reason: this.explainLink(brief, page, 'from'),
          isOrphanRescue: (page.internal_links_in_count ?? 0) === 0,
        });
      }
    }

    // 2. Links FROM existing pages TO our article (backlinks from own site)
    for (const page of pages) {
      const entities = this.parseJsonField<Array<{ name: string }>>(page.entities as unknown as string, []);
      const entityNames = entities.map((e) => e.name.toLowerCase());
      const targetKw = brief.target_keyword.toLowerCase();

      // Check if existing page content could naturally link to our new article
      const pageText = (page.content_text || '').toLowerCase();
      const hasRelevantContext = brief.secondary_keywords.some((kw) =>
        pageText.includes(kw.toLowerCase())
      ) || pageText.includes(targetKw);

      if (hasRelevantContext) {
        suggestions.push({
          direction: 'to',
          sourceUrl: page.url,
          targetUrl: articleUrl || `/articles/${brief.target_keyword.replace(/\s+/g, '-')}`,
          suggestedAnchor: brief.target_keyword,
          relevanceScore: 0.6,
          reason: `Page "${page.title}" mentions related keywords and can link to this article`,
          isOrphanRescue: false,
        });
      }
    }

    // 3. Cross-link with other articles in the same cluster
    for (const article of articles) {
      if (article.brief_id === brief.id) continue;
      const contentLower = (article.content_markdown || '').toLowerCase();
      const hasOverlap = brief.secondary_keywords.some((kw) => contentLower.includes(kw.toLowerCase()));

      if (hasOverlap) {
        suggestions.push({
          direction: 'from',
          sourceUrl: articleUrl || brief.target_keyword,
          targetUrl: `/articles/${article.slug}`,
          suggestedAnchor: article.title,
          relevanceScore: 0.5,
          reason: `Related article with keyword overlap`,
          isOrphanRescue: false,
        });
      }
    }

    // Sort: orphan rescue first, then by relevance
    suggestions.sort((a, b) => {
      if (a.isOrphanRescue && !b.isOrphanRescue) return -1;
      if (!a.isOrphanRescue && b.isOrphanRescue) return 1;
      return b.relevanceScore - a.relevanceScore;
    });

    // Limit suggestions to avoid over-linking
    return suggestions.slice(0, 15);
  }

  /**
   * Save link suggestions to the link_graph table.
   */
  async saveSuggestions(projectId: string, suggestions: LinkSuggestion[]): Promise<LinkEdge[]> {
    const edges: LinkEdge[] = [];

    for (const suggestion of suggestions) {
      const edge: LinkEdge = {
        id: generateId(),
        project_id: projectId,
        source_url: suggestion.sourceUrl,
        target_url: suggestion.targetUrl,
        anchor_text: suggestion.suggestedAnchor,
        link_type: 'suggested',
        keyword_target: suggestion.suggestedAnchor,
        context_snippet: suggestion.reason,
        priority: Math.round(suggestion.relevanceScore * 100),
        status: 'pending',
        created_at: new Date().toISOString(),
      };

      await this.env.DB.prepare(
        `INSERT INTO link_graph (id, project_id, source_url, target_url, anchor_text, link_type, keyword_target, context_snippet, priority, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        edge.id, edge.project_id, edge.source_url, edge.target_url,
        edge.anchor_text, edge.link_type, edge.keyword_target,
        edge.context_snippet, edge.priority, edge.status
      ).run();

      edges.push(edge);
    }

    return edges;
  }

  /**
   * Build a link graph summary for visualization.
   */
  async buildLinkGraph(projectId: string): Promise<LinkGraphData> {
    const linksResult = await this.env.DB.prepare(
      'SELECT * FROM link_graph WHERE project_id = ? ORDER BY priority DESC'
    ).bind(projectId).all<LinkEdge>();

    const links = linksResult.results || [];

    // Build node map
    const nodeMap = new Map<string, LinkNode>();
    for (const link of links) {
      if (!nodeMap.has(link.source_url)) {
        nodeMap.set(link.source_url, { url: link.source_url, inDegree: 0, outDegree: 0 });
      }
      if (!nodeMap.has(link.target_url)) {
        nodeMap.set(link.target_url, { url: link.target_url, inDegree: 0, outDegree: 0 });
      }
      nodeMap.get(link.source_url)!.outDegree++;
      nodeMap.get(link.target_url)!.inDegree++;
    }

    const nodes = [...nodeMap.values()];
    const orphans = nodes.filter((n) => n.inDegree === 0);

    return {
      nodes,
      edges: links.map((l) => ({
        source: l.source_url,
        target: l.target_url,
        anchor: l.anchor_text || '',
        type: l.link_type,
        status: l.status,
        priority: l.priority,
      })),
      stats: {
        totalNodes: nodes.length,
        totalEdges: links.length,
        orphanPages: orphans.length,
        avgInDegree: nodes.length > 0 ? Math.round(nodes.reduce((s, n) => s + n.inDegree, 0) / nodes.length * 10) / 10 : 0,
        avgOutDegree: nodes.length > 0 ? Math.round(nodes.reduce((s, n) => s + n.outDegree, 0) / nodes.length * 10) / 10 : 0,
      },
    };
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  private calculateRelevanceScore(brief: ContentBrief, page: SitePage): number {
    let score = 0;
    const pageUrl = page.url.toLowerCase();
    const pageTitle = (page.title || '').toLowerCase();
    const targetKw = brief.target_keyword.toLowerCase();

    // URL/title contains target keyword words
    const kwWords = targetKw.split(/\s+/).filter((w) => w.length > 3);
    const urlMatches = kwWords.filter((w) => pageUrl.includes(w) || pageTitle.includes(w));
    score += (urlMatches.length / Math.max(kwWords.length, 1)) * 0.3;

    // Entity overlap
    const pageEntities = this.parseJsonField<Array<{ name: string }>>(page.entities as unknown as string, []);
    const pageEntityNames = new Set(pageEntities.map((e) => e.name.toLowerCase()));
    const briefEntities = brief.required_entities.map((e) => e.toLowerCase());
    const entityOverlap = briefEntities.filter((e) => pageEntityNames.has(e)).length;
    score += (entityOverlap / Math.max(briefEntities.length, 1)) * 0.4;

    // Secondary keyword presence
    const secondaryMatches = brief.secondary_keywords.filter((kw) =>
      pageTitle.includes(kw.toLowerCase()) || pageUrl.includes(kw.toLowerCase().replace(/\s+/g, '-'))
    );
    score += (secondaryMatches.length / Math.max(brief.secondary_keywords.length, 1)) * 0.3;

    return Math.min(score, 1);
  }

  private suggestAnchorText(brief: ContentBrief, page: SitePage): string {
    // Prefer page title as anchor, or a relevant keyword
    const pageTitle = page.title || page.url;
    // If page title is too long, use a relevant secondary keyword
    if (pageTitle.length > 60) {
      const relevantKw = brief.secondary_keywords.find((kw) =>
        pageTitle.toLowerCase().includes(kw.toLowerCase())
      );
      return relevantKw || pageTitle.slice(0, 50);
    }
    return pageTitle;
  }

  private explainLink(brief: ContentBrief, page: SitePage, direction: 'from' | 'to'): string {
    const entities = this.parseJsonField<Array<{ name: string }>>(page.entities as unknown as string, []);
    const sharedEntities = brief.required_entities.filter((e) =>
      entities.some((pe) => pe.name.toLowerCase() === e.toLowerCase())
    );

    const isOrphan = (page.internal_links_in_count ?? 0) === 0;
    const parts: string[] = [];

    if (isOrphan) parts.push('Orphan page rescue');
    if (sharedEntities.length > 0) parts.push(`Shared entities: ${sharedEntities.slice(0, 3).join(', ')}`);
    if (direction === 'from') parts.push(`Contextual link to "${page.title || page.url}"`);
    else parts.push(`Backlink from "${page.title || page.url}"`);

    return parts.join('. ');
  }

  private parseJsonField<T>(value: string | null | undefined, fallback: T): T {
    if (!value || typeof value !== 'string') return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
}

// ============================================================
// Types
// ============================================================

export interface LinkAnalysis {
  totalPages: number;
  totalLinks: number;
  orphanPages: string[];
  hubPages: string[];
  avgLinksPerPage: number;
}

export interface SuggestLinksParams {
  projectId: string;
  brief: ContentBrief;
  articleUrl?: string;
}

export interface LinkSuggestion {
  direction: 'from' | 'to';
  sourceUrl: string;
  targetUrl: string;
  suggestedAnchor: string;
  relevanceScore: number;
  reason: string;
  isOrphanRescue: boolean;
}

export interface LinkGraphData {
  nodes: LinkNode[];
  edges: Array<{
    source: string;
    target: string;
    anchor: string;
    type: string;
    status: string;
    priority: number;
  }>;
  stats: {
    totalNodes: number;
    totalEdges: number;
    orphanPages: number;
    avgInDegree: number;
    avgOutDegree: number;
  };
}

export interface LinkNode {
  url: string;
  inDegree: number;
  outDegree: number;
}
