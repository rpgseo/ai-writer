import {
  EEAT_EXPERIENCE_PATTERNS,
  EEAT_EXPERTISE_PATTERNS,
  EEAT_TRUST_PATTERNS,
} from '@ai-writer/shared';
import type { EeatScoreBreakdown, EeatSignal } from '@ai-writer/shared';

/**
 * E-E-A-T content scorer.
 * Analyzes content for Experience, Expertise, Authoritativeness, and Trust signals.
 */
export class EeatScorer {
  /**
   * Score content for E-E-A-T signals.
   */
  score(content: string, options: EeatScorerOptions = {}): EeatScoreBreakdown {
    const experience = this.scoreExperience(content);
    const expertise = this.scoreExpertise(content, options);
    const authoritativeness = this.scoreAuthoritativeness(content, options);
    const trust = this.scoreTrust(content);

    return {
      total: experience.score + expertise.score + authoritativeness.score + trust.score,
      experience,
      expertise,
      authoritativeness,
      trust,
    };
  }

  private scoreExperience(content: string): { score: number; max: number; signals: EeatSignal[] } {
    const signals: EeatSignal[] = [];

    // First-person language
    const firstPerson = EEAT_EXPERIENCE_PATTERNS.some((p) => p.test(content));
    signals.push({
      name: 'First-person experiential language',
      detected: firstPerson,
      score: firstPerson ? 8 : 0,
      max: 8,
      details: firstPerson ? 'Content uses first-person experience language' : 'No experiential language detected',
    });

    // Practical examples (look for numbered steps, "ejemplo", "example", "case study")
    const hasExamples = /\b(ejemplo|example|caso|case study|por ejemplo|for example|step \d|paso \d)/i.test(content);
    signals.push({
      name: 'Practical examples / case studies',
      detected: hasExamples,
      score: hasExamples ? 8 : 0,
      max: 8,
      details: hasExamples ? 'Practical examples found' : 'No practical examples detected',
    });

    // Media references (images, screenshots, videos)
    const hasMedia = /\!\[|<img|screenshot|captura|video|imagen/i.test(content);
    signals.push({
      name: 'Media/visual references',
      detected: hasMedia,
      score: hasMedia ? 5 : 0,
      max: 5,
      details: hasMedia ? 'Media references found' : 'No media references',
    });

    // Specific results/data
    const hasResults = /\b(\d+%|\d+x|increased|decreased|mejoró|redujo|resultado)/i.test(content);
    signals.push({
      name: 'Specific results/data shared',
      detected: hasResults,
      score: hasResults ? 4 : 0,
      max: 4,
      details: hasResults ? 'Specific results mentioned' : 'No specific results',
    });

    const totalScore = signals.reduce((sum, s) => sum + s.score, 0);
    return { score: totalScore, max: 25, signals };
  }

  private scoreExpertise(content: string, options: EeatScorerOptions): { score: number; max: number; signals: EeatSignal[] } {
    const signals: EeatSignal[] = [];

    // Entity coverage (if entities provided)
    const entityCoverage = options.requiredEntities
      ? this.calculateEntityCoverage(content, options.requiredEntities)
      : 0.5;
    const entityScore = Math.round(entityCoverage * 10);
    signals.push({
      name: 'Entity coverage vs NLP baseline',
      detected: entityCoverage > 0.5,
      score: entityScore,
      max: 10,
      details: `${Math.round(entityCoverage * 100)}% of required entities covered`,
    });

    // Technical terminology (uses domain-specific words)
    const hasTechnical = EEAT_EXPERTISE_PATTERNS.some((p) => p.test(content));
    signals.push({
      name: 'Technical/expert terminology',
      detected: hasTechnical,
      score: hasTechnical ? 5 : 0,
      max: 5,
      details: hasTechnical ? 'Expert language detected' : 'No expert language signals',
    });

    // Content depth (word count relative to topic complexity)
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const isDeep = wordCount >= (options.targetWordCount ?? 1200);
    signals.push({
      name: 'Content depth (word count)',
      detected: isDeep,
      score: isDeep ? 5 : Math.round((wordCount / (options.targetWordCount ?? 1200)) * 5),
      max: 5,
      details: `${wordCount} words (target: ${options.targetWordCount ?? 1200})`,
    });

    // NW score contribution
    const nwContribution = options.nwScore ? Math.min(Math.round(options.nwScore / 20), 5) : 0;
    signals.push({
      name: 'NeuronWriter NLP score',
      detected: nwContribution >= 3,
      score: nwContribution,
      max: 5,
      details: options.nwScore ? `NW Score: ${options.nwScore}` : 'Not analyzed yet',
    });

    const totalScore = signals.reduce((sum, s) => sum + s.score, 0);
    return { score: totalScore, max: 25, signals };
  }

  private scoreAuthoritativeness(content: string, options: EeatScorerOptions): { score: number; max: number; signals: EeatSignal[] } {
    const signals: EeatSignal[] = [];

    // External citations/sources
    const externalLinks = (content.match(/https?:\/\/[^\s\)]+/g) || []).length;
    const hasExternalCitations = externalLinks >= 2;
    signals.push({
      name: 'External citations/sources',
      detected: hasExternalCitations,
      score: Math.min(externalLinks * 2, 8),
      max: 8,
      details: `${externalLinks} external links found`,
    });

    // Internal links
    const internalLinkCount = options.internalLinksCount ?? 0;
    const hasInternalLinks = internalLinkCount >= 3;
    signals.push({
      name: 'Internal links to pillar content',
      detected: hasInternalLinks,
      score: Math.min(internalLinkCount * 2, 7),
      max: 7,
      details: `${internalLinkCount} internal links`,
    });

    // Author schema
    const hasAuthorSchema = /author|"@type":\s*"Person"/i.test(content) || !!options.hasAuthorSchema;
    signals.push({
      name: 'Author schema present',
      detected: hasAuthorSchema,
      score: hasAuthorSchema ? 5 : 0,
      max: 5,
      details: hasAuthorSchema ? 'Author schema detected' : 'No author schema',
    });

    // Statistics/data
    const hasStats = /\b\d{1,3}([.,]\d{1,2})?%|\b\d{1,3}([.,]\d{3})+\b|estadístic|statistic|dato|data point/i.test(content);
    signals.push({
      name: 'Statistics/data referenced',
      detected: hasStats,
      score: hasStats ? 5 : 0,
      max: 5,
      details: hasStats ? 'Statistical data found' : 'No statistics detected',
    });

    const totalScore = signals.reduce((sum, s) => sum + s.score, 0);
    return { score: totalScore, max: 25, signals };
  }

  private scoreTrust(content: string): { score: number; max: number; signals: EeatSignal[] } {
    const signals: EeatSignal[] = [];

    // Disclaimers
    const hasDisclaimer = /\b(disclaimer|nota:|aviso|advertencia|important:|cabe (destacar|mencionar))/i.test(content);
    signals.push({
      name: 'Disclaimers where appropriate',
      detected: hasDisclaimer,
      score: hasDisclaimer ? 5 : 0,
      max: 5,
      details: hasDisclaimer ? 'Disclaimer found' : 'No disclaimers',
    });

    // Updated date
    const hasUpdate = EEAT_TRUST_PATTERNS[0].test(content);
    signals.push({
      name: 'Updated date present',
      detected: hasUpdate,
      score: hasUpdate ? 5 : 0,
      max: 5,
      details: hasUpdate ? 'Update date found' : 'No update date',
    });

    // Sources verifiable
    const hasVerifiableSources = /\b(según|fuente|source|according to|cited|referencia)\b/i.test(content);
    signals.push({
      name: 'Sources verifiable',
      detected: hasVerifiableSources,
      score: hasVerifiableSources ? 5 : 0,
      max: 5,
      details: hasVerifiableSources ? 'Verifiable sources found' : 'No verifiable sources',
    });

    // No misleading claims (hard to automate - give baseline score)
    signals.push({
      name: 'No misleading claims',
      detected: true,
      score: 5,
      max: 5,
      details: 'Manual review recommended',
    });

    // FAQ/transparency sections
    const hasFaq = /\b(FAQ|preguntas frecuentes|frequently asked|P&R)\b/i.test(content);
    signals.push({
      name: 'FAQ/transparency sections',
      detected: hasFaq,
      score: hasFaq ? 5 : 0,
      max: 5,
      details: hasFaq ? 'FAQ section found' : 'No FAQ section',
    });

    const totalScore = signals.reduce((sum, s) => sum + s.score, 0);
    return { score: totalScore, max: 25, signals };
  }

  private calculateEntityCoverage(content: string, entities: string[]): number {
    if (entities.length === 0) return 1;
    const lower = content.toLowerCase();
    const found = entities.filter((e) => lower.includes(e.toLowerCase()));
    return found.length / entities.length;
  }
}

// ============================================================
// Types
// ============================================================

export interface EeatScorerOptions {
  requiredEntities?: string[];
  targetWordCount?: number;
  nwScore?: number;
  internalLinksCount?: number;
  hasAuthorSchema?: boolean;
}
