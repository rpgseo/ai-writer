# AI Content Writer - Plan de Arquitectura Definitivo

## 1. Resumen Ejecutivo

Herramienta de creación de contenido SEO desplegada en **Cloudflare Workers + Pages**.
Analiza cualquier web, genera topical maps, crea contenido optimizado con señales E-E-A-T,
y construye estrategias de internal linking basadas en datos reales de GSC.

**Stack**: Cloudflare Workers (Hono) + Pages (React) + D1 + KV + R2 + Workflows
**Usuario**: Single-user con API key
**Idioma contenido**: Multilingüe (detección automática + selector manual)

---

## 2. APIs y Credenciales

| API | Propósito | Credencial |
|-----|-----------|------------|
| **NeuronWriter** | Content scoring y optimización semántica | API Key (wrangler secret) |
| **Google NLP** | Entity extraction, categorización, sentimiento | GCP project: proyectos-n8n |
| **Google Search Console** | Keywords, impresiones, CTR, posiciones | OAuth2 via GCP: proyectos-n8n |
| **DataForSEO** | Keyword metrics, SERP features, dificultad, TF-IDF | Login + Password |
| **Serper** | SERP en tiempo real, PAA, Related Searches | API Key |
| **Firecrawl** | Crawl completo de sitios web | API Key |
| **Claude API** | Generación de contenido (via Workers AI o API directa) | API Key |

---

## 3. Infraestructura Cloudflare

### 3.1 Servicios Utilizados

| Servicio | Binding | Uso |
|----------|---------|-----|
| **Workers** | - | API backend (Hono framework) |
| **Pages** | - | Frontend React + Vite + Tailwind |
| **D1** | `DB` | Base de datos SQLite (proyectos, keywords, artículos, links) |
| **KV** | `CACHE` | Cache de respuestas API (SERP, keywords, NLP) con TTL |
| **R2** | `STORAGE` | Almacenamiento de artículos exportados, crawl data, backups |
| **Workflows** | `PIPELINE` | Orquestación del pipeline de contenido (8 steps) |
| **Queues** | `TASKS` | Cola de tareas async (bulk generation, link audit) |

### 3.2 Secrets (wrangler secret put)

```
NEURONWRITER_API_KEY
GOOGLE_NLP_API_KEY
GSC_CLIENT_ID
GSC_CLIENT_SECRET
GSC_REFRESH_TOKEN
SERPER_API_KEY
DATAFORSEO_LOGIN
DATAFORSEO_PASSWORD
FIRECRAWL_API_KEY
CLAUDE_API_KEY
APP_API_KEY          ← tu key de acceso personal a la herramienta
```

---

## 4. Pipeline de Contenido (8 Fases)

### FASE 0: Website Discovery
```
Input:  URL del dominio
Tools:  Firecrawl API + Google NLP API
Output: Site Profile

Proceso:
1. Firecrawl crawlea el sitio completo (map + scrape)
2. Extrae: URLs, títulos, metas, H1-H6, contenido, enlaces internos
3. Google NLP analiza las páginas principales:
   - Entity extraction (entidades clave del dominio)
   - Content classification (categorías temáticas)
   - Sentiment analysis
4. Genera Site Profile:
   - Temática principal y subtemas
   - Entidades core del dominio
   - Mapa de URLs existentes
   - Grafo de enlaces internos actual
   - Idioma principal detectado

Almacena: D1 (projects, site_pages) + KV (cache NLP responses)
```

### FASE 1: GSC Intelligence
```
Input:  GSC credentials + domain
Tools:  Google Search Console API
Output: Keyword Intelligence Report

Proceso:
1. Pull últimos 90 días de data:
   - Keywords con impressions, clicks, CTR, posición media
   - Páginas con métricas
   - Queries por página
2. Análisis automático:
   a. Quick Wins: Keywords en posición 5-20 con >100 impresiones
   b. Decaying: Keywords que han perdido >3 posiciones en 30 días
   c. Canibalizaciones: Misma keyword rankea con múltiples URLs
   d. Content Gaps: Impresiones altas + CTR bajo = necesita mejor contenido
   e. Zero-click opportunities: Keywords con Featured Snippet potencial
3. Clasificar cada keyword por search intent (informational/commercial/transactional/navigational)

Almacena: D1 (gsc_keywords, gsc_pages, gsc_opportunities)
```

### FASE 2: Topical Map Generation
```
Input:  Site Profile + GSC Keywords
Tools:  DataForSEO + Serper + Google NLP
Output: Topical Map completo

Proceso:
1. Seed keywords = entidades core (Fase 0) + top GSC keywords (Fase 1)
2. Keyword expansion:
   - DataForSEO: Related keywords, keyword suggestions, search volume, KD
   - Serper: Related searches, PAA questions
3. Clustering semántico:
   - Agrupar keywords por topic usando Google NLP entity similarity
   - Identificar pillar topics (clusters principales)
   - Identificar supporting topics (subtemas)
4. Funnel mapping automático:
   - TOFU: Keywords informacionales (qué, cómo, guía, beneficios)
   - MOFU: Keywords comparativas (mejor, vs, comparativa, alternativas)
   - BOFU: Keywords transaccionales (precio, contratar, comprar, opiniones)
5. Entity Gap Analysis:
   - Comparar entidades cubiertas vs entidades del top 10 SERP
   - Identificar entidades que faltan por cubrir
6. Internal Link Blueprint:
   - Diseñar estructura de pillar → cluster → supporting
   - Mapear anchor texts óptimos desde GSC data

Almacena: D1 (topical_maps, topic_clusters, keywords)
```

### FASE 3: Content Planning & Prioritization
```
Input:  Topical Map + GSC Opportunities
Tools:  Scoring algorithm propio
Output: Content Calendar priorizado

Proceso:
1. Para cada artículo potencial, calcular Priority Score (0-100):
   - Oportunidad GSC (quick wins, decaying) = 30 puntos
   - Keyword difficulty (menor = más puntos) = 20 puntos
   - Search volume = 15 puntos
   - Gap en topical map (temas no cubiertos) = 20 puntos
   - Posición en funnel (BOFU > MOFU > TOFU para revenue) = 15 puntos
2. Generar Content Brief para cada artículo:
   - Target keyword + secondary keywords
   - Search intent + funnel stage
   - Formato sugerido (listicle, how-to, guide, comparison, review)
   - Word count estimado (basado en top 10 SERP)
   - Entidades a cubrir obligatoriamente
   - E-E-A-T requirements específicos
   - Internal links sugeridos (desde/hacia)
3. Ordenar por Priority Score → Content Calendar

Almacena: D1 (content_briefs, content_calendar)
```

### FASE 4: Content Generation
```
Input:  Content Brief
Tools:  Serper + Google NLP + Claude API
Output: Draft del artículo

Proceso:
1. SERP Deep Analysis:
   - Serper: Top 10 resultados para target keyword
   - Extraer: títulos, metas, headings, word count, estructura
   - PAA extraction: preguntas frecuentes
   - Featured Snippet analysis: formato ganador
2. Outline Generation (Claude API):
   - Basado en top 10 SERP structure
   - Incluye PAA como secciones FAQ
   - Cubre todas las entidades del brief
   - Estructura SILO para internal linking
3. Content Draft (Claude API):
   - Genera contenido sección por sección
   - Inyecta señales E-E-A-T:
     * Experience: Lenguaje en primera persona, ejemplos prácticos
     * Expertise: Cobertura completa de entidades, terminología técnica
     * Authoritativeness: Referencias a fuentes, datos estadísticos
     * Trust: Disclaimers apropiados, transparencia, citas
   - Formato markdown con headings, listas, tablas
   - Multilingüe: genera en el idioma seleccionado
4. Schema Markup Generation:
   - Article schema (JSON-LD)
   - FAQ schema (si tiene PAA)
   - HowTo schema (si es tutorial)
   - Breadcrumb schema
5. Meta Tags:
   - Title tag optimizado (60 chars)
   - Meta description (155 chars)
   - OG tags

Almacena: D1 (articles) + R2 (content markdown/HTML)
```

### FASE 5: Content Optimization
```
Input:  Draft del artículo
Tools:  NeuronWriter API + Google NLP
Output: Artículo optimizado con scores

Proceso:
1. NeuronWriter Analysis:
   - Enviar contenido + target keyword
   - Obtener: content score, NLP terms faltantes, competidor benchmark
   - Identificar gaps semánticos vs top 10
2. Google NLP Verification:
   - Verificar que entidades del brief están presentes
   - Verificar categorización correcta
   - Análisis de sentimiento (match con intent)
3. Readability Analysis (built-in):
   - Flesch-Kincaid adaptado al idioma
   - Longitud de párrafos y frases
   - Uso de voz activa/pasiva
   - Headings distribution
4. E-E-A-T Score (built-in):
   - Presencia de author bio
   - Citas y fuentes externas
   - Datos y estadísticas
   - Lenguaje experiencial
   - Transparencia y disclaimers
5. Iteración automática:
   - Si NeuronWriter score < umbral (configurable, default 70):
     * Claude API reescribe secciones débiles
     * Añade NLP terms faltantes
     * Re-evalúa hasta alcanzar umbral o max 3 iteraciones

Almacena: D1 (articles.nw_score, articles.eeat_score, optimization_logs)
```

### FASE 6: Internal Linking Engine
```
Input:  Artículo generado + Site Pages + GSC Data
Tools:  Algoritmo de link graph propio
Output: Internal links insertados + sugerencias para posts existentes

Proceso:
1. Construir/actualizar Link Graph:
   - Nodos = todas las URLs del sitio (Fase 0)
   - Aristas = enlaces internos existentes
   - Peso = relevancia semántica (NLP entity overlap)
2. Para el artículo nuevo:
   - Identificar páginas relacionadas por entidades compartidas
   - Seleccionar anchor texts de GSC keywords (keywords que la página target rankea)
   - Insertar 3-8 enlaces internos contextuales
   - Evitar over-optimization (no repetir anchors, variaciones naturales)
3. Reverse linking (sugerencias):
   - Identificar posts existentes que deberían enlazar al nuevo
   - Generar sugerencias con: URL origen, párrafo donde insertar, anchor text, URL destino
4. Link equity analysis:
   - Detectar páginas huérfanas (0 enlaces entrantes)
   - Detectar link hoarding (páginas con demasiados enlaces salientes)
   - Distribución de PageRank interno (simplificado)

Almacena: D1 (link_graph, link_suggestions)
```

### FASE 7: Export & Publish
```
Input:  Artículo final optimizado
Tools:  CMS API (Strapi, WordPress, etc.) o export estático
Output: Contenido publicado o listo para publicar

Opciones de output:
1. Export Markdown → R2 (descargable)
2. Export HTML → R2 (descargable)
3. API push a CMS (configurable por proyecto):
   - Strapi API
   - WordPress REST API
   - Custom webhook
4. Incluye:
   - Contenido formateado
   - Meta tags
   - Schema markup (JSON-LD)
   - Sugerencias de internal links
   - Imágenes sugeridas (prompts para generación)
```

---

## 5. Modelo de Base de Datos (D1/SQLite)

### Tabla: projects
```sql
CREATE TABLE projects (
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
  settings TEXT, -- JSON: NW thresholds, max iterations, etc.
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### Tabla: site_pages
```sql
CREATE TABLE site_pages (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  project_id TEXT NOT NULL REFERENCES projects(id),
  url TEXT NOT NULL,
  title TEXT,
  meta_description TEXT,
  h1 TEXT,
  headings TEXT, -- JSON array of {level, text}
  content_text TEXT, -- plain text extracted
  content_hash TEXT, -- for change detection
  entities TEXT, -- JSON array from NLP
  categories TEXT, -- JSON array from NLP
  word_count INTEGER,
  internal_links_out TEXT, -- JSON array of URLs
  internal_links_in_count INTEGER DEFAULT 0,
  last_crawled TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, url)
);
```

### Tabla: gsc_keywords
```sql
CREATE TABLE gsc_keywords (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  project_id TEXT NOT NULL REFERENCES projects(id),
  keyword TEXT NOT NULL,
  page_url TEXT,
  impressions INTEGER,
  clicks INTEGER,
  ctr REAL,
  position REAL,
  search_intent TEXT, -- informational/commercial/transactional/navigational
  date_start TEXT,
  date_end TEXT,
  trend TEXT, -- up/down/stable
  position_change REAL, -- vs previous period
  is_quick_win INTEGER DEFAULT 0,
  is_cannibalized INTEGER DEFAULT 0,
  cannibalized_urls TEXT, -- JSON array
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, keyword, page_url, date_start)
);
```

### Tabla: topical_maps
```sql
CREATE TABLE topical_maps (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  pillar_topics TEXT, -- JSON array
  total_clusters INTEGER,
  total_keywords INTEGER,
  coverage_score REAL, -- % of entities covered
  status TEXT DEFAULT 'draft', -- draft/active/archived
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### Tabla: topic_clusters
```sql
CREATE TABLE topic_clusters (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  topical_map_id TEXT NOT NULL REFERENCES topical_maps(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  cluster_name TEXT NOT NULL,
  pillar_keyword TEXT,
  keywords TEXT, -- JSON array of {keyword, volume, kd, intent}
  funnel_stage TEXT, -- tofu/mofu/bofu
  entity_gaps TEXT, -- JSON array of missing entities
  priority_score REAL,
  status TEXT DEFAULT 'pending', -- pending/in_progress/covered
  assigned_brief_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Tabla: content_briefs
```sql
CREATE TABLE content_briefs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  project_id TEXT NOT NULL REFERENCES projects(id),
  topical_map_id TEXT REFERENCES topical_maps(id),
  cluster_id TEXT REFERENCES topic_clusters(id),
  target_keyword TEXT NOT NULL,
  secondary_keywords TEXT, -- JSON array
  search_intent TEXT,
  funnel_stage TEXT,
  content_format TEXT, -- guide/listicle/how-to/comparison/review
  suggested_title TEXT,
  outline TEXT, -- JSON structure
  serp_data TEXT, -- JSON: top 10 analysis
  paa_questions TEXT, -- JSON array
  required_entities TEXT, -- JSON array
  suggested_word_count INTEGER,
  eeat_requirements TEXT, -- JSON
  internal_links_plan TEXT, -- JSON: suggested links from/to
  priority_score REAL,
  language TEXT DEFAULT 'es',
  status TEXT DEFAULT 'pending', -- pending/in_progress/completed
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### Tabla: articles
```sql
CREATE TABLE articles (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  brief_id TEXT REFERENCES content_briefs(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  meta_title TEXT,
  meta_description TEXT,
  content_markdown TEXT, -- full article in markdown
  content_html TEXT, -- rendered HTML
  excerpt TEXT,
  language TEXT,
  word_count INTEGER,
  -- Optimization scores
  nw_score REAL, -- NeuronWriter score
  nw_recommendations TEXT, -- JSON
  eeat_score REAL,
  readability_score REAL,
  -- Schema
  schema_article TEXT, -- JSON-LD
  schema_faq TEXT, -- JSON-LD
  schema_howto TEXT, -- JSON-LD
  -- Links
  internal_links TEXT, -- JSON array of {url, anchor, context}
  -- Publishing
  status TEXT DEFAULT 'draft', -- draft/optimizing/optimized/published
  published_url TEXT,
  cms_id TEXT, -- ID in external CMS
  r2_key TEXT, -- R2 storage key
  -- Metadata
  optimization_iterations INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### Tabla: link_graph
```sql
CREATE TABLE link_graph (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  project_id TEXT NOT NULL REFERENCES projects(id),
  source_url TEXT NOT NULL,
  target_url TEXT NOT NULL,
  anchor_text TEXT,
  link_type TEXT, -- existing/suggested/inserted
  keyword_target TEXT, -- GSC keyword this link supports
  context_snippet TEXT, -- surrounding text
  priority REAL,
  status TEXT DEFAULT 'pending', -- pending/approved/inserted/rejected
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, source_url, target_url, anchor_text)
);
```

### Tabla: optimization_logs
```sql
CREATE TABLE optimization_logs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  article_id TEXT NOT NULL REFERENCES articles(id),
  iteration INTEGER,
  nw_score_before REAL,
  nw_score_after REAL,
  changes_made TEXT, -- JSON: what was modified
  nlp_terms_added TEXT, -- JSON array
  entities_added TEXT, -- JSON array
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Tabla: cache_entries (para KV tracking)
```sql
CREATE TABLE cache_entries (
  key TEXT PRIMARY KEY,
  api_source TEXT, -- serper/dataforseo/nlp/neuronwriter
  query_hash TEXT,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Índices
```sql
CREATE INDEX idx_gsc_project ON gsc_keywords(project_id);
CREATE INDEX idx_gsc_keyword ON gsc_keywords(keyword);
CREATE INDEX idx_gsc_quickwin ON gsc_keywords(project_id, is_quick_win);
CREATE INDEX idx_pages_project ON site_pages(project_id);
CREATE INDEX idx_pages_url ON site_pages(project_id, url);
CREATE INDEX idx_clusters_map ON topic_clusters(topical_map_id);
CREATE INDEX idx_clusters_funnel ON topic_clusters(funnel_stage);
CREATE INDEX idx_briefs_project ON content_briefs(project_id);
CREATE INDEX idx_briefs_priority ON content_briefs(priority_score DESC);
CREATE INDEX idx_articles_project ON articles(project_id);
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_links_project ON link_graph(project_id);
CREATE INDEX idx_links_source ON link_graph(source_url);
CREATE INDEX idx_links_target ON link_graph(target_url);
```

---

## 6. Arquitectura del Backend (Cloudflare Workers + Hono)

### API Routes

```
POST   /api/auth/verify              → Verificar API key

# Projects
POST   /api/projects                  → Crear proyecto (domain + name)
GET    /api/projects                  → Listar proyectos
GET    /api/projects/:id              → Detalle proyecto
PUT    /api/projects/:id              → Actualizar proyecto
DELETE /api/projects/:id              → Eliminar proyecto

# Pipeline
POST   /api/projects/:id/crawl       → Fase 0: Iniciar crawl
POST   /api/projects/:id/gsc/sync    → Fase 1: Sincronizar GSC
POST   /api/projects/:id/topical-map → Fase 2: Generar topical map
GET    /api/projects/:id/topical-map → Ver topical map
POST   /api/projects/:id/plan        → Fase 3: Generar content plan
GET    /api/projects/:id/calendar    → Ver content calendar

# Content
POST   /api/briefs/:id/generate      → Fase 4: Generar artículo
POST   /api/articles/:id/optimize    → Fase 5: Optimizar con NW
GET    /api/articles/:id             → Ver artículo
PUT    /api/articles/:id             → Editar artículo
POST   /api/articles/:id/publish     → Fase 7: Publicar/exportar

# Links
GET    /api/projects/:id/link-graph  → Fase 6: Ver grafo de enlaces
POST   /api/projects/:id/link-audit  → Recalcular link suggestions
PUT    /api/links/:id/approve        → Aprobar sugerencia de enlace

# GSC
GET    /api/projects/:id/gsc/keywords    → Keywords con métricas
GET    /api/projects/:id/gsc/opportunities → Quick wins, gaps, etc.

# Pipeline completo
POST   /api/projects/:id/pipeline    → Ejecutar pipeline completo (Workflow)
GET    /api/projects/:id/pipeline/status → Estado del pipeline

# Export
GET    /api/articles/:id/export/:format → Export (md/html/json)
```

### Workflow Definition (Cloudflare Workflows)

```typescript
// Cada step puede durar hasta 15 min
// Retry automático con backoff
// Estado persistente entre steps

export class ContentPipelineWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    // Step 0: Website Discovery
    const siteProfile = await step.do('crawl-site', async () => {
      // Firecrawl + NLP
    });

    // Step 1: GSC Intelligence
    const gscData = await step.do('gsc-analysis', async () => {
      // GSC API pull + analysis
    });

    // Step 2: Topical Map
    const topicalMap = await step.do('topical-map', async () => {
      // DataForSEO + clustering
    });

    // Step 3: Content Planning
    const calendar = await step.do('content-planning', async () => {
      // Priority scoring + brief generation
    });

    // Steps 4-7: Per article (parallel via Queue)
    await step.do('queue-articles', async () => {
      // Enviar cada brief a TASKS queue
    });
  }
}
```

---

## 7. Arquitectura del Frontend (Cloudflare Pages)

### Stack Frontend

- **React 19** + Vite
- **TailwindCSS v4** + shadcn/ui
- **TanStack Router** (file-based routing)
- **TanStack Query** (data fetching + cache)
- **Recharts** (gráficos de métricas GSC)
- **ReactFlow** (visualización topical map interactivo)
- **Monaco Editor** (edición de artículos con preview)

### Páginas principales

```
/                           → Dashboard (resumen de proyectos)
/projects/new               → Crear proyecto
/projects/:id               → Overview del proyecto
/projects/:id/discovery     → Fase 0: Site analysis results
/projects/:id/gsc           → Fase 1: GSC data + opportunities
/projects/:id/topical-map   → Fase 2: Mapa topical interactivo (ReactFlow)
/projects/:id/calendar      → Fase 3: Content calendar + briefs
/projects/:id/articles      → Lista de artículos
/projects/:id/articles/:id  → Editor de artículo + scores
/projects/:id/links         → Fase 6: Link graph + sugerencias
/projects/:id/pipeline      → Estado del pipeline
/settings                   → API keys, configuración general
```

### UI Key Features

1. **Topical Map Visual** (ReactFlow):
   - Nodos = clusters/topics
   - Colores = funnel stage (verde=TOFU, amarillo=MOFU, rojo=BOFU)
   - Tamaño = search volume
   - Conectores = relaciones semánticas
   - Click en nodo → ver keywords + generar brief

2. **Content Calendar** (Kanban):
   - Columnas: Pending → Brief Ready → Writing → Optimizing → Published
   - Cards con: keyword, volume, KD, priority score, funnel badge

3. **Article Editor**:
   - Split view: Markdown editor (Monaco) | Preview
   - Sidebar: NW score, E-E-A-T score, readability, entity checklist
   - Bottom: internal link suggestions con one-click insert

4. **GSC Dashboard**:
   - Gráficos de tendencia (impressions, clicks, CTR)
   - Tabla de keywords con filtros (quick wins, decaying, etc.)
   - Heatmap de posiciones por keyword

5. **Link Graph**:
   - Visualización del grafo de enlaces (ReactFlow o D3)
   - Páginas huérfanas destacadas
   - Sugerencias de enlaces con approve/reject

---

## 8. Señales E-E-A-T por Fase

| Fase | Experience | Expertise | Authoritativeness | Trust |
|------|-----------|-----------|-------------------|-------|
| **Brief** | Requiere ejemplos prácticos | Lista entidades obligatorias | Define fuentes a citar | Marca disclaimers necesarios |
| **Generation** | Lenguaje 1ª persona, case studies | Cobertura completa entidades NLP | Citas a estudios/fuentes | Datos verificables, fechas |
| **Optimization** | Score de "experiential language" | NW entity coverage vs top 10 | External link quality | Fact-checking prompts |
| **Schema** | - | Author schema con credentials | Organization schema | Review/Rating schema si aplica |

### E-E-A-T Score Calculation (0-100)
```
Experience (25 pts):
  - First-person language detected: 8 pts
  - Practical examples/case studies: 8 pts
  - Screenshots/media references: 5 pts
  - Specific results/data shared: 4 pts

Expertise (25 pts):
  - Entity coverage vs NLP baseline: 10 pts
  - Technical terminology appropriate: 5 pts
  - Depth (word count vs topic complexity): 5 pts
  - NeuronWriter NLP score: 5 pts

Authoritativeness (25 pts):
  - External citations/sources: 8 pts
  - Internal links to pillar content: 7 pts
  - Author schema present: 5 pts
  - Statistics/data referenced: 5 pts

Trust (25 pts):
  - Disclaimers where appropriate: 5 pts
  - Updated date present: 5 pts
  - Sources verifiable: 5 pts
  - No misleading claims: 5 pts
  - FAQ/transparency sections: 5 pts
```

---

## 9. TOFU/MOFU/BOFU Strategy

### Clasificación Automática de Keywords

```typescript
// Reglas de clasificación por modificadores
const FUNNEL_RULES = {
  tofu: {
    modifiers: ['qué es', 'what is', 'cómo', 'how to', 'guía', 'guide',
                'tutorial', 'beneficios', 'benefits', 'tipos de', 'types of',
                'para qué sirve', 'significado', 'meaning', 'examples'],
    intents: ['informational'],
    priority_weight: 0.6  // Menor prioridad directa, pero construye autoridad
  },
  mofu: {
    modifiers: ['mejor', 'best', 'vs', 'versus', 'comparativa', 'comparison',
                'alternativas', 'alternatives', 'top', 'review', 'ventajas',
                'pros and cons', 'diferencias', 'differences'],
    intents: ['commercial'],
    priority_weight: 0.8
  },
  bofu: {
    modifiers: ['precio', 'price', 'comprar', 'buy', 'contratar', 'hire',
                'presupuesto', 'quote', 'descuento', 'discount', 'oferta',
                'plan', 'pricing', 'free trial', 'demo', 'opiniones', 'reviews'],
    intents: ['transactional'],
    priority_weight: 1.0  // Máxima prioridad (más cercano a conversión)
  }
};
```

### Distribución Recomendada de Contenido
```
TOFU: 50-60% del contenido (volumen, autoridad temática)
MOFU: 25-30% del contenido (consideración, comparativas)
BOFU: 15-20% del contenido (conversión, revenue directo)
```

### Internal Linking por Funnel
```
TOFU → enlaza a MOFU (guiar hacia consideración)
MOFU → enlaza a BOFU (guiar hacia conversión)
BOFU → enlaza a TOFU pillar (reforzar autoridad)
Pillar → enlaza a todos los clusters
```

---

## 10. Estructura de Archivos Final

```
AI-WRITER/
├── apps/
│   ├── api/                          # Cloudflare Worker (backend)
│   │   ├── src/
│   │   │   ├── index.ts              # Entry point + Hono app
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts           # API key validation
│   │   │   │   ├── cors.ts
│   │   │   │   └── error-handler.ts
│   │   │   ├── routes/
│   │   │   │   ├── projects.ts
│   │   │   │   ├── pipeline.ts
│   │   │   │   ├── gsc.ts
│   │   │   │   ├── topical-map.ts
│   │   │   │   ├── briefs.ts
│   │   │   │   ├── articles.ts
│   │   │   │   ├── links.ts
│   │   │   │   └── export.ts
│   │   │   ├── workflows/
│   │   │   │   ├── content-pipeline.ts
│   │   │   │   ├── single-article.ts
│   │   │   │   └── link-audit.ts
│   │   │   ├── services/
│   │   │   │   ├── crawler.ts        # Firecrawl integration
│   │   │   │   ├── gsc.ts            # Google Search Console
│   │   │   │   ├── nlp.ts            # Google NLP API
│   │   │   │   ├── serper.ts         # Serper SERP data
│   │   │   │   ├── dataforseo.ts     # DataForSEO keywords
│   │   │   │   ├── neuronwriter.ts   # NeuronWriter optimization
│   │   │   │   ├── content-gen.ts    # Claude API content generation
│   │   │   │   ├── topical-map.ts    # Clustering + mapping
│   │   │   │   ├── link-engine.ts    # Internal linking algorithm
│   │   │   │   ├── eeat-scorer.ts    # E-E-A-T scoring
│   │   │   │   ├── funnel-classifier.ts  # TOFU/MOFU/BOFU
│   │   │   │   └── schema-gen.ts     # JSON-LD generators
│   │   │   ├── db/
│   │   │   │   ├── schema.sql        # Full DB schema
│   │   │   │   ├── migrations/       # D1 migrations
│   │   │   │   └── queries.ts        # Prepared statements
│   │   │   ├── utils/
│   │   │   │   ├── cache.ts          # KV cache wrapper
│   │   │   │   ├── storage.ts        # R2 helpers
│   │   │   │   └── language.ts       # Language detection + i18n
│   │   │   └── types/
│   │   │       ├── project.ts
│   │   │       ├── keyword.ts
│   │   │       ├── article.ts
│   │   │       └── api-responses.ts
│   │   ├── wrangler.toml
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                          # Cloudflare Pages (frontend)
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── ui/               # shadcn components
│       │   │   ├── layout/
│       │   │   │   ├── Sidebar.tsx
│       │   │   │   ├── Header.tsx
│       │   │   │   └── Layout.tsx
│       │   │   ├── project/
│       │   │   │   ├── ProjectCard.tsx
│       │   │   │   └── ProjectForm.tsx
│       │   │   ├── topical-map/
│       │   │   │   ├── TopicalMapGraph.tsx    # ReactFlow
│       │   │   │   ├── ClusterNode.tsx
│       │   │   │   └── FunnelBadge.tsx
│       │   │   ├── calendar/
│       │   │   │   ├── ContentCalendar.tsx    # Kanban
│       │   │   │   └── BriefCard.tsx
│       │   │   ├── editor/
│       │   │   │   ├── ArticleEditor.tsx      # Monaco
│       │   │   │   ├── OptimizationPanel.tsx
│       │   │   │   └── LinkSuggestions.tsx
│       │   │   ├── gsc/
│       │   │   │   ├── KeywordTable.tsx
│       │   │   │   ├── TrendChart.tsx
│       │   │   │   └── OpportunityCards.tsx
│       │   │   └── links/
│       │   │       ├── LinkGraph.tsx
│       │   │       └── SuggestionList.tsx
│       │   ├── pages/
│       │   │   ├── Dashboard.tsx
│       │   │   ├── ProjectDetail.tsx
│       │   │   ├── TopicalMapView.tsx
│       │   │   ├── CalendarView.tsx
│       │   │   ├── ArticleList.tsx
│       │   │   ├── ArticleEditor.tsx
│       │   │   ├── GSCDashboard.tsx
│       │   │   ├── LinkGraphView.tsx
│       │   │   ├── PipelineStatus.tsx
│       │   │   └── Settings.tsx
│       │   ├── hooks/
│       │   │   ├── useProject.ts
│       │   │   ├── useArticles.ts
│       │   │   ├── useGSC.ts
│       │   │   └── usePipeline.ts
│       │   ├── lib/
│       │   │   ├── api-client.ts      # Fetch wrapper
│       │   │   └── utils.ts
│       │   └── styles/
│       │       └── globals.css
│       ├── index.html
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/                       # Tipos compartidos
│       ├── src/
│       │   ├── types.ts
│       │   └── constants.ts
│       ├── package.json
│       └── tsconfig.json
│
├── docs/
│   └── PLAN.md                       # Este documento
├── package.json                      # Monorepo root (npm workspaces)
├── turbo.json                        # Turborepo config
└── .gitignore
```

---

## 11. NeuronWriter API Integration

### Endpoints que usaremos

```typescript
// Base URL: https://app.neuronwriter.com/api/v1
// Auth: Header "X-API-KEY: <key>"

// 1. Crear análisis para un keyword
POST /content-editor
Body: { keyword: string, language: string, country: string }
Response: { id: string, status: 'processing' }

// 2. Obtener resultados del análisis
GET /content-editor/:id
Response: {
  nlp_terms: [{ term: string, count_recommended: number }],
  competitors: [{ url: string, score: number }],
  content_score: number,
  recommendations: [...]
}

// 3. Analizar contenido contra el análisis
POST /content-editor/:id/analyze
Body: { content: string }
Response: {
  score: number,
  missing_terms: [{ term: string, importance: string }],
  present_terms: [{ term: string, count: number }],
  recommendations: string[]
}
```

### Alternativa/Complemento: Build-your-own optimizer

Si NeuronWriter tiene límites de rate o quieres más control:

```typescript
// Construir TF-IDF propio con DataForSEO + Google NLP:
// 1. DataForSEO On-Page → Extraer términos TF-IDF del top 10
// 2. Google NLP → Extraer entidades del top 10
// 3. Comparar tu contenido vs average del top 10
// 4. Calcular score propio
```

---

## 12. Estimación de Desarrollo

| Fase | Tiempo estimado | Prioridad |
|------|----------------|-----------|
| Setup monorepo + Cloudflare + D1 schema | 1 sesión | P0 |
| Backend: Auth + Projects CRUD | 1 sesión | P0 |
| Services: Firecrawl + NLP integration | 1 sesión | P0 |
| Services: GSC integration | 1 sesión | P0 |
| Services: DataForSEO + Serper | 1 sesión | P0 |
| Topical Map engine | 2 sesiones | P0 |
| Content generation pipeline | 2 sesiones | P0 |
| NeuronWriter integration | 1 sesión | P1 |
| Internal linking engine | 1-2 sesiones | P1 |
| E-E-A-T scorer | 1 sesión | P1 |
| Workflows (pipeline orchestration) | 1 sesión | P1 |
| Frontend: Layout + Dashboard | 1 sesión | P1 |
| Frontend: Topical Map (ReactFlow) | 1-2 sesiones | P1 |
| Frontend: GSC Dashboard | 1 sesión | P2 |
| Frontend: Article Editor | 1-2 sesiones | P2 |
| Frontend: Link Graph | 1 sesión | P2 |
| Frontend: Content Calendar | 1 sesión | P2 |
| Testing + polish | 2 sesiones | P2 |

**Total estimado: ~20-25 sesiones de trabajo**

---

## 13. Orden de Implementación Recomendado

### Sprint 1: Foundation
1. Monorepo setup (Turborepo + npm workspaces)
2. Cloudflare Worker con Hono + D1 schema + migrations
3. Auth middleware + Projects CRUD
4. Frontend: Layout + Dashboard + Project form

### Sprint 2: Data Acquisition
5. Firecrawl service (crawl + extract)
6. Google NLP service (entities + categories)
7. GSC service (OAuth2 + data pull)
8. DataForSEO + Serper services
9. Cache layer (KV)

### Sprint 3: Intelligence
10. Topical Map engine (clustering + funnel mapping)
11. Content Planning + Priority Scoring
12. Brief Generator
13. Frontend: Topical Map (ReactFlow) + Calendar

### Sprint 4: Content
14. Content Generation (Claude API + SERP outline)
15. NeuronWriter integration
16. E-E-A-T scorer
17. Schema markup generator
18. Frontend: Article Editor + Optimization Panel

### Sprint 5: Linking & Polish
19. Internal Linking Engine
20. Cloudflare Workflows (full pipeline)
21. Frontend: Link Graph + GSC Dashboard
22. Export/Publish system
23. Testing + deployment

---

## 14. Decisiones Técnicas Clave

| Decisión | Elección | Razón |
|----------|---------|-------|
| Monorepo tool | Turborepo | Fast, Cloudflare compatible, npm workspaces |
| Backend framework | Hono | Built for Workers, tiny, fast, great DX |
| Database | D1 (SQLite) | Zero config, edge, free tier generous |
| Frontend framework | React + Vite | Ecosystem, shadcn/ui, community |
| Topical Map viz | ReactFlow | Interactive, customizable, React native |
| Editor | Monaco | VS Code engine, markdown support, extensible |
| Charts | Recharts | Simple, React, sufficient for GSC data |
| Styling | Tailwind + shadcn/ui | Rapid dev, dark mode, consistent |
| Routing | TanStack Router | Type-safe, file-based, modern |
| Data fetching | TanStack Query | Cache, optimistic updates, refetch |
