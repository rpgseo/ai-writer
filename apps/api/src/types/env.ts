export interface Env {
  // Cloudflare bindings
  DB: D1Database;
  CACHE: KVNamespace;
  STORAGE: R2Bucket;

  // Secrets
  APP_API_KEY: string;
  FIRECRAWL_API_KEY: string;
  GOOGLE_NLP_API_KEY: string;
  GSC_CLIENT_ID: string;
  GSC_CLIENT_SECRET: string;
  GSC_REFRESH_TOKEN: string;
  SERPER_API_KEY: string;
  DATAFORSEO_LOGIN: string;
  DATAFORSEO_PASSWORD: string;
  NEURONWRITER_API_KEY: string;
  CLAUDE_API_KEY: string;

  // Variables
  ENVIRONMENT: string;
  CORS_ORIGIN: string;
}
