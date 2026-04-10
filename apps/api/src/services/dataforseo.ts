import type { Env } from '../types/env';
import { CacheService } from '../utils/cache';
import { hashKeyList } from '../utils/hash';
import { CACHE_TTL } from '@ai-writer/shared';

/**
 * DataForSEO API integration for keyword research and SERP features.
 * https://docs.dataforseo.com/
 */
export class DataForSeoService {
  private baseUrl = 'https://api.dataforseo.com/v3';
  private cache: CacheService;

  constructor(private env: Env) {
    this.cache = new CacheService(env.CACHE);
  }

  /**
   * Get keyword metrics: volume, difficulty, CPC, competition.
   */
  async getKeywordMetrics(keywords: string[], location = 2724, language = 'es'): Promise<KeywordMetric[]> {
    const cacheKey = `dfs:metrics:${await hashKeyList(keywords)}:${location}`;

    return this.cache.getOrFetch(cacheKey, CACHE_TTL.KEYWORD_METRICS, async () => {
      const res = await this.post('/keywords_data/google_ads/search_volume/live', [{
        keywords,
        location_code: location,
        language_code: language,
      }]);

      const results: KeywordMetric[] = [];
      const tasks = res.tasks || [];

      for (const task of tasks) {
        for (const item of task.result || []) {
          results.push({
            keyword: item.keyword,
            volume: item.search_volume ?? 0,
            cpc: item.cpc ?? 0,
            competition: item.competition ?? 0,
            competition_level: item.competition_level ?? 'LOW',
          });
        }
      }

      return results;
    });
  }

  /**
   * Get keyword suggestions / related keywords.
   */
  async getKeywordSuggestions(
    seed: string,
    location = 2724,
    language = 'es',
    limit = 50
  ): Promise<KeywordSuggestion[]> {
    const cacheKey = `dfs:suggestions:${await hashKeyList([seed])}:${location}:${limit}`;

    return this.cache.getOrFetch(cacheKey, CACHE_TTL.KEYWORD_METRICS, async () => {
      const res = await this.post('/keywords_data/google_ads/keywords_for_keywords/live', [{
        keywords: [seed],
        location_code: location,
        language_code: language,
        limit,
        sort_by: 'search_volume',
      }]);

      const results: KeywordSuggestion[] = [];
      const tasks = res.tasks || [];

      for (const task of tasks) {
        for (const item of task.result || []) {
          results.push({
            keyword: item.keyword,
            volume: item.search_volume ?? 0,
            cpc: item.cpc ?? 0,
            competition: item.competition ?? 0,
            competition_level: item.competition_level ?? 'LOW',
          });
        }
      }

      return results;
    });
  }

  /**
   * Get SERP results with detailed features.
   */
  async getSerpResults(keyword: string, location = 2724, language = 'es'): Promise<SerpFeatures> {
    const cacheKey = `dfs:serp:${await hashKeyList([keyword])}:${location}`;

    return this.cache.getOrFetch(cacheKey, CACHE_TTL.SERP_RESULTS, async () => {
      const res = await this.post('/serp/google/organic/live/regular', [{
        keyword,
        location_code: location,
        language_code: language,
        depth: 10,
      }]);

      const task = res.tasks?.[0];
      const result = task?.result?.[0];

      return {
        keyword,
        items_count: result?.items_count ?? 0,
        se_results_count: result?.se_results_count ?? 0,
        featured_snippet: result?.item_types?.includes('featured_snippet') ?? false,
        knowledge_graph: result?.item_types?.includes('knowledge_graph') ?? false,
        people_also_ask: result?.item_types?.includes('people_also_ask') ?? false,
        local_pack: result?.item_types?.includes('local_pack') ?? false,
        items: (result?.items || []).filter((i: any) => i.type === 'organic').map((i: any) => ({
          position: i.rank_absolute,
          url: i.url,
          title: i.title,
          description: i.description,
          domain: i.domain,
        })),
      };
    });
  }

  private async post(endpoint: string, data: unknown[]): Promise<any> {
    const auth = btoa(`${this.env.DATAFORSEO_LOGIN}:${this.env.DATAFORSEO_PASSWORD}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`,
        },
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`DataForSEO failed: ${res.status} ${await res.text()}`);
      }

      return await res.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ============================================================
// Types
// ============================================================

export interface KeywordMetric {
  keyword: string;
  volume: number;
  cpc: number;
  competition: number;
  competition_level: string;
}

export interface KeywordSuggestion extends KeywordMetric {}

export interface SerpFeatures {
  keyword: string;
  items_count: number;
  se_results_count: number;
  featured_snippet: boolean;
  knowledge_graph: boolean;
  people_also_ask: boolean;
  local_pack: boolean;
  items: Array<{
    position: number;
    url: string;
    title: string;
    description: string;
    domain: string;
  }>;
}
