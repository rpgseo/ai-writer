// ============================================================
// Project
// ============================================================

export interface Project {
  id: string;
  domain: string;
  name: string;
  language: string;
  theme_summary: string | null;
  core_entities: string[] | null;
  gsc_connected: boolean;
  gsc_property: string | null;
  cms_type: CmsType | null;
  cms_api_url: string | null;
  settings: ProjectSettings;
  created_at: string;
  updated_at: string;
}

export type CmsType = 'strapi' | 'wordpress' | 'custom' | 'none';

export interface ProjectSettings {
  nw_threshold: number;        // NeuronWriter min score (default 70)
  max_optimization_iterations: number; // default 3
  default_word_count: number;  // default 1500
  content_language: string;    // override per-project
  eeat_threshold: number;      // min E-E-A-T score (default 60)
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  nw_threshold: 70,
  max_optimization_iterations: 3,
  default_word_count: 1500,
  content_language: 'es',
  eeat_threshold: 60,
};

// ============================================================
// Site Pages
// ============================================================

export interface SitePage {
  id: string;
  project_id: string;
  url: string;
  title: string | null;
  meta_description: string | null;
  h1: string | null;
  headings: Heading[];
  content_text: string | null;
  content_hash: string | null;
  entities: NlpEntity[];
  categories: NlpCategory[];
  word_count: number;
  internal_links_out: string[];
  internal_links_in_count: number;
  last_crawled: string | null;
  created_at: string;
}

export interface Heading {
  level: number;
  text: string;
}

export interface NlpEntity {
  name: string;
  type: string;
  salience: number;
  mentions: number;
}

export interface NlpCategory {
  name: string;
  confidence: number;
}

// ============================================================
// GSC Keywords
// ============================================================

export interface GscKeyword {
  id: string;
  project_id: string;
  keyword: string;
  page_url: string | null;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  search_intent: SearchIntent;
  date_start: string;
  date_end: string;
  trend: Trend;
  position_change: number;
  is_quick_win: boolean;
  is_cannibalized: boolean;
  cannibalized_urls: string[] | null;
  created_at: string;
}

export type SearchIntent = 'informational' | 'commercial' | 'transactional' | 'navigational';
export type Trend = 'up' | 'down' | 'stable';

// ============================================================
// Topical Map
// ============================================================

export interface TopicalMap {
  id: string;
  project_id: string;
  name: string;
  pillar_topics: string[];
  total_clusters: number;
  total_keywords: number;
  coverage_score: number;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface TopicCluster {
  id: string;
  topical_map_id: string;
  project_id: string;
  cluster_name: string;
  pillar_keyword: string | null;
  keywords: ClusterKeyword[];
  funnel_stage: FunnelStage;
  entity_gaps: string[];
  priority_score: number;
  status: 'pending' | 'in_progress' | 'covered';
  assigned_brief_id: string | null;
  created_at: string;
}

export interface ClusterKeyword {
  keyword: string;
  volume: number;
  kd: number;
  intent: SearchIntent;
}

export type FunnelStage = 'tofu' | 'mofu' | 'bofu';

// ============================================================
// Content Brief
// ============================================================

export interface ContentBrief {
  id: string;
  project_id: string;
  topical_map_id: string | null;
  cluster_id: string | null;
  target_keyword: string;
  secondary_keywords: string[];
  search_intent: SearchIntent;
  funnel_stage: FunnelStage;
  content_format: ContentFormat;
  suggested_title: string | null;
  outline: OutlineSection[] | null;
  serp_data: SerpData | null;
  paa_questions: string[];
  required_entities: string[];
  suggested_word_count: number;
  eeat_requirements: EeatRequirements | null;
  internal_links_plan: LinkPlan[];
  priority_score: number;
  language: string;
  status: 'pending' | 'in_progress' | 'completed';
  created_at: string;
  updated_at: string;
}

export type ContentFormat = 'guide' | 'listicle' | 'how-to' | 'comparison' | 'review' | 'pillar';

export interface OutlineSection {
  heading: string;
  level: number;
  notes: string;
  entities: string[];
  subsections?: OutlineSection[];
}

export interface SerpData {
  top_results: SerpResult[];
  avg_word_count: number;
  common_headings: string[];
  featured_snippet: string | null;
  paa: string[];
  related_searches: string[];
}

export interface SerpResult {
  position: number;
  url: string;
  title: string;
  description: string;
  word_count: number;
}

export interface EeatRequirements {
  experience_signals: string[];
  expertise_signals: string[];
  authority_signals: string[];
  trust_signals: string[];
}

export interface LinkPlan {
  direction: 'from' | 'to';
  url: string;
  suggested_anchor: string;
  reason: string;
}

// ============================================================
// Article
// ============================================================

export interface Article {
  id: string;
  brief_id: string | null;
  project_id: string;
  title: string;
  slug: string;
  meta_title: string | null;
  meta_description: string | null;
  content_markdown: string | null;
  content_html: string | null;
  excerpt: string | null;
  language: string;
  word_count: number;
  nw_score: number | null;
  nw_recommendations: NwRecommendation[] | null;
  eeat_score: number | null;
  readability_score: number | null;
  schema_article: object | null;
  schema_faq: object | null;
  schema_howto: object | null;
  internal_links: ArticleLink[];
  status: ArticleStatus;
  published_url: string | null;
  cms_id: string | null;
  r2_key: string | null;
  optimization_iterations: number;
  created_at: string;
  updated_at: string;
}

export type ArticleStatus = 'draft' | 'optimizing' | 'optimized' | 'published';

export interface NwRecommendation {
  term: string;
  importance: 'high' | 'medium' | 'low';
  count_recommended: number;
  count_current: number;
}

export interface ArticleLink {
  url: string;
  anchor: string;
  context: string;
}

// ============================================================
// Link Graph
// ============================================================

export interface LinkEdge {
  id: string;
  project_id: string;
  source_url: string;
  target_url: string;
  anchor_text: string | null;
  link_type: 'existing' | 'suggested' | 'inserted';
  keyword_target: string | null;
  context_snippet: string | null;
  priority: number;
  status: 'pending' | 'approved' | 'inserted' | 'rejected';
  created_at: string;
}

// ============================================================
// Pipeline
// ============================================================

export type PipelinePhase =
  | 'discovery'
  | 'gsc_intelligence'
  | 'topical_map'
  | 'content_planning'
  | 'content_generation'
  | 'optimization'
  | 'internal_linking'
  | 'export';

export interface PipelineStatus {
  project_id: string;
  workflow_id: string;
  current_phase: PipelinePhase;
  phases: PipelinePhaseStatus[];
  started_at: string;
  completed_at: string | null;
  error: string | null;
}

export interface PipelinePhaseStatus {
  phase: PipelinePhase;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  stats: Record<string, number>;
}

// ============================================================
// API Responses
// ============================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total?: number;
    page?: number;
    per_page?: number;
  };
}

export interface PaginationParams {
  page?: number;
  per_page?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// ============================================================
// E-E-A-T Score Breakdown
// ============================================================

export interface EeatScoreBreakdown {
  total: number;
  experience: EeatDimensionScore;
  expertise: EeatDimensionScore;
  authoritativeness: EeatDimensionScore;
  trust: EeatDimensionScore;
}

export interface EeatDimensionScore {
  score: number;
  max: number;
  signals: EeatSignal[];
}

export interface EeatSignal {
  name: string;
  detected: boolean;
  score: number;
  max: number;
  details: string;
}
