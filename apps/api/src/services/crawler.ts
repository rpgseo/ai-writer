import type { Env } from '../types/env';
import { CacheService } from '../utils/cache';
import { CACHE_TTL } from '@ai-writer/shared';

/**
 * Firecrawl integration for website crawling.
 * https://docs.firecrawl.dev/api-reference
 */
export class CrawlerService {
  private baseUrl = 'https://api.firecrawl.dev/v1';
  private cache: CacheService;

  constructor(private env: Env) {
    this.cache = new CacheService(env.CACHE);
  }

  /**
   * Map all URLs of a website (fast, no content extraction).
   */
  async mapSite(domain: string): Promise<SiteMapResult> {
    const cacheKey = `crawl:map:${domain}`;

    return this.cache.getOrFetch(cacheKey, CACHE_TTL.SITE_CRAWL, async () => {
      const res = await fetch(`${this.baseUrl}/map`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          url: `https://${domain}`,
          limit: 500,
        }),
      });

      if (!res.ok) {
        throw new Error(`Firecrawl map failed: ${res.status} ${await res.text()}`);
      }

      return await res.json() as SiteMapResult;
    });
  }

  /**
   * Crawl the site extracting content from each page.
   * Returns a crawl job ID for async processing.
   */
  async crawlSite(domain: string, limit = 100): Promise<CrawlJobResult> {
    const res = await fetch(`${this.baseUrl}/crawl`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        url: `https://${domain}`,
        limit,
        scrapeOptions: {
          formats: ['markdown', 'html'],
          includeTags: ['title', 'meta', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'article'],
          onlyMainContent: true,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Firecrawl crawl failed: ${res.status} ${await res.text()}`);
    }

    return await res.json() as CrawlJobResult;
  }

  /**
   * Check crawl job status and get results.
   */
  async getCrawlStatus(jobId: string): Promise<CrawlStatusResult> {
    const res = await fetch(`${this.baseUrl}/crawl/${jobId}`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      throw new Error(`Firecrawl status failed: ${res.status}`);
    }

    return await res.json() as CrawlStatusResult;
  }

  /**
   * Scrape a single page.
   */
  async scrapePage(url: string): Promise<ScrapeResult> {
    const cacheKey = `crawl:page:${encodeURIComponent(url)}`;

    return this.cache.getOrFetch(cacheKey, CACHE_TTL.SITE_CRAWL, async () => {
      const res = await fetch(`${this.baseUrl}/scrape`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          url,
          formats: ['markdown', 'html'],
          onlyMainContent: true,
        }),
      });

      if (!res.ok) {
        throw new Error(`Firecrawl scrape failed: ${res.status}`);
      }

      return await res.json() as ScrapeResult;
    });
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.env.FIRECRAWL_API_KEY}`,
    };
  }
}

// ============================================================
// Types
// ============================================================

export interface SiteMapResult {
  success: boolean;
  links: string[];
}

export interface CrawlJobResult {
  success: boolean;
  id: string;
  url: string;
}

export interface CrawlStatusResult {
  status: 'scraping' | 'completed' | 'failed';
  total: number;
  completed: number;
  data: CrawlPageData[];
  next?: string;
}

export interface CrawlPageData {
  markdown: string;
  html: string;
  metadata: {
    title: string;
    description: string;
    sourceURL: string;
    ogTitle?: string;
    ogDescription?: string;
    language?: string;
  };
  linksOnPage: string[];
}

export interface ScrapeResult {
  success: boolean;
  data: CrawlPageData;
}
