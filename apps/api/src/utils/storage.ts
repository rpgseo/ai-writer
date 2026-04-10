/**
 * R2 storage wrapper for article exports and crawl data.
 */
export class StorageService {
  constructor(private r2: R2Bucket) {}

  async put(key: string, content: string, contentType = 'text/markdown'): Promise<void> {
    await this.r2.put(key, content, {
      httpMetadata: { contentType },
    });
  }

  async get(key: string): Promise<string | null> {
    const obj = await this.r2.get(key);
    if (!obj) return null;
    return await obj.text();
  }

  async delete(key: string): Promise<void> {
    await this.r2.delete(key);
  }

  async list(prefix: string, limit = 100): Promise<string[]> {
    const listed = await this.r2.list({ prefix, limit });
    return listed.objects.map((o) => o.key);
  }

  /**
   * Generate a storage key for an article export.
   */
  static articleKey(projectId: string, articleId: string, format: string): string {
    return `projects/${projectId}/articles/${articleId}.${format}`;
  }

  /**
   * Generate a storage key for crawl data.
   */
  static crawlKey(projectId: string, timestamp: string): string {
    return `projects/${projectId}/crawls/${timestamp}.json`;
  }
}
