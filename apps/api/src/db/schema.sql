-- ============================================================
-- AI Content Writer - D1 Database Schema
-- ============================================================

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  domain TEXT NOT NULL,
  name TEXT NOT NULL,
  language TEXT DEFAULT 'es',
  theme_summary TEXT,
  core_entities TEXT, -- JSON array
  gsc_connected INTEGER DEFAULT 0,
  gsc_property TEXT,
  cms_type TEXT, -- strapi/wordpress/custom/none
  cms_api_url TEXT,
  settings TEXT DEFAULT '{}', -- JSON: ProjectSettings
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Site Pages (crawled pages)
CREATE TABLE IF NOT EXISTS site_pages (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  meta_description TEXT,
  h1 TEXT,
  headings TEXT DEFAULT '[]', -- JSON array of {level, text}
  content_text TEXT,
  content_hash TEXT,
  entities TEXT DEFAULT '[]', -- JSON array from NLP
  categories TEXT DEFAULT '[]', -- JSON array from NLP
  word_count INTEGER DEFAULT 0,
  internal_links_out TEXT DEFAULT '[]', -- JSON array of URLs
  internal_links_in_count INTEGER DEFAULT 0,
  last_crawled TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, url)
);

-- GSC Keywords
CREATE TABLE IF NOT EXISTS gsc_keywords (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  page_url TEXT,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr REAL DEFAULT 0,
  position REAL DEFAULT 0,
  search_intent TEXT, -- informational/commercial/transactional/navigational
  date_start TEXT,
  date_end TEXT,
  trend TEXT DEFAULT 'stable', -- up/down/stable
  position_change REAL DEFAULT 0,
  is_quick_win INTEGER DEFAULT 0,
  is_cannibalized INTEGER DEFAULT 0,
  cannibalized_urls TEXT, -- JSON array
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, keyword, page_url, date_start)
);

-- Topical Maps
CREATE TABLE IF NOT EXISTS topical_maps (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pillar_topics TEXT DEFAULT '[]', -- JSON array
  total_clusters INTEGER DEFAULT 0,
  total_keywords INTEGER DEFAULT 0,
  coverage_score REAL DEFAULT 0,
  status TEXT DEFAULT 'draft', -- draft/active/archived
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Topic Clusters
CREATE TABLE IF NOT EXISTS topic_clusters (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  topical_map_id TEXT NOT NULL REFERENCES topical_maps(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cluster_name TEXT NOT NULL,
  pillar_keyword TEXT,
  keywords TEXT DEFAULT '[]', -- JSON array of {keyword, volume, kd, intent}
  funnel_stage TEXT, -- tofu/mofu/bofu
  entity_gaps TEXT DEFAULT '[]', -- JSON array of missing entities
  priority_score REAL DEFAULT 0,
  status TEXT DEFAULT 'pending', -- pending/in_progress/covered
  assigned_brief_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Content Briefs
CREATE TABLE IF NOT EXISTS content_briefs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  topical_map_id TEXT REFERENCES topical_maps(id),
  cluster_id TEXT REFERENCES topic_clusters(id),
  target_keyword TEXT NOT NULL,
  secondary_keywords TEXT DEFAULT '[]', -- JSON array
  search_intent TEXT,
  funnel_stage TEXT,
  content_format TEXT, -- guide/listicle/how-to/comparison/review/pillar
  suggested_title TEXT,
  outline TEXT, -- JSON structure
  serp_data TEXT, -- JSON: top 10 analysis
  paa_questions TEXT DEFAULT '[]', -- JSON array
  required_entities TEXT DEFAULT '[]', -- JSON array
  suggested_word_count INTEGER DEFAULT 1500,
  eeat_requirements TEXT, -- JSON
  internal_links_plan TEXT DEFAULT '[]', -- JSON
  priority_score REAL DEFAULT 0,
  language TEXT DEFAULT 'es',
  status TEXT DEFAULT 'pending', -- pending/in_progress/completed
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Articles
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  brief_id TEXT REFERENCES content_briefs(id),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  -- UNIQUE(project_id, slug) enforced below via index
  meta_title TEXT,
  meta_description TEXT,
  content_markdown TEXT,
  content_html TEXT,
  excerpt TEXT,
  language TEXT DEFAULT 'es',
  word_count INTEGER DEFAULT 0,
  -- Optimization scores
  nw_score REAL,
  nw_recommendations TEXT, -- JSON
  eeat_score REAL,
  readability_score REAL,
  -- Schema markup
  schema_article TEXT, -- JSON-LD
  schema_faq TEXT, -- JSON-LD
  schema_howto TEXT, -- JSON-LD
  -- Links
  internal_links TEXT DEFAULT '[]', -- JSON array of {url, anchor, context}
  -- Publishing
  status TEXT DEFAULT 'draft', -- draft/optimizing/optimized/published
  published_url TEXT,
  cms_id TEXT,
  r2_key TEXT,
  -- Metadata
  optimization_iterations INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Link Graph
CREATE TABLE IF NOT EXISTS link_graph (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  target_url TEXT NOT NULL,
  anchor_text TEXT,
  link_type TEXT DEFAULT 'existing', -- existing/suggested/inserted
  keyword_target TEXT,
  context_snippet TEXT,
  priority REAL DEFAULT 0,
  status TEXT DEFAULT 'pending', -- pending/approved/inserted/rejected
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, source_url, target_url, anchor_text)
);

-- Optimization Logs
CREATE TABLE IF NOT EXISTS optimization_logs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  iteration INTEGER,
  nw_score_before REAL,
  nw_score_after REAL,
  changes_made TEXT, -- JSON: what was modified
  nlp_terms_added TEXT, -- JSON array
  entities_added TEXT, -- JSON array
  created_at TEXT DEFAULT (datetime('now'))
);

-- Pipeline Runs
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_id TEXT,
  current_phase TEXT,
  phases TEXT DEFAULT '[]', -- JSON array of PipelinePhaseStatus
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  error TEXT
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_pages_project ON site_pages(project_id);
CREATE INDEX IF NOT EXISTS idx_pages_url ON site_pages(project_id, url);
CREATE INDEX IF NOT EXISTS idx_gsc_project ON gsc_keywords(project_id);
CREATE INDEX IF NOT EXISTS idx_gsc_keyword ON gsc_keywords(keyword);
CREATE INDEX IF NOT EXISTS idx_gsc_quickwin ON gsc_keywords(project_id, is_quick_win);
CREATE INDEX IF NOT EXISTS idx_gsc_page ON gsc_keywords(project_id, page_url);
CREATE INDEX IF NOT EXISTS idx_maps_project ON topical_maps(project_id);
CREATE INDEX IF NOT EXISTS idx_clusters_map ON topic_clusters(topical_map_id);
CREATE INDEX IF NOT EXISTS idx_clusters_funnel ON topic_clusters(funnel_stage);
CREATE INDEX IF NOT EXISTS idx_clusters_priority ON topic_clusters(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_briefs_project ON content_briefs(project_id);
CREATE INDEX IF NOT EXISTS idx_briefs_priority ON content_briefs(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_briefs_status ON content_briefs(status);
CREATE INDEX IF NOT EXISTS idx_articles_project ON articles(project_id);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_slug ON articles(project_id, slug);
CREATE INDEX IF NOT EXISTS idx_articles_updated ON articles(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_brief ON articles(brief_id);
CREATE INDEX IF NOT EXISTS idx_links_project ON link_graph(project_id);
CREATE INDEX IF NOT EXISTS idx_links_source ON link_graph(source_url);
CREATE INDEX IF NOT EXISTS idx_links_target ON link_graph(target_url);
CREATE INDEX IF NOT EXISTS idx_links_status ON link_graph(status);
CREATE INDEX IF NOT EXISTS idx_optlogs_article ON optimization_logs(article_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_project ON pipeline_runs(project_id);
