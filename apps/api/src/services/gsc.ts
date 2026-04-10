import type { Env } from '../types/env';
import type { SearchIntent } from '@ai-writer/shared';
import { INTENT_SIGNALS } from '@ai-writer/shared';

/**
 * Google Search Console API integration.
 * Uses OAuth2 refresh token flow with automatic token expiry handling.
 */
export class GscService {
  private baseUrl = 'https://www.googleapis.com/webmasters/v3';
  private tokenUrl = 'https://oauth2.googleapis.com/token';
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private env: Env) {}

  /**
   * Get or refresh OAuth2 access token with expiry tracking.
   */
  private async getAccessToken(): Promise<string> {
    // Refresh if token is missing or expires within 60 seconds
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.env.GSC_CLIENT_ID,
          client_secret: this.env.GSC_CLIENT_SECRET,
          refresh_token: this.env.GSC_REFRESH_TOKEN,
          grant_type: 'refresh_token',
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`GSC token refresh failed: ${res.status} ${await res.text()}`);
      }

      const data = await res.json() as { access_token: string; expires_in: number };
      this.accessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
      return this.accessToken;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fetch search analytics data for a property.
   */
  async getSearchAnalytics(
    siteUrl: string,
    options: SearchAnalyticsOptions = {}
  ): Promise<GscRawRow[]> {
    const token = await this.getAccessToken();
    const {
      startDate = getDateNDaysAgo(90),
      endDate = getDateNDaysAgo(1),
      dimensions = ['query', 'page'],
      rowLimit = 5000,
      startRow = 0,
    } = options;

    const encodedSite = encodeURIComponent(siteUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(
        `${this.baseUrl}/sites/${encodedSite}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ startDate, endDate, dimensions, rowLimit, startRow }),
          signal: controller.signal,
        }
      );

      if (!res.ok) {
        throw new Error(`GSC search analytics failed: ${res.status} ${await res.text()}`);
      }

      const data = await res.json() as { rows?: GscRawRow[] };
      return data.rows ?? [];
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fetch all keywords with pagination (GSC max 25k per request).
   */
  async getAllKeywords(siteUrl: string, daysBack = 90): Promise<GscRawRow[]> {
    const allRows: GscRawRow[] = [];
    let startRow = 0;
    const rowLimit = 5000;

    while (true) {
      const rows = await this.getSearchAnalytics(siteUrl, {
        startDate: getDateNDaysAgo(daysBack),
        endDate: getDateNDaysAgo(1),
        dimensions: ['query', 'page'],
        rowLimit,
        startRow,
      });

      allRows.push(...rows);

      if (rows.length < rowLimit) break;
      startRow += rowLimit;

      if (startRow > 25000) break;
    }

    return allRows;
  }

  /**
   * Analyze keywords to find opportunities.
   */
  analyzeOpportunities(rows: GscRawRow[]): GscOpportunities {
    const quickWins: GscRawRow[] = [];
    const lowCtr: GscRawRow[] = [];
    const cannibalized = new Map<string, GscRawRow[]>();

    for (const row of rows) {
      const position = row.position;
      const query = row.keys[0];

      // Quick wins: position 5-20 with decent impressions
      if (position >= 5 && position <= 20 && row.impressions >= 50) {
        quickWins.push(row);
      }

      // Low CTR (high impressions, low clicks)
      if (row.impressions >= 100 && row.ctr < 0.02) {
        lowCtr.push(row);
      }

      // Cannibalization detection
      if (!cannibalized.has(query)) {
        cannibalized.set(query, []);
      }
      cannibalized.get(query)!.push(row);
    }

    // Filter cannibalized: only keywords with 2+ pages
    const cannibalizedResults: Record<string, GscRawRow[]> = {};
    for (const [query, pages] of cannibalized) {
      if (pages.length > 1) {
        cannibalizedResults[query] = pages;
      }
    }

    return {
      quickWins: quickWins.sort((a, b) => b.impressions - a.impressions).slice(0, 50),
      cannibalized: cannibalizedResults,
      lowCtr: lowCtr.sort((a, b) => b.impressions - a.impressions).slice(0, 50),
    };
  }

  /**
   * Classify search intent for a keyword.
   */
  classifyIntent(keyword: string): SearchIntent {
    const lower = keyword.toLowerCase();

    for (const [intent, signals] of Object.entries(INTENT_SIGNALS)) {
      for (const signal of signals) {
        if (lower.includes(signal)) {
          return intent as SearchIntent;
        }
      }
    }

    return 'informational';
  }
}

// ============================================================
// Types
// ============================================================

export interface GscRawRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchAnalyticsOptions {
  startDate?: string;
  endDate?: string;
  dimensions?: string[];
  rowLimit?: number;
  startRow?: number;
}

export interface GscOpportunities {
  quickWins: GscRawRow[];
  cannibalized: Record<string, GscRawRow[]>;
  lowCtr: GscRawRow[];
}

function getDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}
