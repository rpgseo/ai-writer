import type { Env } from '../types/env';
import { CacheService } from '../utils/cache';
import { CACHE_TTL } from '@ai-writer/shared';

/**
 * NeuronWriter API integration for content optimization and scoring.
 * IMPORTANT: NeuronWriter analyses are async. Do NOT poll inside a Worker request.
 * Instead, create the analysis, return the ID, and check status via separate endpoint.
 */
export class NeuronWriterService {
  private baseUrl = 'https://app.neuronwriter.com/api/v1';
  private cache: CacheService;

  constructor(private env: Env) {
    this.cache = new CacheService(env.CACHE);
  }

  /**
   * Create a new content analysis for a keyword.
   * Returns immediately with an analysis ID. The analysis runs async on NW side.
   */
  async createAnalysis(keyword: string, language: string, country: string): Promise<NwAnalysisJob> {
    const res = await this.apiCall('POST', '/content-editor', {
      keyword,
      language,
      country,
    });

    return res as NwAnalysisJob;
  }

  /**
   * Get analysis results. Returns status 'processing' if not ready.
   * Call this from a separate client-poll endpoint, NOT in a loop within a Worker.
   */
  async getAnalysis(analysisId: string): Promise<NwAnalysisResult> {
    const cacheKey = `nw:analysis:${analysisId}`;

    const cached = await this.cache.get<NwAnalysisResult>(cacheKey);
    if (cached && cached.status === 'completed') return cached;

    const result = await this.apiCall('GET', `/content-editor/${analysisId}`) as NwAnalysisResult;

    if (result.status === 'completed') {
      await this.cache.set(cacheKey, result, CACHE_TTL.NW_ANALYSIS);
    }

    return result;
  }

  /**
   * Analyze content against a keyword analysis to get optimization score.
   * Requires a completed analysis.
   */
  async analyzeContent(analysisId: string, content: string): Promise<NwContentScore> {
    return await this.apiCall('POST', `/content-editor/${analysisId}/analyze`, {
      content,
    }) as NwContentScore;
  }

  /**
   * Check if an analysis is ready and score content if so.
   * Returns null score if analysis is still processing.
   * This is designed to be called from a Workflow step, NOT a polling loop.
   */
  async scoreIfReady(
    analysisId: string,
    content: string
  ): Promise<NwOptimizationResult> {
    const analysis = await this.getAnalysis(analysisId);

    if (analysis.status !== 'completed') {
      return {
        analysis_id: analysisId,
        status: 'processing',
        score: null,
        nlp_terms: [],
        missing_terms: [],
        recommendations: [],
      };
    }

    const score = await this.analyzeContent(analysisId, content);

    return {
      analysis_id: analysisId,
      status: 'completed',
      score: score.score,
      nlp_terms: analysis.nlp_terms || [],
      missing_terms: score.missing_terms || [],
      recommendations: score.recommendations || [],
    };
  }

  /**
   * Make an API call with timeout and proper error handling.
   */
  private async apiCall(method: string, endpoint: string, body?: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': this.env.NEURONWRITER_API_KEY,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        throw new Error(`NeuronWriter ${method} ${endpoint} failed: ${res.status} ${errorText}`);
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

export interface NwAnalysisJob {
  id: string;
  status: string;
}

export interface NwAnalysisResult {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  keyword: string;
  nlp_terms?: NwNlpTerm[];
  competitors?: NwCompetitor[];
  content_score?: number;
  recommendations?: string[];
}

export interface NwNlpTerm {
  term: string;
  count_recommended: number;
  importance: 'high' | 'medium' | 'low';
}

export interface NwCompetitor {
  url: string;
  score: number;
  title: string;
}

export interface NwContentScore {
  score: number;
  missing_terms: NwMissingTerm[];
  present_terms: NwPresentTerm[];
  recommendations: string[];
}

export interface NwMissingTerm {
  term: string;
  importance: 'high' | 'medium' | 'low';
  count_recommended: number;
}

export interface NwPresentTerm {
  term: string;
  count: number;
  count_recommended: number;
}

export interface NwOptimizationResult {
  analysis_id: string;
  status: 'processing' | 'completed';
  score: number | null;
  nlp_terms: NwNlpTerm[];
  missing_terms: NwMissingTerm[];
  recommendations: string[];
}
