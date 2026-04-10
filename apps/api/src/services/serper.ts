import type { Env } from '../types/env';
import { CacheService } from '../utils/cache';
import { CACHE_TTL } from '@ai-writer/shared';

/**
 * Serper.dev API integration for real-time SERP data.
 * https://serper.dev/docs
 */
export class SerperService {
  private baseUrl = 'https://google.serper.dev';
  private cache: CacheService;

  constructor(private env: Env) {
    this.cache = new CacheService(env.CACHE);
  }

  /**
   * Search Google for a keyword and get SERP results.
   */
  async search(query: string, options: SerperSearchOptions = {}): Promise<SerperSearchResult> {
    const { gl = 'es', hl = 'es', num = 10 } = options;
    const cacheKey = `serper:search:${query}:${gl}:${hl}`;

    return this.cache.getOrFetch(cacheKey, CACHE_TTL.SERP_RESULTS, async () => {
      const res = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ q: query, gl, hl, num }),
      });

      if (!res.ok) {
        throw new Error(`Serper search failed: ${res.status}`);
      }

      return await res.json() as SerperSearchResult;
    });
  }

  /**
   * Extract People Also Ask questions for a keyword.
   */
  async getPaa(query: string, gl = 'es', hl = 'es'): Promise<string[]> {
    const result = await this.search(query, { gl, hl });
    return (result.peopleAlsoAsk || []).map((item) => item.question);
  }

  /**
   * Extract Related Searches for a keyword.
   */
  async getRelatedSearches(query: string, gl = 'es', hl = 'es'): Promise<string[]> {
    const result = await this.search(query, { gl, hl });
    return (result.relatedSearches || []).map((item) => item.query);
  }

  /**
   * Get full SERP analysis for content brief generation.
   */
  async analyzeSERP(query: string, gl = 'es', hl = 'es'): Promise<SerpAnalysis> {
    const result = await this.search(query, { gl, hl, num: 10 });

    const organicResults = result.organic || [];
    const wordCounts = organicResults
      .map((r) => r.snippet?.split(/\s+/).length ?? 0)
      .filter((c) => c > 0);

    return {
      keyword: query,
      topResults: organicResults.map((r, i) => ({
        position: i + 1,
        url: r.link,
        title: r.title,
        description: r.snippet || '',
        word_count: 0, // Would need scraping for real word count
      })),
      paa: (result.peopleAlsoAsk || []).map((item) => item.question),
      relatedSearches: (result.relatedSearches || []).map((item) => item.query),
      featuredSnippet: result.answerBox?.snippet || result.answerBox?.answer || null,
      avgSnippetLength: wordCounts.length
        ? Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length)
        : 0,
      knowledgeGraph: result.knowledgeGraph || null,
    };
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-API-KEY': this.env.SERPER_API_KEY,
    };
  }
}

// ============================================================
// Types
// ============================================================

export interface SerperSearchOptions {
  gl?: string; // country code
  hl?: string; // language code
  num?: number;
}

export interface SerperSearchResult {
  organic: Array<{
    title: string;
    link: string;
    snippet: string;
    position: number;
  }>;
  peopleAlsoAsk?: Array<{
    question: string;
    snippet: string;
    link: string;
  }>;
  relatedSearches?: Array<{
    query: string;
  }>;
  answerBox?: {
    snippet?: string;
    answer?: string;
    title?: string;
  };
  knowledgeGraph?: Record<string, unknown>;
}

export interface SerpAnalysis {
  keyword: string;
  topResults: Array<{
    position: number;
    url: string;
    title: string;
    description: string;
    word_count: number;
  }>;
  paa: string[];
  relatedSearches: string[];
  featuredSnippet: string | null;
  avgSnippetLength: number;
  knowledgeGraph: Record<string, unknown> | null;
}
