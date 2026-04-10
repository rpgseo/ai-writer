import type { Env } from '../types/env';
import type {
  ContentBrief,
  OutlineSection,
  ContentFormat,
  FunnelStage,
  EeatRequirements,
} from '@ai-writer/shared';

/**
 * Claude API integration for SEO-optimized content generation.
 * Uses the Messages API with structured prompts for E-E-A-T compliance.
 */
export class ContentGenerator {
  private baseUrl = 'https://api.anthropic.com/v1/messages';

  constructor(private env: Env) {}

  /**
   * Generate a full article from a content brief.
   */
  async generateArticle(brief: ContentBrief, projectLanguage: string): Promise<GeneratedContent> {
    const systemPrompt = this.buildSystemPrompt(projectLanguage);
    const userPrompt = this.buildArticlePrompt(brief);

    const response = await this.callClaude(systemPrompt, userPrompt, 4096);

    const markdown = this.extractMarkdown(response);
    const title = this.extractTitle(markdown) || brief.suggested_title || brief.target_keyword;
    const metaTitle = await this.generateMetaTitle(brief, title, projectLanguage);
    const metaDescription = await this.generateMetaDescription(brief, title, projectLanguage);
    const excerpt = this.generateExcerpt(markdown);

    return {
      title,
      markdown,
      metaTitle,
      metaDescription,
      excerpt,
      wordCount: this.countWords(markdown),
    };
  }

  /**
   * Generate an article outline from a content brief.
   */
  async generateOutline(brief: ContentBrief, projectLanguage: string): Promise<OutlineSection[]> {
    const lang = projectLanguage === 'es' ? 'Spanish' : projectLanguage === 'en' ? 'English' : projectLanguage;

    const systemPrompt = `You are an expert SEO content strategist. Generate article outlines in ${lang}. Return ONLY valid JSON array.`;

    const userPrompt = `Create a detailed article outline for the keyword "${brief.target_keyword}".

Content format: ${brief.content_format}
Funnel stage: ${brief.funnel_stage}
Search intent: ${brief.search_intent}
Secondary keywords to include: ${brief.secondary_keywords.join(', ')}
PAA questions to answer: ${brief.paa_questions.join(', ')}
Required entities: ${brief.required_entities.join(', ')}
Target word count: ${brief.suggested_word_count}

Return a JSON array of sections:
[{"heading": "string", "level": 2, "notes": "what to cover", "entities": ["entity1"], "subsections": [{"heading": "string", "level": 3, "notes": "string", "entities": []}]}]

Include:
- An engaging H1 title
- H2 sections covering the topic comprehensively
- H3 subsections for in-depth coverage
- FAQ section answering PAA questions
- Conclusion with actionable takeaway

Make sure every secondary keyword and entity appears in at least one section.`;

    const response = await this.callClaude(systemPrompt, userPrompt, 2048);
    return this.parseJsonResponse<OutlineSection[]>(response) || [];
  }

  /**
   * Optimize existing content based on NeuronWriter recommendations.
   */
  async optimizeContent(
    content: string,
    recommendations: Array<{ term: string; count_recommended: number; count_current: number }>,
    brief: ContentBrief,
    projectLanguage: string
  ): Promise<string> {
    const lang = projectLanguage === 'es' ? 'Spanish' : projectLanguage === 'en' ? 'English' : projectLanguage;

    const missingTerms = recommendations
      .filter((r) => r.count_current < r.count_recommended)
      .map((r) => `"${r.term}" (need ${r.count_recommended - r.count_current} more uses)`)
      .join('\n');

    if (!missingTerms) return content;

    const systemPrompt = `You are an SEO content optimizer. Enhance content in ${lang} by naturally incorporating missing NLP terms. Maintain the same structure, tone, and quality. Return ONLY the optimized markdown.`;

    const userPrompt = `Optimize this article for the keyword "${brief.target_keyword}".

Missing NLP terms to incorporate naturally:
${missingTerms}

Rules:
1. Do NOT stuff keywords — weave them naturally into existing paragraphs
2. You may add 1-2 new paragraphs if needed for context
3. Keep all existing headings and structure
4. Maintain E-E-A-T signals (experience, expertise, authority, trust)
5. Do NOT change the title or meta description
6. Keep all existing internal/external links

Current content:
${content}`;

    return this.extractMarkdown(await this.callClaude(systemPrompt, userPrompt, 4096));
  }

  /**
   * Generate schema markup for an article.
   */
  async generateSchema(
    article: { title: string; content: string; url?: string },
    format: ContentFormat,
    brief: ContentBrief
  ): Promise<SchemaOutput> {
    const schemas: SchemaOutput = {};

    // Article schema
    schemas.article = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.title,
      description: brief.paa_questions[0] || '',
      keywords: [brief.target_keyword, ...brief.secondary_keywords].join(', '),
      wordCount: article.content.split(/\s+/).filter(Boolean).length,
      inLanguage: brief.language,
    };

    // FAQ schema from PAA questions
    if (brief.paa_questions.length > 0) {
      const faqAnswers = this.extractFaqAnswers(article.content, brief.paa_questions);
      if (faqAnswers.length > 0) {
        schemas.faq = {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqAnswers.map((qa) => ({
            '@type': 'Question',
            name: qa.question,
            acceptedAnswer: {
              '@type': 'Answer',
              text: qa.answer,
            },
          })),
        };
      }
    }

    // HowTo schema for how-to format
    if (format === 'how-to') {
      const steps = this.extractHowToSteps(article.content);
      if (steps.length > 0) {
        schemas.howto = {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: article.title,
          step: steps.map((step, i) => ({
            '@type': 'HowToStep',
            position: i + 1,
            name: step.name,
            text: step.text,
          })),
        };
      }
    }

    return schemas;
  }

  // ============================================================
  // Private Methods
  // ============================================================

  private async callClaude(system: string, user: string, maxTokens: number): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s for content gen

    try {
      const res = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: user }],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        throw new Error(`Claude API error: ${res.status} ${errorText}`);
      }

      const data = await res.json() as ClaudeResponse;
      const textBlock = data.content.find((b) => b.type === 'text');
      return textBlock?.text || '';
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildSystemPrompt(language: string): string {
    const lang = language === 'es' ? 'Spanish' : language === 'en' ? 'English' : language;
    return `You are an expert SEO content writer specializing in creating high-quality, E-E-A-T compliant articles in ${lang}.

Your writing rules:
1. Write naturally — never keyword-stuff
2. Include first-person experience signals ("en mi experiencia", "hemos comprobado")
3. Cite sources and data where relevant
4. Use proper heading hierarchy (H2 → H3 → H4)
5. Include practical examples and actionable tips
6. Add a FAQ section answering common questions
7. Write update date indicators
8. Use markdown format with proper headings, lists, bold, and links
9. Target the specified word count
10. Naturally incorporate all required entities and keywords`;
  }

  private buildArticlePrompt(brief: ContentBrief): string {
    const formatInstructions = this.getFormatInstructions(brief.content_format, brief.funnel_stage);

    const outline = brief.outline
      ? `\nFollow this outline:\n${this.formatOutline(brief.outline)}`
      : '';

    const eeatInstructions = brief.eeat_requirements
      ? this.formatEeatRequirements(brief.eeat_requirements)
      : '';

    const linkPlan = brief.internal_links_plan.length > 0
      ? `\nInclude these internal links naturally:\n${brief.internal_links_plan.map((l) => `- [${l.suggested_anchor}](${l.url}) — ${l.reason}`).join('\n')}`
      : '';

    return `Write a comprehensive ${brief.content_format} article about "${brief.target_keyword}".

Search intent: ${brief.search_intent}
Funnel stage: ${brief.funnel_stage}
Target word count: ${brief.suggested_word_count}
Language: ${brief.language}

Secondary keywords to include naturally: ${brief.secondary_keywords.join(', ')}
Required NLP entities: ${brief.required_entities.join(', ')}
PAA questions to answer in a FAQ section: ${brief.paa_questions.join(' | ')}

${formatInstructions}
${outline}
${eeatInstructions}
${linkPlan}

Write the article in markdown format. Start with an H1 title. Do NOT include meta tags — just the article content.`;
  }

  private getFormatInstructions(format: ContentFormat, funnel: FunnelStage): string {
    const funnelContext: Record<FunnelStage, string> = {
      tofu: 'This is top-of-funnel educational content. Focus on explaining concepts clearly, providing value, and building awareness.',
      mofu: 'This is middle-of-funnel comparison content. Help the reader evaluate options with balanced, detailed analysis.',
      bofu: 'This is bottom-of-funnel conversion content. Be specific about pricing, features, and clear calls-to-action.',
    };

    const formatGuide: Record<ContentFormat, string> = {
      guide: 'Write as a comprehensive, in-depth guide. Cover all aspects of the topic with clear sections.',
      listicle: 'Structure as a numbered list of items. Each item gets its own H2 heading with detailed explanation.',
      'how-to': 'Write as step-by-step instructions. Number each step as H2. Include tips and common mistakes.',
      comparison: 'Create a balanced comparison. Use tables where appropriate. Cover pros/cons for each option.',
      review: 'Write a thorough review with ratings/scores. Cover features, pros, cons, pricing, and verdict.',
      pillar: 'Write as a pillar page — comprehensive authority content. Link out to related subtopics. Cover the topic exhaustively.',
    };

    return `Format instructions: ${formatGuide[format]}\nFunnel context: ${funnelContext[funnel]}`;
  }

  private formatOutline(sections: OutlineSection[]): string {
    return sections.map((s) => {
      const prefix = '#'.repeat(s.level);
      let text = `${prefix} ${s.heading} — ${s.notes}`;
      if (s.entities.length > 0) text += ` [entities: ${s.entities.join(', ')}]`;
      if (s.subsections) {
        text += '\n' + this.formatOutline(s.subsections);
      }
      return text;
    }).join('\n');
  }

  private formatEeatRequirements(eeat: EeatRequirements): string {
    const lines: string[] = ['\nE-E-A-T signals to include:'];
    if (eeat.experience_signals.length) lines.push(`Experience: ${eeat.experience_signals.join(', ')}`);
    if (eeat.expertise_signals.length) lines.push(`Expertise: ${eeat.expertise_signals.join(', ')}`);
    if (eeat.authority_signals.length) lines.push(`Authority: ${eeat.authority_signals.join(', ')}`);
    if (eeat.trust_signals.length) lines.push(`Trust: ${eeat.trust_signals.join(', ')}`);
    return lines.join('\n');
  }

  private extractMarkdown(response: string): string {
    // Remove potential code fences
    const fenced = response.match(/```(?:markdown|md)?\n([\s\S]+?)```/);
    return fenced ? fenced[1].trim() : response.trim();
  }

  private extractTitle(markdown: string): string | null {
    const match = markdown.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : null;
  }

  private async generateMetaTitle(brief: ContentBrief, title: string, language: string): Promise<string> {
    const lang = language === 'es' ? 'Spanish' : 'English';
    const prompt = `Generate a single SEO meta title (max 60 characters) in ${lang} for an article titled "${title}" targeting the keyword "${brief.target_keyword}". Return ONLY the meta title, no quotes or explanation.`;
    const result = await this.callClaude('You are an SEO specialist.', prompt, 100);
    return result.slice(0, 60).trim();
  }

  private async generateMetaDescription(brief: ContentBrief, title: string, language: string): Promise<string> {
    const lang = language === 'es' ? 'Spanish' : 'English';
    const prompt = `Generate a single SEO meta description (max 155 characters) in ${lang} for an article titled "${title}" targeting "${brief.target_keyword}". Include a call to action. Return ONLY the meta description, no quotes.`;
    const result = await this.callClaude('You are an SEO specialist.', prompt, 200);
    return result.slice(0, 155).trim();
  }

  private generateExcerpt(markdown: string): string {
    // Get first non-heading paragraph
    const paragraphs = markdown
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith('#') && !line.startsWith('!') && !line.startsWith('-'));
    return (paragraphs[0] || '').slice(0, 300).trim();
  }

  private countWords(text: string): number {
    return text.split(/\s+/).filter((w) => w.length > 0 && !w.startsWith('#')).length;
  }

  private extractFaqAnswers(content: string, questions: string[]): Array<{ question: string; answer: string }> {
    const results: Array<{ question: string; answer: string }> = [];
    const lines = content.split('\n');

    for (const question of questions) {
      const qLower = question.toLowerCase().replace(/[?¿]/g, '');
      for (let i = 0; i < lines.length; i++) {
        const lineLower = lines[i].toLowerCase().replace(/[?¿#*]/g, '').trim();
        if (lineLower.includes(qLower) || this.fuzzyMatch(lineLower, qLower)) {
          // Collect next non-empty lines as the answer
          const answerLines: string[] = [];
          for (let j = i + 1; j < lines.length && j < i + 6; j++) {
            const trimmed = lines[j].trim();
            if (trimmed.startsWith('#') || trimmed === '') {
              if (answerLines.length > 0) break;
              continue;
            }
            answerLines.push(trimmed);
          }
          if (answerLines.length > 0) {
            results.push({ question, answer: answerLines.join(' ').slice(0, 500) });
          }
          break;
        }
      }
    }
    return results;
  }

  private fuzzyMatch(a: string, b: string): boolean {
    const wordsB = b.split(/\s+/).filter((w) => w.length > 3);
    if (wordsB.length === 0) return false;
    const matches = wordsB.filter((w) => a.includes(w));
    return matches.length / wordsB.length >= 0.6;
  }

  private extractHowToSteps(content: string): Array<{ name: string; text: string }> {
    const steps: Array<{ name: string; text: string }> = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      // Look for step patterns: ## Step 1: ..., ## 1. ..., ## Paso 1: ...
      const stepMatch = lines[i].match(/^##\s+(?:(?:Step|Paso)\s+\d+[:.]\s*)?(.+)/i);
      if (stepMatch && /\d|step|paso/i.test(lines[i])) {
        const name = stepMatch[1].trim();
        const textLines: string[] = [];
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].startsWith('##')) break;
          const trimmed = lines[j].trim();
          if (trimmed) textLines.push(trimmed);
        }
        steps.push({ name, text: textLines.join(' ').slice(0, 500) });
      }
    }
    return steps;
  }

  private parseJsonResponse<T>(response: string): T | null {
    // Try to extract JSON from code fences first
    const fenced = response.match(/```(?:json)?\n?([\s\S]+?)```/);
    const raw = fenced ? fenced[1] : response;

    try {
      return JSON.parse(raw.trim()) as T;
    } catch {
      // Try to find JSON array/object in the response
      const jsonMatch = raw.match(/[\[{][\s\S]*[\]}]/);
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

interface ClaudeResponse {
  content: Array<{
    type: string;
    text?: string;
  }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface GeneratedContent {
  title: string;
  markdown: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  wordCount: number;
}

export interface SchemaOutput {
  article?: Record<string, unknown>;
  faq?: Record<string, unknown>;
  howto?: Record<string, unknown>;
}
