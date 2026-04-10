import { FUNNEL_MODIFIERS, FORMAT_SIGNALS } from '@ai-writer/shared';
import type { FunnelStage, SearchIntent, ContentFormat } from '@ai-writer/shared';

/**
 * Classifies keywords into TOFU/MOFU/BOFU funnel stages
 * and detects content format based on keyword patterns.
 */
export class FunnelClassifier {
  /**
   * Classify a keyword into a funnel stage.
   */
  classifyFunnel(keyword: string, intent?: SearchIntent): FunnelStage {
    const lower = keyword.toLowerCase();

    // Check modifiers (most specific first: BOFU → MOFU → TOFU)
    for (const modifier of FUNNEL_MODIFIERS.bofu) {
      if (lower.includes(modifier)) return 'bofu';
    }
    for (const modifier of FUNNEL_MODIFIERS.mofu) {
      if (lower.includes(modifier)) return 'mofu';
    }
    for (const modifier of FUNNEL_MODIFIERS.tofu) {
      if (lower.includes(modifier)) return 'tofu';
    }

    // Fallback to intent-based classification
    if (intent) {
      switch (intent) {
        case 'transactional': return 'bofu';
        case 'commercial': return 'mofu';
        case 'informational': return 'tofu';
        case 'navigational': return 'mofu';
      }
    }

    return 'tofu'; // default
  }

  /**
   * Detect the best content format for a keyword.
   */
  detectFormat(keyword: string): ContentFormat {
    const lower = keyword.toLowerCase();

    for (const [format, signals] of Object.entries(FORMAT_SIGNALS)) {
      for (const signal of signals) {
        if (lower.includes(signal)) {
          return format as ContentFormat;
        }
      }
    }

    return 'guide'; // default
  }

  /**
   * Calculate priority weight based on funnel stage.
   * BOFU has highest priority (closest to conversion).
   */
  getFunnelWeight(stage: FunnelStage): number {
    switch (stage) {
      case 'bofu': return 1.0;
      case 'mofu': return 0.8;
      case 'tofu': return 0.6;
    }
  }

  /**
   * Batch classify multiple keywords.
   */
  classifyBatch(keywords: Array<{ keyword: string; intent?: SearchIntent }>): Array<{
    keyword: string;
    funnel_stage: FunnelStage;
    content_format: ContentFormat;
    priority_weight: number;
  }> {
    return keywords.map(({ keyword, intent }) => {
      const funnel_stage = this.classifyFunnel(keyword, intent);
      return {
        keyword,
        funnel_stage,
        content_format: this.detectFormat(keyword),
        priority_weight: this.getFunnelWeight(funnel_stage),
      };
    });
  }
}
