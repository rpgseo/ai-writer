import type { Env } from '../types/env';
import { CacheService } from '../utils/cache';
import { hashText } from '../utils/hash';
import { CACHE_TTL } from '@ai-writer/shared';
import type { NlpEntity, NlpCategory } from '@ai-writer/shared';

/**
 * Google Cloud Natural Language API integration.
 * Uses x-goog-api-key header (not URL param) to avoid key leakage in logs.
 * https://cloud.google.com/natural-language/docs/reference/rest
 */
export class NlpService {
  private baseUrl = 'https://language.googleapis.com/v2';
  private cache: CacheService;

  constructor(private env: Env) {
    this.cache = new CacheService(env.CACHE);
  }

  /**
   * Extract entities from text content.
   */
  async analyzeEntities(text: string, language?: string): Promise<NlpEntity[]> {
    const truncated = text.slice(0, 5000);
    const cacheKey = `nlp:entities:${await hashText(truncated)}`;

    return this.cache.getOrFetch(cacheKey, CACHE_TTL.NLP_ENTITIES, async () => {
      const res = await this.apiCall('/documents:analyzeEntities', {
        document: {
          type: 'PLAIN_TEXT',
          content: truncated,
          ...(language && { languageCode: language }),
        },
        encodingType: 'UTF8',
      });

      const data = res as GoogleEntitiesResponse;

      return (data.entities || []).map((e) => ({
        name: e.name,
        type: e.type,
        salience: e.salience,
        mentions: e.mentions?.length ?? 1,
      }));
    });
  }

  /**
   * Classify content into categories.
   */
  async classifyContent(text: string, language?: string): Promise<NlpCategory[]> {
    const truncated = text.slice(0, 5000);
    const cacheKey = `nlp:classify:${await hashText(truncated)}`;

    return this.cache.getOrFetch(cacheKey, CACHE_TTL.NLP_ENTITIES, async () => {
      try {
        const data = await this.apiCall('/documents:classifyText', {
          document: {
            type: 'PLAIN_TEXT',
            content: truncated,
            ...(language && { languageCode: language }),
          },
        }) as GoogleClassifyResponse;

        return (data.categories || []).map((cat) => ({
          name: cat.name,
          confidence: cat.confidence,
        }));
      } catch {
        // Classification may fail for short texts
        return [];
      }
    });
  }

  /**
   * Analyze sentiment of text.
   */
  async analyzeSentiment(text: string, language?: string): Promise<SentimentResult> {
    const truncated = text.slice(0, 5000);

    const data = await this.apiCall('/documents:analyzeSentiment', {
      document: {
        type: 'PLAIN_TEXT',
        content: truncated,
        ...(language && { languageCode: language }),
      },
      encodingType: 'UTF8',
    }) as GoogleSentimentResponse;

    return {
      score: data.documentSentiment.score,
      magnitude: data.documentSentiment.magnitude,
    };
  }

  /**
   * Full analysis: entities + classification + sentiment in parallel.
   */
  async fullAnalysis(text: string, language?: string): Promise<FullNlpAnalysis> {
    const [entities, categories, sentiment] = await Promise.all([
      this.analyzeEntities(text, language),
      this.classifyContent(text, language),
      this.analyzeSentiment(text, language),
    ]);

    return { entities, categories, sentiment };
  }

  /**
   * Make an API call with timeout and proper auth headers.
   */
  private async apiCall(endpoint: string, body: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.env.GOOGLE_NLP_API_KEY,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`Google NLP failed: ${res.status} ${error}`);
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

interface GoogleEntitiesResponse {
  entities: Array<{
    name: string;
    type: string;
    salience: number;
    mentions: Array<{ text: { content: string } }>;
  }>;
}

interface GoogleClassifyResponse {
  categories: Array<{
    name: string;
    confidence: number;
  }>;
}

interface GoogleSentimentResponse {
  documentSentiment: {
    score: number;
    magnitude: number;
  };
}

export interface SentimentResult {
  score: number;
  magnitude: number;
}

export interface FullNlpAnalysis {
  entities: NlpEntity[];
  categories: NlpCategory[];
  sentiment: SentimentResult;
}
