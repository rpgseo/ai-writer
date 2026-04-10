// ============================================================
// Funnel Stage Classification Rules
// ============================================================

export const FUNNEL_MODIFIERS: Record<string, string[]> = {
  tofu: [
    // Spanish
    'qué es', 'que es', 'cómo', 'como', 'guía', 'guia', 'tutorial',
    'beneficios', 'ventajas', 'tipos de', 'para qué sirve', 'significado',
    'ejemplos', 'definición', 'definicion', 'historia de', 'introducción',
    // English
    'what is', 'how to', 'guide', 'tutorial', 'benefits', 'types of',
    'meaning', 'examples', 'definition', 'introduction', 'why',
    // French
    'qu\'est-ce que', 'comment', 'guide', 'tutoriel', 'avantages',
    // German
    'was ist', 'wie', 'anleitung', 'vorteile',
    // Portuguese
    'o que é', 'como', 'guia', 'benefícios',
  ],
  mofu: [
    // Spanish
    'mejor', 'mejores', 'vs', 'versus', 'comparativa', 'comparación',
    'alternativas', 'top', 'review', 'diferencias', 'pros y contras',
    'ventajas y desventajas', 'opiniones', 'recomendaciones',
    // English
    'best', 'vs', 'versus', 'comparison', 'alternatives', 'top',
    'review', 'differences', 'pros and cons', 'recommendations',
    // French
    'meilleur', 'comparaison', 'alternatives', 'avis',
    // German
    'beste', 'vergleich', 'alternativen', 'bewertung',
    // Portuguese
    'melhor', 'comparação', 'alternativas', 'avaliação',
  ],
  bofu: [
    // Spanish
    'precio', 'precios', 'comprar', 'contratar', 'presupuesto',
    'descuento', 'oferta', 'plan', 'tarifas', 'gratis', 'prueba',
    'demo', 'cupón', 'cupon', 'donde comprar', 'tienda',
    // English
    'price', 'pricing', 'buy', 'purchase', 'hire', 'quote',
    'discount', 'deal', 'plan', 'free trial', 'demo', 'coupon',
    'where to buy', 'shop', 'order',
    // French
    'prix', 'acheter', 'tarif', 'réduction', 'essai gratuit',
    // German
    'preis', 'kaufen', 'angebot', 'rabatt', 'kostenlos',
    // Portuguese
    'preço', 'comprar', 'desconto', 'oferta', 'grátis',
  ],
};

// ============================================================
// Search Intent Classification
// ============================================================

export const INTENT_SIGNALS: Record<string, string[]> = {
  informational: [
    'qué', 'que', 'cómo', 'como', 'por qué', 'cuándo', 'cuando',
    'dónde', 'donde', 'quién', 'quien', 'what', 'how', 'why',
    'when', 'where', 'who', 'guide', 'tutorial', 'learn',
  ],
  commercial: [
    'mejor', 'best', 'top', 'review', 'vs', 'comparativa',
    'comparison', 'alternativas', 'alternatives', 'recomendaciones',
  ],
  transactional: [
    'comprar', 'buy', 'precio', 'price', 'descuento', 'discount',
    'contratar', 'hire', 'plan', 'pricing', 'order', 'pedir',
  ],
  navigational: [
    'login', 'acceder', 'entrar', 'sign in', 'dashboard',
    'portal', 'cuenta', 'account',
  ],
};

// ============================================================
// Content Format Detection
// ============================================================

export const FORMAT_SIGNALS: Record<string, string[]> = {
  'how-to': ['cómo', 'como', 'how to', 'pasos', 'steps', 'tutorial'],
  guide: ['guía', 'guia', 'guide', 'completa', 'complete', 'definitiva'],
  listicle: ['top', 'mejores', 'best', 'list', 'lista'],
  comparison: ['vs', 'versus', 'comparativa', 'comparison', 'diferencias'],
  review: ['review', 'opinión', 'opiniones', 'análisis', 'reseña'],
};

// ============================================================
// E-E-A-T Signal Patterns
// ============================================================

export const EEAT_EXPERIENCE_PATTERNS = [
  /\b(en mi experiencia|from my experience|i've found|he comprobado|personalmente)\b/i,
  /\b(hemos probado|we tested|we tried|probamos|usamos)\b/i,
  /\b(durante \d+ años|for \d+ years|over \d+ years)\b/i,
  /\b(en la práctica|in practice|real-world|caso real|case study)\b/i,
];

export const EEAT_EXPERTISE_PATTERNS = [
  /\b(según (el )?estudio|according to|research shows|studies show)\b/i,
  /\b(datos de|data from|estadísticas|statistics)\b/i,
  /\b(fuente|source|referencia|reference)\b/i,
];

export const EEAT_TRUST_PATTERNS = [
  /\b(actualizado|updated|última actualización|last updated)\b/i,
  /\b(nota:|disclaimer|aviso|advertencia|important:)\b/i,
  /\b(verificado|verified|revisado por|reviewed by)\b/i,
];

// ============================================================
// API Cache TTL (seconds)
// ============================================================

export const CACHE_TTL = {
  SERP_RESULTS: 86400,        // 24 hours
  KEYWORD_METRICS: 604800,     // 7 days
  NLP_ENTITIES: 2592000,       // 30 days
  GSC_DATA: 3600,              // 1 hour
  NW_ANALYSIS: 86400,          // 24 hours
  SITE_CRAWL: 604800,          // 7 days
} as const;

// ============================================================
// Pipeline Phase Names
// ============================================================

export const PIPELINE_PHASES = [
  'discovery',
  'gsc_intelligence',
  'topical_map',
  'content_planning',
  'content_generation',
  'optimization',
  'internal_linking',
  'export',
] as const;

export const PIPELINE_PHASE_LABELS: Record<string, string> = {
  discovery: 'Website Discovery',
  gsc_intelligence: 'GSC Intelligence',
  topical_map: 'Topical Map',
  content_planning: 'Content Planning',
  content_generation: 'Content Generation',
  optimization: 'Content Optimization',
  internal_linking: 'Internal Linking',
  export: 'Export & Publish',
};
