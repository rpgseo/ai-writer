import type { Env } from '../types/env';
import { CacheService } from '../utils/cache';
import { hashText } from '../utils/hash';

/**
 * DeepSeek API integration for deep research capabilities.
 * Uses DeepSeek R1 (reasoning model) as a research layer before content generation.
 *
 * Flow: DeepSeek researches → produces research document → Claude uses it to generate content.
 *
 * Use cases:
 * 1. Topic research: comprehensive data gathering before article generation
 * 2. Competitor gap analysis: what top pages cover that we don't
 * 3. Entity expansion: discover related entities and concepts
 * 4. Fact verification: validate claims in generated content
 * 5. Source discovery: find authoritative sources to cite
 */
export class DeepSeekService {
  private baseUrl = 'https://api.deepseek.com/v1';
  private cache: CacheService;

  constructor(private env: Env) {
    this.cache = new CacheService(env.CACHE);
  }

  /**
   * Deep research on a topic before content generation.
   * Returns a structured research document with facts, data, sources, and insights.
   */
  async researchTopic(params: TopicResearchParams): Promise<ResearchDocument> {
    const cacheKey = `ds:research:${await hashText(params.keyword + params.language)}`;
    const cached = await this.cache.get<ResearchDocument>(cacheKey);
    if (cached) return cached;

    const systemPrompt = `You are a deep research analyst. Conduct thorough research and return a structured research document.
Language: ${params.language === 'es' ? 'Spanish' : params.language === 'en' ? 'English' : params.language}

Your research must include:
1. KEY FACTS: Verified facts, statistics, and data points about the topic
2. EXPERT INSIGHTS: Expert opinions, methodologies, and best practices
3. SOURCES: Authoritative sources that can be cited (with URLs if possible)
4. RELATED ENTITIES: All relevant entities, concepts, and subtopics
5. COMMON QUESTIONS: Questions people ask about this topic
6. MARKET DATA: Pricing, market size, trends (if applicable)
7. CONTENT GAPS: What most articles about this topic miss

Return in this JSON format:
{
  "summary": "2-3 sentence overview",
  "key_facts": [{"fact": "string", "source": "string", "confidence": "high|medium|low"}],
  "statistics": [{"stat": "string", "value": "string", "source": "string", "year": "string"}],
  "expert_insights": [{"insight": "string", "attribution": "string"}],
  "sources": [{"title": "string", "url": "string", "authority": "high|medium|low", "relevance": "string"}],
  "related_entities": [{"entity": "string", "type": "string", "relevance": "high|medium|low"}],
  "common_questions": ["string"],
  "content_gaps": ["string"],
  "recommended_angle": "string"
}`;

    const userPrompt = this.buildResearchPrompt(params);
    const response = await this.callDeepSeek(systemPrompt, userPrompt, 'deepseek-reasoner', 4096);
    const document = this.parseResearchResponse(response, params.keyword);

    // Cache for 7 days
    await this.cache.set(cacheKey, document, 604800);
    return document;
  }

  /**
   * Analyze competitors for a keyword.
   * Returns what top-ranking pages cover and content gaps to exploit.
   */
  async analyzeCompetitors(params: CompetitorAnalysisParams): Promise<CompetitorAnalysis> {
    const systemPrompt = `You are an SEO competitive analysis expert. Analyze the competitive landscape for a keyword.
Language: ${params.language === 'es' ? 'Spanish' : 'English'}

Based on the SERP data and competitor content provided, identify:
1. Common themes all top pages cover
2. Unique angles only some pages cover
3. Gaps that NO top page covers well
4. Content structure patterns (headings, format, length)
5. E-E-A-T signals used by top pages
6. Recommended differentiation strategy

Return structured JSON.`;

    const userPrompt = `Keyword: "${params.keyword}"
Search intent: ${params.intent}
Funnel stage: ${params.funnelStage}

Top SERP results:
${params.serpResults.map((r, i) => `${i + 1}. ${r.title} — ${r.url}\n   ${r.description}`).join('\n\n')}

${params.competitorContent ? `\nCompetitor content samples:\n${params.competitorContent}` : ''}

Analyze the competitive landscape and identify opportunities.`;

    const response = await this.callDeepSeek(systemPrompt, userPrompt, 'deepseek-reasoner', 3000);
    return this.parseCompetitorAnalysis(response, params.keyword);
  }

  /**
   * Expand and validate entities for a topic.
   * Finds all relevant entities that should be covered for comprehensive content.
   */
  async expandEntities(keyword: string, existingEntities: string[], language: string): Promise<EntityExpansion> {
    const lang = language === 'es' ? 'Spanish' : 'English';

    const systemPrompt = `You are an NLP entity analysis expert. For the given topic, identify ALL relevant entities that comprehensive content should cover. Return JSON.`;

    const userPrompt = `Topic: "${keyword}"
Language: ${lang}
Already known entities: ${existingEntities.join(', ')}

Find additional entities in these categories:
1. Core concepts (must-have)
2. Related technologies/tools
3. People/organizations
4. Metrics/data points
5. Processes/methodologies
6. Alternatives/competitors

Return JSON:
{
  "core_entities": [{"name": "string", "type": "string", "importance": "critical|important|nice-to-have"}],
  "missing_from_existing": ["entities that should be in the list but aren't"],
  "entity_relationships": [{"from": "string", "to": "string", "relationship": "string"}],
  "suggested_coverage": "how to structure content around these entities"
}`;

    const response = await this.callDeepSeek(systemPrompt, userPrompt, 'deepseek-chat', 2000);
    return this.parseEntityExpansion(response);
  }

  /**
   * Fact-check and validate generated content.
   */
  async factCheck(content: string, keyword: string, language: string): Promise<FactCheckResult> {
    const lang = language === 'es' ? 'Spanish' : 'English';

    const systemPrompt = `You are a fact-checking expert. Review the article for accuracy, unsupported claims, and potential misinformation. Be thorough but fair. Return JSON.`;

    const userPrompt = `Review this article about "${keyword}" (${lang}):

${content.slice(0, 8000)}

Check for:
1. Factual accuracy of claims and statistics
2. Unsupported or exaggerated claims
3. Missing nuance or context
4. Outdated information
5. Potential bias

Return JSON:
{
  "overall_accuracy": "high|medium|low",
  "verified_claims": [{"claim": "string", "status": "verified|unverified|incorrect", "note": "string"}],
  "issues": [{"type": "factual|outdated|bias|unsupported", "text": "the problematic text", "suggestion": "correction or improvement"}],
  "missing_context": ["important context that should be added"],
  "suggested_sources": [{"claim": "string", "suggested_source": "string"}],
  "score": 0-100
}`;

    const response = await this.callDeepSeek(systemPrompt, userPrompt, 'deepseek-reasoner', 3000);
    return this.parseFactCheck(response);
  }

  // ============================================================
  // Private Methods
  // ============================================================

  private async callDeepSeek(
    system: string,
    user: string,
    model: 'deepseek-reasoner' | 'deepseek-chat',
    maxTokens: number
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min for deep research

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: model === 'deepseek-reasoner' ? 0 : 0.3,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        throw new Error(`DeepSeek API error: ${res.status} ${errorText}`);
      }

      const data = await res.json() as DeepSeekResponse;
      return data.choices?.[0]?.message?.content ?? '';
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildResearchPrompt(params: TopicResearchParams): string {
    let prompt = `Conduct deep research on: "${params.keyword}"`;

    if (params.secondaryKeywords?.length) {
      prompt += `\nRelated keywords to also research: ${params.secondaryKeywords.join(', ')}`;
    }

    if (params.searchIntent) {
      prompt += `\nSearch intent: ${params.searchIntent}`;
    }

    if (params.funnelStage) {
      prompt += `\nFunnel stage: ${params.funnelStage} — focus on ${
        params.funnelStage === 'tofu' ? 'educational and awareness content' :
        params.funnelStage === 'mofu' ? 'comparison and evaluation data' :
        'pricing, features, and decision-making data'
      }`;
    }

    if (params.existingEntities?.length) {
      prompt += `\nKnown entities to expand on: ${params.existingEntities.join(', ')}`;
    }

    prompt += '\n\nProvide comprehensive, factual research. Prioritize recent data and authoritative sources.';
    return prompt;
  }

  private parseResearchResponse(response: string, keyword: string): ResearchDocument {
    const parsed = this.parseJson<Partial<ResearchDocument>>(response);
    return {
      keyword,
      summary: parsed?.summary ?? '',
      key_facts: parsed?.key_facts ?? [],
      statistics: parsed?.statistics ?? [],
      expert_insights: parsed?.expert_insights ?? [],
      sources: parsed?.sources ?? [],
      related_entities: parsed?.related_entities ?? [],
      common_questions: parsed?.common_questions ?? [],
      content_gaps: parsed?.content_gaps ?? [],
      recommended_angle: parsed?.recommended_angle ?? '',
      researched_at: new Date().toISOString(),
    };
  }

  private parseCompetitorAnalysis(response: string, keyword: string): CompetitorAnalysis {
    const parsed = this.parseJson<Partial<CompetitorAnalysis>>(response);
    return {
      keyword,
      common_themes: parsed?.common_themes ?? [],
      unique_angles: parsed?.unique_angles ?? [],
      content_gaps: parsed?.content_gaps ?? [],
      structure_patterns: parsed?.structure_patterns ?? [],
      eeat_signals: parsed?.eeat_signals ?? [],
      differentiation_strategy: parsed?.differentiation_strategy ?? '',
    };
  }

  private parseEntityExpansion(response: string): EntityExpansion {
    const parsed = this.parseJson<Partial<EntityExpansion>>(response);
    return {
      core_entities: parsed?.core_entities ?? [],
      missing_from_existing: parsed?.missing_from_existing ?? [],
      entity_relationships: parsed?.entity_relationships ?? [],
      suggested_coverage: parsed?.suggested_coverage ?? '',
    };
  }

  private parseFactCheck(response: string): FactCheckResult {
    const parsed = this.parseJson<Partial<FactCheckResult>>(response);
    return {
      overall_accuracy: parsed?.overall_accuracy ?? 'medium',
      verified_claims: parsed?.verified_claims ?? [],
      issues: parsed?.issues ?? [],
      missing_context: parsed?.missing_context ?? [],
      suggested_sources: parsed?.suggested_sources ?? [],
      score: parsed?.score ?? 50,
    };
  }

  private parseJson<T>(text: string): T | null {
    // Try to extract JSON from code fences or raw response
    const fenced = text.match(/```(?:json)?\n?([\s\S]+?)```/);
    const raw = fenced ? fenced[1] : text;

    try {
      return JSON.parse(raw.trim()) as T;
    } catch {
      const jsonMatch = raw.match(/[{[][\s\S]*[}\]]/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]) as T;
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}

// ============================================================
// Types
// ============================================================

interface DeepSeekResponse {
  choices: Array<{
    message: {
      content: string;
      reasoning_content?: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface TopicResearchParams {
  keyword: string;
  language: string;
  secondaryKeywords?: string[];
  searchIntent?: string;
  funnelStage?: string;
  existingEntities?: string[];
}

export interface ResearchDocument {
  keyword: string;
  summary: string;
  key_facts: Array<{ fact: string; source: string; confidence: string }>;
  statistics: Array<{ stat: string; value: string; source: string; year: string }>;
  expert_insights: Array<{ insight: string; attribution: string }>;
  sources: Array<{ title: string; url: string; authority: string; relevance: string }>;
  related_entities: Array<{ entity: string; type: string; relevance: string }>;
  common_questions: string[];
  content_gaps: string[];
  recommended_angle: string;
  researched_at: string;
}

export interface CompetitorAnalysisParams {
  keyword: string;
  language: string;
  intent: string;
  funnelStage: string;
  serpResults: Array<{ title: string; url: string; description: string }>;
  competitorContent?: string;
}

export interface CompetitorAnalysis {
  keyword: string;
  common_themes: string[];
  unique_angles: string[];
  content_gaps: string[];
  structure_patterns: string[];
  eeat_signals: string[];
  differentiation_strategy: string;
}

export interface EntityExpansion {
  core_entities: Array<{ name: string; type: string; importance: string }>;
  missing_from_existing: string[];
  entity_relationships: Array<{ from: string; to: string; relationship: string }>;
  suggested_coverage: string;
}

export interface FactCheckResult {
  overall_accuracy: string;
  verified_claims: Array<{ claim: string; status: string; note: string }>;
  issues: Array<{ type: string; text: string; suggestion: string }>;
  missing_context: string[];
  suggested_sources: Array<{ claim: string; suggested_source: string }>;
  score: number;
}
