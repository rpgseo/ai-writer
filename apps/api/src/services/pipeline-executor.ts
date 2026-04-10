import type { Env } from '../types/env';
import type { PipelinePhase } from '@ai-writer/shared';
import { CrawlerService } from './crawler';
import { NlpService } from './nlp';
import { GscService } from './gsc';
import { SerperService } from './serper';
import { DataForSeoService } from './dataforseo';
import { TopicalMapEngine } from './topical-map';
import { ContentGenerator } from './content-gen';
import { NeuronWriterService } from './neuronwriter';
import { EeatScorer } from './eeat-scorer';
import { LinkEngine } from './link-engine';
import { FunnelClassifier } from './funnel-classifier';
import { generateId } from '../utils/id';

/**
 * Pipeline Executor — runs each phase of the content pipeline sequentially.
 * Designed to be called from Cloudflare Workflows (each phase = one workflow step)
 * or from direct API calls for individual phase execution.
 */
export class PipelineExecutor {
  constructor(private env: Env) {}

  /**
   * Execute a single pipeline phase.
   */
  async executePhase(projectId: string, runId: string, phase: PipelinePhase): Promise<PhaseResult> {
    // Mark phase as running
    await this.updatePhaseStatus(runId, phase, 'running');

    try {
      let stats: Record<string, number> = {};

      switch (phase) {
        case 'discovery':
          stats = await this.runDiscovery(projectId);
          break;
        case 'gsc_intelligence':
          stats = await this.runGscIntelligence(projectId);
          break;
        case 'topical_map':
          stats = await this.runTopicalMap(projectId);
          break;
        case 'content_planning':
          stats = await this.runContentPlanning(projectId);
          break;
        case 'content_generation':
          stats = await this.runContentGeneration(projectId);
          break;
        case 'optimization':
          stats = await this.runOptimization(projectId);
          break;
        case 'internal_linking':
          stats = await this.runInternalLinking(projectId);
          break;
        case 'export':
          stats = await this.runExport(projectId);
          break;
      }

      await this.updatePhaseStatus(runId, phase, 'completed', null, stats);
      return { phase, status: 'completed', stats };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.updatePhaseStatus(runId, phase, 'failed', message);
      return { phase, status: 'failed', error: message, stats: {} };
    }
  }

  // ============================================================
  // Phase 1: Website Discovery
  // ============================================================

  private async runDiscovery(projectId: string): Promise<Record<string, number>> {
    const project = await this.getProject(projectId);
    const crawler = new CrawlerService(this.env);
    const nlp = new NlpService(this.env);

    // 1. Crawl the site with Firecrawl
    const siteMap = await crawler.mapSite(project.domain as string);
    const urls = (siteMap.links || []).slice(0, 50); // Limit to 50 pages for initial discovery

    let pagesProcessed = 0;
    let entitiesFound = 0;

    // 2. Scrape and analyze each page
    for (const url of urls) {
      try {
        const scraped = await crawler.scrapePage(url);
        if (!scraped?.data) continue;

        const pageData = scraped.data;
        const text = pageData.markdown || '';
        const title = pageData.metadata?.title || null;
        const description = pageData.metadata?.description || null;

        // 3. Analyze entities with Google NLP
        const entities = text ? await nlp.analyzeEntities(text) : [];
        const categories = text ? await nlp.classifyContent(text) : [];

        // Extract internal links from the page
        const domainStr = project.domain as string;
        const internalLinks = (pageData.linksOnPage || []).filter(
          (link) => link.includes(domainStr)
        );

        // 4. Save to DB
        const pageId = generateId();
        await this.env.DB.prepare(
          `INSERT OR REPLACE INTO site_pages
           (id, project_id, url, title, meta_description, h1, headings, content_text,
            entities, categories, word_count, internal_links_out, last_crawled)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        ).bind(
          pageId, projectId, url,
          title, description,
          null, // h1 extracted from content if needed
          JSON.stringify([]),
          text.slice(0, 50000),
          JSON.stringify(entities),
          JSON.stringify(categories),
          text.split(/\s+/).filter(Boolean).length,
          JSON.stringify(internalLinks),
        ).run();

        pagesProcessed++;
        entitiesFound += entities.length;
      } catch {
        // Skip failed pages, continue with others
      }
    }

    // 5. Update project theme summary
    const allEntities = await this.env.DB.prepare(
      'SELECT entities FROM site_pages WHERE project_id = ?'
    ).bind(projectId).all();

    const entityMap = new Map<string, number>();
    for (const row of allEntities.results) {
      try {
        const ents = JSON.parse(row.entities as string) as Array<{ name: string; salience: number }>;
        for (const e of ents) {
          entityMap.set(e.name, (entityMap.get(e.name) || 0) + e.salience);
        }
      } catch { /* skip */ }
    }

    const topEntities = [...entityMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name]) => name);

    await this.env.DB.prepare(
      `UPDATE projects SET core_entities = ?, theme_summary = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(JSON.stringify(topEntities), `Site about: ${topEntities.slice(0, 5).join(', ')}`, projectId).run();

    return { pages_crawled: pagesProcessed, entities_found: entitiesFound, urls_discovered: urls.length };
  }

  // ============================================================
  // Phase 2: GSC Intelligence
  // ============================================================

  private async runGscIntelligence(projectId: string): Promise<Record<string, number>> {
    const project = await this.getProject(projectId);
    if (!project.gsc_connected || !project.gsc_property) {
      return { skipped: 1, reason_no_gsc: 1 };
    }

    const gsc = new GscService(this.env);
    const rows = await gsc.getAllKeywords(project.gsc_property as string);

    let keywordsSaved = 0;
    let quickWins = 0;

    for (const row of rows) {
      const keyword = row.keys[0]; // First dimension = query
      const pageUrl = row.keys[1] || null; // Second dimension = page

      const isQuickWin = row.position >= 4 && row.position <= 20 && row.impressions >= 100;
      if (isQuickWin) quickWins++;

      const id = generateId();
      await this.env.DB.prepare(
        `INSERT OR REPLACE INTO gsc_keywords
         (id, project_id, keyword, page_url, impressions, clicks, ctr, position,
          search_intent, date_start, date_end, trend, position_change, is_quick_win)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, projectId, keyword, pageUrl,
        row.impressions, row.clicks, row.ctr, row.position,
        'informational', // Will be reclassified in topical_map phase
        '', '',
        'stable', 0, isQuickWin ? 1 : 0
      ).run();

      keywordsSaved++;
    }

    return { keywords_imported: keywordsSaved, quick_wins_found: quickWins };
  }

  // ============================================================
  // Phase 3: Topical Map
  // ============================================================

  private async runTopicalMap(projectId: string): Promise<Record<string, number>> {
    const project = await this.getProject(projectId);
    const engine = new TopicalMapEngine(this.env);

    // Gather keywords from GSC + existing pages
    const gscKeywords = await this.env.DB.prepare(
      'SELECT keyword, impressions AS volume, position FROM gsc_keywords WHERE project_id = ?'
    ).bind(projectId).all();

    const siteEntities = await this.getSiteEntities(projectId);

    const keywords = gscKeywords.results.map((row) => ({
      keyword: row.keyword as string,
      volume: row.volume as number,
    }));

    if (keywords.length === 0) {
      return { skipped: 1, reason_no_keywords: 1 };
    }

    const lang = (project.language as string) || 'es';

    const result = await engine.buildTopicalMap({
      projectId,
      keywords,
      siteEntities,
      language: lang,
    });

    // Save topical map
    const mapId = generateId();
    await this.env.DB.prepare(
      `INSERT INTO topical_maps (id, project_id, name, pillar_topics, total_clusters, total_keywords, coverage_score, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      mapId, projectId,
      `Topical Map - ${new Date().toISOString().split('T')[0]}`,
      JSON.stringify(result.pillarTopics),
      result.clusters.length,
      result.totalKeywords,
      result.coverageScore,
      'active'
    ).run();

    // Save clusters
    for (const cluster of result.clusters) {
      await this.env.DB.prepare(
        `INSERT INTO topic_clusters
         (id, topical_map_id, project_id, cluster_name, pillar_keyword, keywords, funnel_stage, entity_gaps, priority_score, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        cluster.id, mapId, projectId,
        cluster.cluster_name, cluster.pillar_keyword,
        JSON.stringify(cluster.keywords), cluster.funnel_stage,
        JSON.stringify(cluster.entity_gaps), cluster.priority_score,
        cluster.status
      ).run();
    }

    return {
      clusters_created: result.clusters.length,
      pillar_topics: result.pillarTopics.length,
      total_keywords: result.totalKeywords,
      coverage_score: result.coverageScore,
    };
  }

  // ============================================================
  // Phase 4: Content Planning
  // ============================================================

  private async runContentPlanning(projectId: string): Promise<Record<string, number>> {
    const project = await this.getProject(projectId);
    const serper = new SerperService(this.env);
    const classifier = new FunnelClassifier();
    const lang = (project.language as string) || 'es';

    // Get pending clusters ordered by priority
    const clusters = await this.env.DB.prepare(
      `SELECT * FROM topic_clusters WHERE project_id = ? AND status = 'pending' ORDER BY priority_score DESC LIMIT 10`
    ).bind(projectId).all();

    let briefsCreated = 0;

    for (const cluster of clusters.results) {
      const keywords = JSON.parse(cluster.keywords as string) as Array<{ keyword: string; volume: number; kd: number; intent: string }>;
      const pillarKeyword = cluster.pillar_keyword as string;

      // SERP analysis
      const serpAnalysis = await serper.analyzeSERP(pillarKeyword, lang === 'es' ? 'es' : 'us', lang as string);

      // Determine format and funnel
      const format = classifier.detectFormat(pillarKeyword);
      const funnelStage = cluster.funnel_stage as 'tofu' | 'mofu' | 'bofu';

      // Create content brief
      const briefId = generateId();
      await this.env.DB.prepare(
        `INSERT INTO content_briefs
         (id, project_id, topical_map_id, cluster_id, target_keyword, secondary_keywords,
          search_intent, funnel_stage, content_format, suggested_title, outline, serp_data,
          paa_questions, required_entities, suggested_word_count, internal_links_plan,
          priority_score, language, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        briefId, projectId,
        cluster.topical_map_id, cluster.id,
        pillarKeyword,
        JSON.stringify(keywords.slice(1).map((k) => k.keyword)),
        keywords[0]?.intent || 'informational',
        funnelStage, format,
        null, null,
        JSON.stringify({
          top_results: serpAnalysis.topResults,
          avg_word_count: serpAnalysis.avgSnippetLength * 15, // Estimate from snippets
          common_headings: [],
          featured_snippet: serpAnalysis.featuredSnippet,
          paa: serpAnalysis.paa,
          related_searches: serpAnalysis.relatedSearches,
        }),
        JSON.stringify(serpAnalysis.paa),
        JSON.stringify(JSON.parse(cluster.entity_gaps as string || '[]')),
        1500, // Default word count
        JSON.stringify([]),
        cluster.priority_score,
        lang, 'pending'
      ).run();

      // Mark cluster as in_progress
      await this.env.DB.prepare(
        `UPDATE topic_clusters SET status = 'in_progress', assigned_brief_id = ? WHERE id = ?`
      ).bind(briefId, cluster.id).run();

      briefsCreated++;
    }

    return { briefs_created: briefsCreated };
  }

  // ============================================================
  // Phase 5: Content Generation
  // ============================================================

  private async runContentGeneration(projectId: string): Promise<Record<string, number>> {
    const project = await this.getProject(projectId);
    const contentGen = new ContentGenerator(this.env);
    const projectLang = (project.language as string) || 'es';

    // Get pending briefs
    const briefs = await this.env.DB.prepare(
      `SELECT * FROM content_briefs WHERE project_id = ? AND status = 'pending' ORDER BY priority_score DESC LIMIT 5`
    ).bind(projectId).all();

    let articlesGenerated = 0;
    let totalWords = 0;

    for (const briefRow of briefs.results) {
      const brief = this.deserializeBrief(briefRow);

      // Generate outline first
      const outline = await contentGen.generateOutline(brief, projectLang);
      brief.outline = outline;

      // Update brief with outline
      await this.env.DB.prepare(
        `UPDATE content_briefs SET outline = ?, status = 'in_progress' WHERE id = ?`
      ).bind(JSON.stringify(outline), brief.id).run();

      // Generate article
      const content = await contentGen.generateArticle(brief, projectLang);

      // Generate slug
      const slug = this.slugify(content.title);

      // Save article
      const articleId = generateId();
      await this.env.DB.prepare(
        `INSERT INTO articles
         (id, brief_id, project_id, title, slug, meta_title, meta_description,
          content_markdown, excerpt, language, word_count, status, optimization_iterations)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        articleId, brief.id, projectId,
        content.title, slug,
        content.metaTitle, content.metaDescription,
        content.markdown, content.excerpt,
        projectLang,
        content.wordCount, 'draft', 0
      ).run();

      // Mark brief as completed
      await this.env.DB.prepare(
        `UPDATE content_briefs SET status = 'completed' WHERE id = ?`
      ).bind(brief.id).run();

      articlesGenerated++;
      totalWords += content.wordCount;
    }

    return { articles_generated: articlesGenerated, total_words: totalWords };
  }

  // ============================================================
  // Phase 6: Content Optimization
  // ============================================================

  private async runOptimization(projectId: string): Promise<Record<string, number>> {
    const project = await this.getProject(projectId);
    const eeatScorer = new EeatScorer();
    const contentGen = new ContentGenerator(this.env);

    // Get draft articles
    const articles = await this.env.DB.prepare(
      `SELECT a.*, b.required_entities, b.target_keyword, b.suggested_word_count
       FROM articles a
       LEFT JOIN content_briefs b ON a.brief_id = b.id
       WHERE a.project_id = ? AND a.status = 'draft'
       LIMIT 5`
    ).bind(projectId).all();

    let optimized = 0;

    for (const article of articles.results) {
      const content = article.content_markdown as string;
      if (!content) continue;

      const requiredEntities = this.safeJsonParse<string[]>(article.required_entities as string, []);

      // Score E-E-A-T
      const eeatScore = eeatScorer.score(content, {
        requiredEntities,
        targetWordCount: (article.suggested_word_count as number) || 1500,
      });

      // NeuronWriter analysis (if available — async pattern)
      // For now just use E-E-A-T score

      // Update article with scores
      await this.env.DB.prepare(
        `UPDATE articles SET eeat_score = ?, status = 'optimized', optimization_iterations = optimization_iterations + 1, updated_at = datetime('now')
         WHERE id = ?`
      ).bind(eeatScore.total, article.id).run();

      optimized++;
    }

    return { articles_optimized: optimized };
  }

  // ============================================================
  // Phase 7: Internal Linking
  // ============================================================

  private async runInternalLinking(projectId: string): Promise<Record<string, number>> {
    const linkEngine = new LinkEngine(this.env);

    // Get articles that need links
    const articles = await this.env.DB.prepare(
      `SELECT a.*, b.target_keyword, b.secondary_keywords, b.required_entities
       FROM articles a
       LEFT JOIN content_briefs b ON a.brief_id = b.id
       WHERE a.project_id = ? AND a.status IN ('draft', 'optimized')
       LIMIT 10`
    ).bind(projectId).all();

    let linksGenerated = 0;

    for (const article of articles.results) {
      const brief = {
        id: article.brief_id as string,
        target_keyword: article.target_keyword as string || article.title as string,
        secondary_keywords: this.safeJsonParse<string[]>(article.secondary_keywords as string, []),
        required_entities: this.safeJsonParse<string[]>(article.required_entities as string, []),
      } as any;

      const suggestions = await linkEngine.suggestLinksForArticle({
        projectId,
        brief,
        articleUrl: `/articles/${article.slug}`,
      });

      const saved = await linkEngine.saveSuggestions(projectId, suggestions);
      linksGenerated += saved.length;
    }

    return { links_suggested: linksGenerated };
  }

  // ============================================================
  // Phase 8: Export
  // ============================================================

  private async runExport(projectId: string): Promise<Record<string, number>> {
    // Export optimized articles to R2 storage
    const articles = await this.env.DB.prepare(
      `SELECT * FROM articles WHERE project_id = ? AND status = 'optimized'`
    ).bind(projectId).all();

    let exported = 0;

    for (const article of articles.results) {
      const content = article.content_markdown as string;
      if (!content) continue;

      const r2Key = `articles/${projectId}/${article.slug}.md`;
      await this.env.STORAGE.put(r2Key, content, {
        customMetadata: {
          title: article.title as string,
          slug: article.slug as string,
          language: article.language as string,
        },
      });

      await this.env.DB.prepare(
        `UPDATE articles SET r2_key = ?, status = 'published', updated_at = datetime('now') WHERE id = ?`
      ).bind(r2Key, article.id).run();

      exported++;
    }

    return { articles_exported: exported };
  }

  // ============================================================
  // Helpers
  // ============================================================

  private async getProject(id: string) {
    const project = await this.env.DB.prepare(
      'SELECT * FROM projects WHERE id = ?'
    ).bind(id).first();
    if (!project) throw new Error(`Project ${id} not found`);
    return project as Record<string, unknown>;
  }

  private async getSiteEntities(projectId: string) {
    const pages = await this.env.DB.prepare(
      'SELECT entities FROM site_pages WHERE project_id = ?'
    ).bind(projectId).all();

    const entities: Array<{ name: string; type: string; salience: number; mentions: number }> = [];
    for (const row of pages.results) {
      try {
        const ents = JSON.parse(row.entities as string);
        entities.push(...ents);
      } catch { /* skip */ }
    }
    return entities;
  }

  private async updatePhaseStatus(
    runId: string,
    phase: string,
    status: string,
    error?: string | null,
    stats?: Record<string, number>
  ) {
    const run = await this.env.DB.prepare(
      'SELECT phases FROM pipeline_runs WHERE id = ?'
    ).bind(runId).first();

    if (!run) return;

    const phases = this.safeJsonParse<Array<Record<string, unknown>>>(run.phases as string, []);
    const phaseEntry = phases.find((p) => p.phase === phase);

    if (phaseEntry) {
      phaseEntry.status = status;
      if (status === 'running') phaseEntry.started_at = new Date().toISOString();
      if (status === 'completed' || status === 'failed') phaseEntry.completed_at = new Date().toISOString();
      if (error) phaseEntry.error = error;
      if (stats) phaseEntry.stats = stats;
    }

    await this.env.DB.prepare(
      `UPDATE pipeline_runs SET phases = ?, current_phase = ?, completed_at = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(
      JSON.stringify(phases),
      phase,
      status === 'failed' || (phase === 'export' && status === 'completed') ? new Date().toISOString() : null,
      runId
    ).run();
  }

  private deserializeBrief(row: Record<string, unknown>) {
    return {
      id: row.id as string,
      project_id: row.project_id as string,
      topical_map_id: row.topical_map_id as string | null,
      cluster_id: row.cluster_id as string | null,
      target_keyword: row.target_keyword as string,
      secondary_keywords: this.safeJsonParse<string[]>(row.secondary_keywords as string, []),
      search_intent: row.search_intent as any,
      funnel_stage: row.funnel_stage as any,
      content_format: row.content_format as any,
      suggested_title: row.suggested_title as string | null,
      outline: this.safeJsonParse<any[] | null>(row.outline as string, null),
      serp_data: this.safeJsonParse<any>(row.serp_data as string, null),
      paa_questions: this.safeJsonParse<string[]>(row.paa_questions as string, []),
      required_entities: this.safeJsonParse<string[]>(row.required_entities as string, []),
      suggested_word_count: row.suggested_word_count as number,
      eeat_requirements: this.safeJsonParse<any>(row.eeat_requirements as string, null),
      internal_links_plan: this.safeJsonParse<any[]>(row.internal_links_plan as string, []),
      priority_score: row.priority_score as number,
      language: row.language as string,
      status: row.status as any,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100) || `article-${generateId().slice(0, 8)}`;
  }

  private safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
    if (!json) return fallback;
    try {
      return JSON.parse(json) as T;
    } catch {
      return fallback;
    }
  }
}

// ============================================================
// Types
// ============================================================

export interface PhaseResult {
  phase: PipelinePhase;
  status: 'completed' | 'failed';
  error?: string;
  stats: Record<string, number>;
}
