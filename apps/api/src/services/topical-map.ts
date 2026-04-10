import type { Env } from '../types/env';
import type {
  ClusterKeyword,
  FunnelStage,
  SearchIntent,
  TopicCluster,
  NlpEntity,
} from '@ai-writer/shared';
import { FunnelClassifier } from './funnel-classifier';
import { DataForSeoService } from './dataforseo';
import { NlpService } from './nlp';
import { generateId } from '../utils/id';

/**
 * Topical Map Engine.
 * Groups keywords into semantic clusters, identifies pillar topics,
 * detects entity gaps, and assigns funnel stages.
 */
export class TopicalMapEngine {
  private classifier: FunnelClassifier;
  private dataforseo: DataForSeoService;
  private nlp: NlpService;

  constructor(private env: Env) {
    this.classifier = new FunnelClassifier();
    this.dataforseo = new DataForSeoService(env);
    this.nlp = new NlpService(env);
  }

  /**
   * Build a topical map from a set of seed keywords + GSC keywords.
   */
  async buildTopicalMap(params: BuildMapParams): Promise<TopicalMapResult> {
    const { projectId, keywords, siteEntities, language } = params;

    // 1. Enrich keywords with volume + difficulty if not already present
    const enriched = await this.enrichKeywords(keywords, language);

    // 2. Classify funnel stage and format for each keyword
    const classified = enriched.map((kw) => {
      const classification = this.classifier.classifyBatch([{ keyword: kw.keyword, intent: kw.intent }])[0];
      return { ...kw, ...classification };
    });

    // 3. Cluster keywords by semantic similarity (simple approach: shared stems/entities)
    const clusters = this.clusterKeywords(classified, siteEntities);

    // 4. Identify pillar topics (highest-volume keyword per cluster)
    const pillars: string[] = [];
    for (const cluster of clusters) {
      const pillar = cluster.keywords.reduce((a, b) => a.volume > b.volume ? a : b);
      cluster.pillarKeyword = pillar.keyword;
      pillars.push(pillar.keyword);
    }

    // 5. Detect entity gaps per cluster
    for (const cluster of clusters) {
      cluster.entityGaps = this.detectEntityGaps(cluster, siteEntities);
    }

    // 6. Score priority for each cluster
    for (const cluster of clusters) {
      cluster.priorityScore = this.scorePriority(cluster);
    }

    // Sort clusters by priority
    clusters.sort((a, b) => b.priorityScore - a.priorityScore);

    // Build topic cluster records
    const topicClusters: Omit<TopicCluster, 'created_at'>[] = clusters.map((c) => ({
      id: generateId(),
      topical_map_id: '', // Set when map is saved
      project_id: projectId,
      cluster_name: c.name,
      pillar_keyword: c.pillarKeyword,
      keywords: c.keywords,
      funnel_stage: c.funnelStage,
      entity_gaps: c.entityGaps,
      priority_score: c.priorityScore,
      status: 'pending' as const,
      assigned_brief_id: null,
    }));

    return {
      pillarTopics: pillars,
      clusters: topicClusters,
      totalKeywords: classified.length,
      coverageScore: this.calculateCoverage(clusters, siteEntities),
    };
  }

  /**
   * Enrich keywords with search volume and keyword difficulty.
   */
  private async enrichKeywords(keywords: KeywordInput[], language: string): Promise<EnrichedKeyword[]> {
    const needsEnrichment = keywords.filter((kw) => kw.volume === undefined);
    const alreadyEnriched = keywords.filter((kw) => kw.volume !== undefined);

    let enrichedFromApi: EnrichedKeyword[] = [];

    if (needsEnrichment.length > 0) {
      try {
        const keywordStrings = needsEnrichment.map((kw) => kw.keyword);
        // Location code: 2724=Spain, 2840=US, 2250=France, 2276=Germany, 2076=Brazil
        const locationMap: Record<string, number> = { es: 2724, en: 2840, fr: 2250, de: 2276, pt: 2076, it: 2380 };
        const locationCode = locationMap[language] ?? 2840;
        const metrics = await this.dataforseo.getKeywordMetrics(keywordStrings, locationCode, language);

        enrichedFromApi = needsEnrichment.map((kw) => {
          const metric = metrics.find((m) => m.keyword.toLowerCase() === kw.keyword.toLowerCase());
          return {
            keyword: kw.keyword,
            volume: metric?.volume ?? 0,
            kd: Math.round((metric?.competition ?? 0.5) * 100), // Convert 0-1 competition to 0-100 difficulty
            intent: kw.intent || this.inferIntent(kw.keyword),
          };
        });
      } catch {
        // Fallback: assign default values
        enrichedFromApi = needsEnrichment.map((kw) => ({
          keyword: kw.keyword,
          volume: 0,
          kd: 50,
          intent: kw.intent || this.inferIntent(kw.keyword),
        }));
      }
    }

    const alreadyMapped: EnrichedKeyword[] = alreadyEnriched.map((kw) => ({
      keyword: kw.keyword,
      volume: kw.volume ?? 0,
      kd: kw.kd ?? 50,
      intent: kw.intent || this.inferIntent(kw.keyword),
    }));

    return [...alreadyMapped, ...enrichedFromApi];
  }

  /**
   * Cluster keywords using n-gram/stem overlap and entity similarity.
   */
  private clusterKeywords(
    keywords: Array<EnrichedKeyword & { funnel_stage: FunnelStage; content_format: string }>,
    siteEntities: NlpEntity[]
  ): ClusterData[] {
    const clusters: ClusterData[] = [];
    const assigned = new Set<string>();

    // Sort by volume descending — high-volume keywords seed clusters
    const sorted = [...keywords].sort((a, b) => b.volume - a.volume);

    for (const kw of sorted) {
      if (assigned.has(kw.keyword)) continue;

      // Find similar keywords not yet assigned
      const similar = sorted.filter(
        (other) =>
          !assigned.has(other.keyword) &&
          other.keyword !== kw.keyword &&
          this.keywordSimilarity(kw.keyword, other.keyword) >= 0.3
      );

      const clusterKws: ClusterKeyword[] = [
        { keyword: kw.keyword, volume: kw.volume, kd: kw.kd, intent: kw.intent },
        ...similar.map((s) => ({
          keyword: s.keyword,
          volume: s.volume,
          kd: s.kd,
          intent: s.intent,
        })),
      ];

      assigned.add(kw.keyword);
      for (const s of similar) assigned.add(s.keyword);

      // Determine dominant funnel stage for the cluster
      const stages = [kw, ...similar].map((k) => k.funnel_stage);
      const funnelStage = this.dominantStage(stages);

      clusters.push({
        name: this.generateClusterName(kw.keyword, similar.map((s) => s.keyword)),
        pillarKeyword: kw.keyword,
        keywords: clusterKws,
        funnelStage,
        entityGaps: [],
        priorityScore: 0,
      });
    }

    return clusters;
  }

  /**
   * Calculate similarity between two keywords based on word overlap.
   */
  private keywordSimilarity(a: string, b: string): number {
    const stopwords = new Set(['de', 'en', 'la', 'el', 'los', 'las', 'un', 'una', 'para', 'por', 'con',
      'the', 'a', 'an', 'in', 'on', 'for', 'of', 'to', 'and', 'with', 'is', 'are']);

    const wordsA = a.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !stopwords.has(w));
    const wordsB = b.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !stopwords.has(w));

    if (wordsA.length === 0 || wordsB.length === 0) return 0;

    // Check stem overlap (simple: first 4 chars)
    const stemsA = new Set(wordsA.map((w) => w.slice(0, 4)));
    const stemsB = new Set(wordsB.map((w) => w.slice(0, 4)));

    let overlap = 0;
    for (const s of stemsA) {
      if (stemsB.has(s)) overlap++;
    }

    return overlap / Math.max(stemsA.size, stemsB.size);
  }

  /**
   * Detect entity gaps: entities that competitors cover but our site doesn't.
   */
  private detectEntityGaps(cluster: ClusterData, siteEntities: NlpEntity[]): string[] {
    // For each keyword in the cluster, the required entities would come from
    // SERP analysis + NLP analysis of top-ranking pages.
    // For now, we identify entities from the cluster keywords themselves
    // that aren't covered by existing site entities.
    const siteEntityNames = new Set(siteEntities.map((e) => e.name.toLowerCase()));
    const keywordTokens = new Set<string>();

    for (const kw of cluster.keywords) {
      const tokens = kw.keyword.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
      for (const t of tokens) keywordTokens.add(t);
    }

    // Entities from keywords that the site doesn't cover
    return [...keywordTokens].filter((t) => !siteEntityNames.has(t)).slice(0, 10);
  }

  /**
   * Score cluster priority based on volume, difficulty, funnel stage, and entity gaps.
   */
  private scorePriority(cluster: ClusterData): number {
    const totalVolume = cluster.keywords.reduce((sum, kw) => sum + kw.volume, 0);
    const avgKd = cluster.keywords.reduce((sum, kw) => sum + kw.kd, 0) / cluster.keywords.length;
    const funnelWeight = this.classifier.getFunnelWeight(cluster.funnelStage);

    // Volume score (0-40): log scale
    const volumeScore = Math.min(Math.log10(totalVolume + 1) * 10, 40);

    // Difficulty score (0-20): lower difficulty = higher score
    const difficultyScore = Math.max(0, 20 - (avgKd / 5));

    // Funnel weight (0-20)
    const funnelScore = funnelWeight * 20;

    // Entity gap score (0-10): more gaps = higher opportunity
    const gapScore = Math.min(cluster.entityGaps.length * 2, 10);

    // Cluster size bonus (0-10)
    const sizeScore = Math.min(cluster.keywords.length * 2, 10);

    return Math.round(volumeScore + difficultyScore + funnelScore + gapScore + sizeScore);
  }

  /**
   * Calculate how well the topical map covers the site's entity landscape.
   */
  private calculateCoverage(clusters: ClusterData[], siteEntities: NlpEntity[]): number {
    if (siteEntities.length === 0) return 0;

    const coveredEntities = new Set<string>();
    for (const cluster of clusters) {
      for (const kw of cluster.keywords) {
        const tokens = kw.keyword.toLowerCase().split(/\s+/);
        for (const t of tokens) coveredEntities.add(t);
      }
    }

    const siteEntityNames = siteEntities.map((e) => e.name.toLowerCase());
    const covered = siteEntityNames.filter((e) => coveredEntities.has(e));
    return Math.round((covered.length / siteEntityNames.length) * 100);
  }

  private dominantStage(stages: FunnelStage[]): FunnelStage {
    const counts: Record<FunnelStage, number> = { tofu: 0, mofu: 0, bofu: 0 };
    for (const s of stages) counts[s]++;
    return (Object.entries(counts) as Array<[FunnelStage, number]>)
      .sort((a, b) => b[1] - a[1])[0][0];
  }

  private generateClusterName(pillar: string, siblings: string[]): string {
    // Use the pillar keyword as the cluster name, title-cased
    return pillar
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  private inferIntent(keyword: string): SearchIntent {
    const lower = keyword.toLowerCase();
    if (/comprar|buy|precio|price|contratar|hire/i.test(lower)) return 'transactional';
    if (/mejor|best|vs|comparativa|review|alternativa/i.test(lower)) return 'commercial';
    if (/login|acceder|entrar|sign in/i.test(lower)) return 'navigational';
    return 'informational';
  }
}

// ============================================================
// Types
// ============================================================

export interface BuildMapParams {
  projectId: string;
  keywords: KeywordInput[];
  siteEntities: NlpEntity[];
  language: string;
}

export interface KeywordInput {
  keyword: string;
  volume?: number;
  kd?: number;
  intent?: SearchIntent;
}

interface EnrichedKeyword {
  keyword: string;
  volume: number;
  kd: number;
  intent: SearchIntent;
}

interface ClusterData {
  name: string;
  pillarKeyword: string;
  keywords: ClusterKeyword[];
  funnelStage: FunnelStage;
  entityGaps: string[];
  priorityScore: number;
}

export interface TopicalMapResult {
  pillarTopics: string[];
  clusters: Omit<TopicCluster, 'created_at'>[];
  totalKeywords: number;
  coverageScore: number;
}
