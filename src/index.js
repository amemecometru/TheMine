// The Mine API v2 — Multi-Platform Local Business Verification & Viability Scoring
// Any AI assistant (Muse, ChatGPT, Perplexity, Google, etc.) can query via API key.
// The Mine controls what each platform sees — curated results only, never raw data.

// ─── CATEGORY NORMALIZATION ───
// Maps various phrasings to canonical categories
const CATEGORY_MAP = {
  'painter': 'painter', 'painting': 'painter', 'house painter': 'painter', 'house painting': 'painter',
  'plumber': 'plumber', 'plumbing': 'plumber', 'plumbing repair': 'plumber',
  'electrician': 'electrician', 'electrical': 'electrician', 'electrical contractor': 'electrician',
  'hvac': 'hvac', 'ac repair': 'hvac', 'air conditioning': 'hvac', 'heating': 'hvac', 'heating and cooling': 'hvac',
  'roofer': 'roofer', 'roofing': 'roofer', 'roof repair': 'roofer', 'roofing contractor': 'roofer',
  'landscaping': 'landscaping', 'landscaper': 'landscaping', 'lawn care': 'landscaping', 'lawn service': 'landscaping',
  'handyman': 'handyman', 'handyman service': 'handyman', 'odd jobs': 'handyman',
  'general contractor': 'general_contractor', 'contractor': 'general_contractor', 'remodeling': 'general_contractor', 'remodel': 'general_contractor',
  'fencing': 'fencing', 'fence': 'fencing', 'fence installation': 'fencing', 'fence repair': 'fencing',
  'gutter': 'gutter', 'gutters': 'gutter', 'gutter repair': 'gutter', 'gutter cleaning': 'gutter',
  'tree removal': 'tree_removal', 'tree service': 'tree_removal', 'tree trimming': 'tree_removal',
  'foundation repair': 'foundation_repair', 'foundation': 'foundation_repair',
  'windows': 'windows', 'window installation': 'windows', 'window replacement': 'windows', 'siding': 'windows',
  'cleaning': 'cleaning', 'house cleaning': 'cleaning', 'cleaning service': 'cleaning',
  'pest control': 'pest_control', 'exterminator': 'pest_control',
  'flooring': 'flooring', 'floor installation': 'flooring', 'flooring contractor': 'flooring',
  'drywall': 'drywall', 'drywall repair': 'drywall', 'sheetrock': 'drywall',
  'babysitter': 'childcare', 'night sitter': 'childcare', 'childcare': 'childcare', 'baby sitting': 'childcare',
};

function normalizeCategory(input) {
  if (!input) return null;
  const lower = input.toLowerCase().trim();
  // Try exact match
  if (CATEGORY_MAP[lower]) return CATEGORY_MAP[lower];
  // Try partial match
  for (const [phrase, canonical] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(phrase)) return canonical;
  }
  return lower.replace(/\s+/g, '_');
}

function normalizeCity(input) {
  if (!input) return null;
  return input.toLowerCase().trim();
}

function normalizeState(input) {
  if (!input) return null;
  return input.toUpperCase().trim().slice(0, 2);
}

// ─── MAIN HANDLER ───

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ─── PUBLIC ROUTES (no auth) ───
      if (path === '/api/health' && method === 'GET') {
        return json({ status: 'ok', service: 'the-mine-api', version: '2.0', time: new Date().toISOString() }, corsHeaders);
      }

      // Root path → redirect to Cincinnati landing page
      // (Rename cincinnati.html to index.html to skip this redirect)
      if (path === '/' && method === 'GET') {
        return Response.redirect(new URL('/cincinnati.html', url).toString(), 302);
      }

      // ─── PUBLIC SUBSCRIBE (no auth — landing page form) ───
      if (path === '/api/subscribe' && method === 'POST') {
        return handleSubscribe(request, env, corsHeaders);
      }

      // ─── PUBLIC SOCIAL POST (no auth — generates shareable content) ───
      if (path === '/api/social/post' && method === 'GET') {
        return handleSocialPost(url, env, corsHeaders);
      }

      // ─── AUTHENTICATED ROUTES ───
      // All other routes require a valid API key
      const authResult = await authenticate(request, env);
      if (authResult.error) {
        return json({ error: 'Unauthorized', message: authResult.error }, corsHeaders, 401);
      }

      const { apiKey, platform, permissions } = authResult;

      // Rate limiting check
      const rateLimit = await checkRateLimit(env, apiKey.id, apiKey.rate_limit_per_hour);
      if (rateLimit.exceeded) {
        return json({ error: 'Rate limit exceeded', limit: apiKey.rate_limit_per_hour, window: '1 hour' }, corsHeaders, 429);
      }

      // ─── ADMIN ROUTES (require admin permission) ───
      if (path === '/api/keys' && method === 'POST' && permissions === 'admin') {
        return handleCreateKey(request, env, corsHeaders);
      }

      if (path === '/api/keys' && method === 'GET' && permissions === 'admin') {
        return handleListKeys(env, corsHeaders);
      }

      // ─── SEARCH (any platform's main entry point) ───
      // GET /api/search?category=painter&city=Cincinnati&state=OH&limit=3&min_score=50
      if (path === '/api/search' && method === 'GET') {
        return handleSearch(url, env, corsHeaders, platform, apiKey.id);
      }

      // ─── CATEGORIES (demand data per city) ───
      // GET /api/categories?city=Cincinnati&state=OH
      if (path === '/api/categories' && method === 'GET') {
        return handleCategories(url, env, corsHeaders);
      }

      // ─── STATS ───
      if (path === '/api/stats' && method === 'GET') {
        return handleStats(env, corsHeaders);
      }

      // ─── BUSINESSES ───
      if (path === '/api/businesses' && method === 'GET') {
        return handleListBusinesses(url, env, corsHeaders);
      }

      if (path === '/api/businesses' && method === 'POST' && (permissions === 'write' || permissions === 'admin')) {
        return handleCreateBusiness(request, env, corsHeaders, platform);
      }

      // /api/businesses/:id
      const bizMatch = path.match(/^\/api\/businesses\/(\d+)$/);
      if (bizMatch && method === 'GET') {
        return handleGetBusiness(bizMatch[1], env, corsHeaders);
      }

      // /api/businesses/:id/verify (write or admin)
      const verifyMatch = path.match(/^\/api\/businesses\/(\d+)\/verify$/);
      if (verifyMatch && method === 'POST' && (permissions === 'write' || permissions === 'admin')) {
        return handleAddVerification(verifyMatch[1], request, env, corsHeaders);
      }

      // /api/businesses/:id/score (write or admin)
      const scoreMatch = path.match(/^\/api\/businesses\/(\d+)\/score$/);
      if (scoreMatch && method === 'POST' && (permissions === 'write' || permissions === 'admin')) {
        return handleAddSignal(scoreMatch[1], request, env, corsHeaders);
      }

      // ─── SCRAPE LOGS (write or admin) ───
      if (path === '/api/scrape/log' && method === 'POST' && (permissions === 'write' || permissions === 'admin')) {
        return handleScrapeLog(request, env, corsHeaders);
      }

      // ─── PLATFORM QUERY LOG (any authenticated) ───
      if (path === '/api/query/log' && method === 'POST') {
        return handleLogQuery(request, env, corsHeaders, platform, apiKey.id);
      }

      // ─── OUTREACH (contractor email campaigns) ───
      // POST /api/outreach/send — send an outreach email to a business (write/admin)
      if (path === '/api/outreach/send' && method === 'POST' && (permissions === 'write' || permissions === 'admin')) {
        return handleSendOutreach(request, env, corsHeaders, platform);
      }

      // GET /api/outreach — list outreach campaigns (read)
      if (path === '/api/outreach' && method === 'GET') {
        return handleListOutreach(url, env, corsHeaders);
      }

      // GET /api/outreach/:id — get a specific outreach campaign
      const outreachMatch = path.match(/^\/api\/outreach\/(\d+)$/);
      if (outreachMatch && method === 'GET') {
        return handleGetOutreach(outreachMatch[1], env, corsHeaders);
      }

      // POST /api/outreach/:id/respond — update outreach response status (write/admin)
      const outreachRespondMatch = path.match(/^\/api\/outreach\/(\d+)\/respond$/);
      if (outreachRespondMatch && method === 'POST' && (permissions === 'write' || permissions === 'admin')) {
        return handleOutreachRespond(outreachRespondMatch[1], request, env, corsHeaders);
      }

      // POST /api/businesses/:id/outreach — send outreach to a specific business (write/admin)
      const bizOutreachMatch = path.match(/^\/api\/businesses\/(\d+)\/outreach$/);
      if (bizOutreachMatch && method === 'POST' && (permissions === 'write' || permissions === 'admin')) {
        return handleSendOutreachToBusiness(bizOutreachMatch[1], request, env, corsHeaders, platform);
      }

      // ─── SUBSCRIBERS (admin) ───
      if (path === '/api/subscribers' && method === 'GET' && permissions === 'admin') {
        return handleListSubscribers(url, env, corsHeaders);
      }

      // ─── SOCIAL POSTS (admin) ───
      if (path === '/api/social/posts' && method === 'GET' && permissions === 'admin') {
        return handleListSocialPosts(url, env, corsHeaders);
      }

      // POST /api/social/schedule — schedule/log a social post (write/admin)
      if (path === '/api/social/schedule' && method === 'POST' && (permissions === 'write' || permissions === 'admin')) {
        return handleScheduleSocialPost(request, env, corsHeaders);
      }

      // ─── NON-API ROUTES — fall through to static assets ───
      // With run_worker_first = ["/api", "/api/*"], non-API routes serve assets first.
      // The Worker only reaches here if no static asset matched.
      if (!path.startsWith('/api')) {
        // Try serving from assets (e.g., cincinnati.html, index.html)
        if (env.ASSETS) {
          return env.ASSETS.fetch(request);
        }
        return new Response('Not found', { status: 404 });
      }

      return json({ error: 'Not found', path }, corsHeaders, 404);
    } catch (err) {
      return json({ error: 'Internal error', message: err.message }, corsHeaders, 500);
    }
  }
};

// ─── AUTHENTICATION ───

async function authenticate(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Missing or invalid Authorization header. Use: Bearer <api-key>' };
  }

  const key = authHeader.replace('Bearer ', '').trim();

  // Check against D1 api_keys table
  const apiKey = await env.THE_MINE_DB.prepare(
    `SELECT * FROM api_keys WHERE key = ? AND is_active = 1`
  ).bind(key).first();

  if (!apiKey) {
    return { error: 'Invalid or revoked API key' };
  }

  // Update last_used_at
  await env.THE_MINE_DB.prepare(
    `UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`
  ).bind(apiKey.id).run();

  return {
    apiKey,
    platform: apiKey.platform,
    permissions: apiKey.permissions,
  };
}

// ─── RATE LIMITING (KV-based, per key per hour) ───

async function checkRateLimit(env, keyId, limit) {
  const hourKey = `ratelimit:${keyId}:${new Date().toISOString().slice(0, 13)}`; // e.g. "ratelimit:5:2026-10-22T14"
  const current = parseInt((await env.CACHE.get(hourKey)) || '0');

  if (current >= limit) {
    return { exceeded: true, current };
  }

  await env.CACHE.put(hourKey, String(current + 1), { expirationTtl: 3600 });
  return { exceeded: false, current: current + 1 };
}

// ─── SEARCH HANDLER (with caching + normalization) ───

async function handleSearch(url, env, corsHeaders, platform, keyId) {
  const rawCategory = url.searchParams.get('category');
  const rawCity = url.searchParams.get('city');
  const rawState = url.searchParams.get('state');
  const limit = parseInt(url.searchParams.get('limit') || '3');
  const minScore = parseFloat(url.searchParams.get('min_score') || '50');

  // Normalize inputs
  const category = normalizeCategory(rawCategory);
  const city = normalizeCity(rawCity);
  const state = normalizeState(rawState);

  // Check KV cache first
  const cacheKey = `search:${category || 'all'}:${city || 'all'}:${state || 'all'}:${minScore}:${limit}`;
  const cached = await env.CACHE.get(cacheKey);
  if (cached) {
    const data = JSON.parse(cached);
    // Still log the query even on cache hit
    await logQuery(env, platform, keyId, rawCategory, rawCity, rawState, category, city, state, data.count, data.businesses);
    return json({ ...data, cached: true, platform }, corsHeaders);
  }

  let sql = `SELECT id, name, category, phone, email, website, address, city, state, zip,
             viability_score, is_viable, status, tags
             FROM businesses WHERE is_viable = 1 AND viability_score >= ?`;
  const params = [minScore];

  if (category) { sql += ` AND LOWER(category) = LOWER(?)`; params.push(category); }
  if (city) { sql += ` AND LOWER(city) = LOWER(?)`; params.push(city); }
  if (state) { sql += ` AND LOWER(state) = LOWER(?)`; params.push(state); }

  sql += ` ORDER BY viability_score DESC LIMIT ?`;
  params.push(limit);

  const result = await env.THE_MINE_DB.prepare(sql).bind(...params).all();

  const responseData = {
    query: { category, city, state, min_score: minScore, limit },
    count: result.results.length,
    businesses: result.results,
    platform,
  };

  // Cache for 1 hour
  await env.CACHE.put(cacheKey, JSON.stringify(responseData), { expirationTtl: 3600 });

  // Log the query
  await logQuery(env, platform, keyId, rawCategory, rawCity, rawState, category, city, state, result.results.length, result.results);

  // Update category demand
  if (category && city) {
    await env.THE_MINE_DB.prepare(
      `INSERT INTO category_demand (category, city, state, query_count, last_queried)
       VALUES (?, ?, ?, 1, datetime('now'))
       ON CONFLICT(category, city, state)
       DO UPDATE SET query_count = query_count + 1, last_queried = datetime('now')`
    ).bind(category, city, state).run();
  }

  return json(responseData, corsHeaders);
}

async function logQuery(env, platform, keyId, rawCategory, rawCity, rawState, normCategory, normCity, normState, resultCount, businesses) {
  await env.THE_MINE_DB.prepare(
    `INSERT INTO platform_queries (platform, query_text, normalized_category, normalized_city, normalized_state, category, city, result_count, businesses_returned, api_key_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    platform,
    `find ${rawCategory || 'service'} in ${rawCity || ''}${rawState ? ', ' + rawState : ''}`,
    normCategory, normCity, normState,
    rawCategory, rawCity, resultCount,
    JSON.stringify(businesses.map(b => b.id)),
    keyId
  ).run();
}

// ─── CATEGORIES ENDPOINT ───

async function handleCategories(url, env, corsHeaders) {
  const city = normalizeCity(url.searchParams.get('city'));
  const state = normalizeState(url.searchParams.get('state'));

  let sql = `SELECT category, city, state, query_count, last_queried FROM category_demand WHERE 1=1`;
  const params = [];
  if (city) { sql += ` AND LOWER(city) = LOWER(?)`; params.push(city); }
  if (state) { sql += ` AND LOWER(state) = LOWER(?)`; params.push(state); }
  sql += ` ORDER BY query_count DESC LIMIT 50`;

  const result = await env.THE_MINE_DB.prepare(sql).bind(...params).all();

  // Also return all categories we have businesses for in this city
  let bizSql = `SELECT category, COUNT(*) as business_count, SUM(CASE WHEN is_viable = 1 THEN 1 ELSE 0 END) as viable_count
                FROM businesses WHERE 1=1`;
  const bizParams = [];
  if (city) { bizSql += ` AND LOWER(city) = LOWER(?)`; bizParams.push(city); }
  if (state) { bizSql += ` AND LOWER(state) = LOWER(?)`; bizParams.push(state); }
  bizSql += ` GROUP BY category ORDER BY business_count DESC`;
  const bizResult = await env.THE_MINE_DB.prepare(bizSql).bind(...bizParams).all();

  return json({
    demand: result.results,
    available: bizResult.results,
  }, corsHeaders);
}

// ─── API KEY MANAGEMENT ───

async function handleCreateKey(request, env, corsHeaders) {
  const body = await request.json();

  // Generate a random API key
  const key = `mine_${crypto.randomUUID().replace(/-/g, '')}`;

  const result = await env.THE_MINE_DB.prepare(
    `INSERT INTO api_keys (key, platform, permissions, rate_limit_per_hour)
     VALUES (?, ?, ?, ?)`
  ).bind(
    key,
    body.platform,
    body.permissions || 'read',
    body.rate_limit_per_hour || 100
  ).run();

  return json({
    id: result.meta.last_row_id,
    key,
    platform: body.platform,
    permissions: body.permissions || 'read',
    rate_limit_per_hour: body.rate_limit_per_hour || 100,
    message: 'API key created. Store this key securely — it will not be shown again.'
  }, corsHeaders, 201);
}

async function handleListKeys(env, corsHeaders) {
  const result = await env.THE_MINE_DB.prepare(
    `SELECT id, platform, permissions, rate_limit_per_hour, is_active, created_at, last_used_at
     FROM api_keys ORDER BY created_at DESC`
  ).all();

  return json({ keys: result.results }, corsHeaders);
}

// ─── BUSINESS HANDLERS ───

async function handleListBusinesses(url, env, corsHeaders) {
  const city = url.searchParams.get('city');
  const category = url.searchParams.get('category');
  const status = url.searchParams.get('status');
  const viableOnly = url.searchParams.get('viable') === '1';
  const limit = parseInt(url.searchParams.get('limit') || '50');

  let sql = `SELECT * FROM businesses WHERE 1=1`;
  const params = [];

  if (city) { sql += ` AND LOWER(city) = LOWER(?)`; params.push(city); }
  if (category) { sql += ` AND LOWER(category) = LOWER(?)`; params.push(category); }
  if (status) { sql += ` AND status = ?`; params.push(status); }
  if (viableOnly) { sql += ` AND is_viable = 1`; }

  sql += ` ORDER BY viability_score DESC LIMIT ?`;
  params.push(limit);

  const result = await env.THE_MINE_DB.prepare(sql).bind(...params).all();
  return json({ count: result.results.length, businesses: result.results }, corsHeaders);
}

async function handleCreateBusiness(request, env, corsHeaders, platform) {
  const body = await request.json();

  const result = await env.THE_MINE_DB.prepare(
    `INSERT INTO businesses (name, category, subcategory, phone, email, website, address, city, state, zip, lat, lng, source, source_url, facebook_url, instagram_url, google_place_id, status, notes, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    body.name, body.category, body.subcategory || null, body.phone, body.email,
    body.website, body.address, body.city, body.state, body.zip,
    body.lat || null, body.lng || null, body.source || platform, body.source_url,
    body.facebook_url, body.instagram_url, body.google_place_id,
    body.status || 'unverified', body.notes, body.tags
  ).run();

  return json({ id: result.meta.last_row_id, message: 'Business created' }, corsHeaders, 201);
}

async function handleGetBusiness(id, env, corsHeaders) {
  const biz = await env.THE_MINE_DB.prepare(`SELECT * FROM businesses WHERE id = ?`).bind(id).first();
  if (!biz) return json({ error: 'Business not found' }, corsHeaders, 404);

  const verifications = await env.THE_MINE_DB.prepare(
    `SELECT * FROM verifications WHERE business_id = ? ORDER BY verified_at DESC`
  ).bind(id).all();

  const signals = await env.THE_MINE_DB.prepare(
    `SELECT * FROM viability_signals WHERE business_id = ? ORDER BY recorded_at DESC`
  ).bind(id).all();

  return json({ business: biz, verifications: verifications.results, signals: signals.results }, corsHeaders);
}

async function handleAddVerification(id, request, env, corsHeaders) {
  const body = await request.json();

  await env.THE_MINE_DB.prepare(
    `INSERT INTO verifications (business_id, verification_type, verified_by, result, details, evidence_url)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    id, body.verification_type, body.verified_by || 'agent',
    body.result || 'unknown', JSON.stringify(body.details || {}), body.evidence_url
  ).run();

  if (body.verification_type === 'field_visit' && body.result === 'pass') {
    await env.THE_MINE_DB.prepare(
      `UPDATE businesses SET status = 'verified', updated_at = datetime('now') WHERE id = ?`
    ).bind(id).run();
  }

  return json({ message: 'Verification recorded' }, corsHeaders, 201);
}

async function handleAddSignal(id, request, env, corsHeaders) {
  const body = await request.json();

  await env.THE_MINE_DB.prepare(
    `INSERT INTO viability_signals (business_id, signal_name, signal_value, signal_weight, points)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(
    id, body.signal_name, body.signal_value, body.signal_weight || 1.0, body.points || 0
  ).run();

  const signals = await env.THE_MINE_DB.prepare(
    `SELECT COALESCE(SUM(points * signal_weight), 0) as total_weighted,
            COALESCE(SUM(signal_weight), 0) as total_weight
     FROM viability_signals WHERE business_id = ?`
  ).bind(id).first();

  const score = signals.total_weight > 0
    ? Math.min(100, (signals.total_weighted / signals.total_weight) * 100)
    : 0;

  const isViable = score >= 50 ? 1 : 0;

  await env.THE_MINE_DB.prepare(
    `UPDATE businesses SET viability_score = ?, is_viable = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(score, isViable, id).run();

  // Invalidate cache for this business's categories
  await invalidateCache(env, id);

  return json({ viability_score: score, is_viable: isViable, message: 'Signal recorded and score updated' }, corsHeaders);
}

async function handleScrapeLog(request, env, corsHeaders) {
  const body = await request.json();

  await env.THE_MINE_DB.prepare(
    `INSERT INTO scrape_logs (source, city, category, query, results_found, results_ingested, status, error, started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    body.source, body.city, body.category, body.query,
    body.results_found || 0, body.results_ingested || 0,
    body.status || 'completed', body.error, body.started_at, body.completed_at
  ).run();

  return json({ message: 'Scrape log recorded' }, corsHeaders, 201);
}

async function handleLogQuery(request, env, corsHeaders, platform, keyId) {
  const body = await request.json();

  const result = await env.THE_MINE_DB.prepare(
    `INSERT INTO platform_queries (platform, query_text, normalized_category, normalized_city, normalized_state, category, city, result_count, businesses_returned, api_key_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    platform, body.query_text,
    normalizeCategory(body.category), normalizeCity(body.city), normalizeState(body.state),
    body.category, body.city,
    body.result_count || 0,
    JSON.stringify(body.businesses_returned || []),
    keyId
  ).run();

  return json({ id: result.meta.last_row_id, message: 'Query logged' }, corsHeaders, 201);
}

// ─── STATS ───

async function handleStats(env, corsHeaders) {
  const total = await env.THE_MINE_DB.prepare(`SELECT COUNT(*) as count FROM businesses`).first();
  const verified = await env.THE_MINE_DB.prepare(`SELECT COUNT(*) as count FROM businesses WHERE status = 'verified'`).first();
  const viable = await env.THE_MINE_DB.prepare(`SELECT COUNT(*) as count FROM businesses WHERE is_viable = 1`).first();

  const byCity = await env.THE_MINE_DB.prepare(
    `SELECT city, state, COUNT(*) as count, SUM(CASE WHEN is_viable = 1 THEN 1 ELSE 0 END) as viable_count
     FROM businesses GROUP BY city, state ORDER BY count DESC LIMIT 20`
  ).all();

  const byCategory = await env.THE_MINE_DB.prepare(
    `SELECT category, COUNT(*) as count, SUM(CASE WHEN is_viable = 1 THEN 1 ELSE 0 END) as viable_count
     FROM businesses GROUP BY category ORDER BY count DESC LIMIT 20`
  ).all();

  // Per-platform query stats
  const byPlatform = await env.THE_MINE_DB.prepare(
    `SELECT platform, COUNT(*) as query_count, MAX(created_at) as last_query
     FROM platform_queries GROUP BY platform ORDER BY query_count DESC`
  ).all();

  const totalQueries = await env.THE_MINE_DB.prepare(`SELECT COUNT(*) as count FROM platform_queries`).first();

  const activeKeys = await env.THE_MINE_DB.prepare(`SELECT COUNT(*) as count FROM api_keys WHERE is_active = 1`).first();

  return json({
    total_businesses: total.count,
    verified: verified.count,
    viable: viable.count,
    total_queries: totalQueries.count,
    active_api_keys: activeKeys.count,
    by_city: byCity.results,
    by_category: byCategory.results,
    by_platform: byPlatform.results,
  }, corsHeaders);
}

// ─── CACHE HELPERS ───

async function invalidateCache(env, businessId) {
  // Get the business's category and city, then delete matching cache keys
  const biz = await env.THE_MINE_DB.prepare(`SELECT category, city, state FROM businesses WHERE id = ?`).bind(businessId).first();
  if (!biz) return;

  // KV doesn't support prefix deletion easily, so we set a short TTL and let it expire.
  // For a more robust solution, use a cache version key.
  const versionKey = `cache_version:${biz.category}:${biz.city}`;
  await env.CACHE.put(versionKey, String(Date.now()), { expirationTtl: 3600 });
}

// ─── OUTREACH HANDLERS ───

// Email templates for contractor outreach
function buildOutreachEmail(business, template = 'initial_outreach') {
  const templates = {
    initial_outreach: {
      subject: `${business.name} — You've been verified as a top ${business.category} in ${business.city}`,
      html: `<div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #1a1a1a;">Hi ${business.name} team,</h2>
  <p>We're <strong>The Mine</strong> — a verified local business database that AI assistants (like Meta's Muse, ChatGPT, and others) use to recommend trusted contractors to homeowners.</p>
  <p>Our field research in ${business.city}, ${business.state} has identified <strong>${business.name}</strong> as a top-rated ${business.category} based on:</p>
  <ul style="color: #444;">
    <li>Verified business operations and contact info</li>
    <li>Active website and professional presence</li>
    <li>Positive reputation signals</li>
    <li>Local field verification</li>
  </ul>
  <p>When a homeowner asks an AI assistant for a ${business.category} in ${business.city}, we want to recommend <strong>you</strong>.</p>
  <p><strong>What this means for you:</strong></p>
  <ul style="color: #444;">
    <li>Free listing in our verified contractor network</li>
    <li>Direct referrals from AI assistant queries in your area</li>
    <li>Priority placement when homeowners search for your services</li>
  </ul>
  <p>There's no cost to be listed — we verify and recommend businesses that are already doing great work. If you'd like to be included, just reply to this email.</p>
  <p>Best regards,<br>The Mine Team<br>mine.logiclemonai.com</p>
</div>`,
      text: `Hi ${business.name} team,

We're The Mine — a verified local business database that AI assistants (like Meta's Muse, ChatGPT, and others) use to recommend trusted contractors to homeowners.

Our field research in ${business.city}, ${business.state} has identified ${business.name} as a top-rated ${business.category} based on:
- Verified business operations and contact info
- Active website and professional presence
- Positive reputation signals
- Local field verification

When a homeowner asks an AI assistant for a ${business.category} in ${business.city}, we want to recommend you.

What this means for you:
- Free listing in our verified contractor network
- Direct referrals from AI assistant queries in your area
- Priority placement when homeowners search for your services

There's no cost to be listed — we verify and recommend businesses that are already doing great work. If you'd like to be included, just reply to this email.

Best regards,
The Mine Team
mine.logiclemonai.com`,
    },
    follow_up: {
      subject: `Following up — ${business.name} verified as a top ${business.category} in ${business.city}`,
      html: `<div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #1a1a1a;">Hi ${business.name} team,</h2>
  <p>Just following up on our previous email — we'd love to include <strong>${business.name}</strong> in our verified contractor network for ${business.city}.</p>
  <p>Homeowners are actively using AI assistants to find ${business.category}s in your area, and we want to make sure they find you.</p>
  <p>Reply to this email to get set up — it takes 2 minutes and there's no cost.</p>
  <p>Best regards,<br>The Mine Team</p>
</div>`,
      text: `Hi ${business.name} team,

Just following up on our previous email — we'd love to include ${business.name} in our verified contractor network for ${business.city}.

Homeowners are actively using AI assistants to find ${business.category}s in your area, and we want to make sure they find you.

Reply to this email to get set up — it takes 2 minutes and there's no cost.

Best regards,
The Mine Team`,
    },
  };

  return templates[template] || templates.initial_outreach;
}

async function handleSendOutreach(request, env, corsHeaders, platform) {
  const body = await request.json();
  const businessId = body.business_id;
  const template = body.template || 'initial_outreach';
  const emailTo = body.email_to;

  // Get the business
  const business = await env.THE_MINE_DB.prepare(
    `SELECT * FROM businesses WHERE id = ?`
  ).bind(businessId).first();

  if (!business) return json({ error: 'Business not found' }, corsHeaders, 404);

  // Determine email address
  const toEmail = emailTo || business.email;
  if (!toEmail) return json({ error: 'No email address available for this business. Provide email_to in the request.' }, corsHeaders, 400);

  // Build email from template
  const email = buildOutreachEmail(business, template);

  // Send the email via Cloudflare Email Sending
  let messageId = null;
  let sendStatus = 'sent';
  let sendError = null;

  try {
    const sendResult = await env.EMAIL.send({
      to: toEmail,
      from: `outreach@mine.logiclemonai.com`,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    messageId = sendResult.messageId;
  } catch (err) {
    sendStatus = 'failed';
    sendError = err.message;
  }

  // Log the outreach campaign
  const result = await env.THE_MINE_DB.prepare(
    `INSERT INTO outreach_campaigns (business_id, email_to, email_from, subject, body_text, body_html, template, status, message_id, sent_by, sent_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`
  ).bind(
    businessId, toEmail, 'outreach@mine.logiclemonai.com',
    email.subject, email.text, email.html, template,
    sendStatus, messageId, platform, sendError
  ).run();

  return json({
    id: result.meta.last_row_id,
    business_id: businessId,
    email_to: toEmail,
    subject: email.subject,
    status: sendStatus,
    message_id: messageId,
    error: sendError,
  }, corsHeaders, 201);
}

async function handleSendOutreachToBusiness(businessId, request, env, corsHeaders, platform) {
  const body = await request.json().catch(() => ({}));
  const template = body.template || 'initial_outreach';
  const emailTo = body.email_to;

  const business = await env.THE_MINE_DB.prepare(
    `SELECT * FROM businesses WHERE id = ?`
  ).bind(businessId).first();

  if (!business) return json({ error: 'Business not found' }, corsHeaders, 404);

  const toEmail = emailTo || business.email;
  if (!toEmail) return json({ error: 'No email address available. Provide email_to in the request body.' }, corsHeaders, 400);

  const email = buildOutreachEmail(business, template);

  let messageId = null;
  let sendStatus = 'sent';
  let sendError = null;

  try {
    const sendResult = await env.EMAIL.send({
      to: toEmail,
      from: `outreach@mine.logiclemonai.com`,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    messageId = sendResult.messageId;
  } catch (err) {
    sendStatus = 'failed';
    sendError = err.message;
  }

  const result = await env.THE_MINE_DB.prepare(
    `INSERT INTO outreach_campaigns (business_id, email_to, email_from, subject, body_text, body_html, template, status, message_id, sent_by, sent_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`
  ).bind(
    businessId, toEmail, 'outreach@mine.logiclemonai.com',
    email.subject, email.text, email.html, template,
    sendStatus, messageId, platform, sendError
  ).run();

  return json({
    id: result.meta.last_row_id,
    business_id: businessId,
    email_to: toEmail,
    subject: email.subject,
    status: sendStatus,
    message_id: messageId,
    error: sendError,
  }, corsHeaders, 201);
}

async function handleListOutreach(url, env, corsHeaders) {
  const status = url.searchParams.get('status');
  const businessId = url.searchParams.get('business_id');
  const limit = parseInt(url.searchParams.get('limit') || '50');

  let sql = `SELECT oc.*, b.name as business_name, b.category, b.city
             FROM outreach_campaigns oc
             JOIN businesses b ON oc.business_id = b.id
             WHERE 1=1`;
  const params = [];

  if (status) { sql += ` AND oc.status = ?`; params.push(status); }
  if (businessId) { sql += ` AND oc.business_id = ?`; params.push(businessId); }

  sql += ` ORDER BY oc.created_at DESC LIMIT ?`;
  params.push(limit);

  const result = await env.THE_MINE_DB.prepare(sql).bind(...params).all();
  return json({ count: result.results.length, campaigns: result.results }, corsHeaders);
}

async function handleGetOutreach(id, env, corsHeaders) {
  const campaign = await env.THE_MINE_DB.prepare(
    `SELECT oc.*, b.name as business_name, b.category, b.city, b.phone
     FROM outreach_campaigns oc
     JOIN businesses b ON oc.business_id = b.id
     WHERE oc.id = ?`
  ).bind(id).first();

  if (!campaign) return json({ error: 'Outreach campaign not found' }, corsHeaders, 404);
  return json({ campaign }, corsHeaders);
}

async function handleOutreachRespond(id, request, env, corsHeaders) {
  const body = await request.json();

  await env.THE_MINE_DB.prepare(
    `UPDATE outreach_campaigns
     SET status = ?, response_status = ?, responded_at = datetime('now'), notes = ?
     WHERE id = ?`
  ).bind(
    body.status || 'responded',
    body.response_status || 'interested',
    body.notes,
    id
  ).run();

  return json({ id, message: 'Outreach response updated' }, corsHeaders);
}

// ─── SUBSCRIBE HANDLER (public — landing page form) ───

async function handleSubscribe(request, env, corsHeaders) {
  let body;
  try {
    body = await request.json();
  } catch {
    // Handle form-encoded data from HTML forms
    const formData = await request.formData();
    body = {
      email: formData.get('email'),
      name: formData.get('name'),
      city: formData.get('city'),
      state: formData.get('state'),
      interests: formData.get('interests'),
      source: formData.get('source') || 'landing_page',
    };
  }

  if (!body.email) {
    return json({ error: 'Email is required' }, corsHeaders, 400);
  }

  // Get IP for tracking
  const ip = request.headers.get('CF-Connecting-IP') || null;

  try {
    await env.THE_MINE_DB.prepare(
      `INSERT INTO subscribers (email, name, city, state, interests, source, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         name = COALESCE(excluded.name, name),
         city = COALESCE(excluded.city, city),
         state = COALESCE(excluded.state, state),
         interests = COALESCE(excluded.interests, interests),
         updated_at = datetime('now')`
    ).bind(
      body.email, body.name || null, body.city || null,
      body.state || null, body.interests || null,
      body.source || 'landing_page', ip
    ).run();

    return json({ status: 'subscribed', email: body.email, message: 'You\'re on the list! We\'ll notify you when we verify new contractors in your area.' }, corsHeaders, 201);
  } catch (err) {
    return json({ error: 'Subscription failed', message: err.message }, corsHeaders, 500);
  }
}

// ─── SUBSCRIBERS LIST (admin) ───

async function handleListSubscribers(url, env, corsHeaders) {
  const city = url.searchParams.get('city');
  const status = url.searchParams.get('status') || 'active';
  const limit = parseInt(url.searchParams.get('limit') || '100');

  let sql = `SELECT * FROM subscribers WHERE status = ?`;
  const params = [status];
  if (city) { sql += ` AND LOWER(city) = LOWER(?)`; params.push(city); }
  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const result = await env.THE_MINE_DB.prepare(sql).bind(...params).all();

  // Also get subscriber count by city
  const byCity = await env.THE_MINE_DB.prepare(
    `SELECT city, COUNT(*) as count FROM subscribers WHERE status = 'active' GROUP BY city ORDER BY count DESC`
  ).all();

  return json({
    count: result.results.length,
    subscribers: result.results,
    by_city: byCity.results,
  }, corsHeaders);
}

// ─── SOCIAL POST GENERATOR (public) ───

async function handleSocialPost(url, env, corsHeaders) {
  const businessId = url.searchParams.get('business_id');
  const platform = url.searchParams.get('platform') || 'facebook';
  const postType = url.searchParams.get('type') || 'verified_business';
  const city = url.searchParams.get('city');
  const category = url.searchParams.get('category');

  // If business_id provided, generate a post for that business
  if (businessId) {
    const biz = await env.THE_MINE_DB.prepare(
      `SELECT * FROM businesses WHERE id = ? AND is_viable = 1`
    ).bind(businessId).first();

    if (!biz) return json({ error: 'Business not found or not viable' }, corsHeaders, 404);

    const post = generateSocialPost(biz, platform);
    return json({ platform, post_type: postType, business: { id: biz.id, name: biz.name }, content: post }, corsHeaders);
  }

  // If no business_id, generate a weekly roundup post for a city/category
  if (city || category) {
    let sql = `SELECT * FROM businesses WHERE is_viable = 1`;
    const params = [];
    if (city) { sql += ` AND LOWER(city) = LOWER(?)`; params.push(city); }
    if (category) { sql += ` AND LOWER(category) = LOWER(?)`; params.push(normalizeCategory(category)); }
    sql += ` ORDER BY viability_score DESC LIMIT 3`;

    const result = await env.THE_MINE_DB.prepare(sql).bind(...params).all();

    if (result.results.length === 0) {
      return json({ error: 'No verified businesses found for this query' }, corsHeaders, 404);
    }

    const post = generateRoundupPost(result.results, city, category, platform);
    return json({ platform, post_type: 'weekly_roundup', count: result.results.length, content: post }, corsHeaders);
  }

  return json({ error: 'Provide business_id or city/category parameters' }, corsHeaders, 400);
}

function generateSocialPost(biz, platform) {
  const score = Math.round(biz.viability_score);
  const tags = biz.tags ? biz.tags.split(',').map(t => `✅ ${t.trim()}`).join('\n') : '';
  const siteUrl = 'mine.logiclemonai.com';

  if (platform === 'instagram') {
    return `🏠 Verified ${biz.category} in ${biz.city}, ${biz.state}:

${biz.name}
${biz.phone ? '📞 ' + biz.phone : ''}
${biz.website ? '🌐 ' + biz.website : ''}

${tags}

Viability Score: ${score}/100

Need a ${biz.category} in ${biz.city}? Ask any AI assistant for The Mine's verified recommendation, or visit ${siteUrl}

#TheMine #${biz.city}Contractors #${biz.category} #Verified #HomeImprovement`;
  }

  if (platform === 'twitter') {
    return `🏠 Verified ${biz.category} in ${biz.city}: ${biz.name}
Viability Score: ${score}/100
${tags ? tags.split('\n')[0] : '✅ Field-verified'}

Need a ${biz.category}? Ask any AI assistant for The Mine's verified recommendation.
${siteUrl}`;
  }

  // Default: Facebook (longer, more detailed)
  return `🏠 Verified ${biz.category} of the Week in ${biz.city}, ${biz.state}:

${biz.name}
${biz.phone ? '📞 ' + biz.phone : ''}
${biz.website ? '🌐 ' + biz.website : ''}
${biz.address ? '📍 ' + biz.address : ''}

${tags ? 'What we verified:\n' + tags : ''}

Viability Score: ${score}/100

We don't just list businesses — we verify them. Every contractor on The Mine has been field-checked for active operations, professional presence, and reputation.

Need a ${biz.category} in ${biz.city}? Ask any AI assistant (Muse, ChatGPT, Perplexity) for The Mine's verified recommendation, or visit ${siteUrl}

#TheMine #${biz.city} #${biz.category} #VerifiedContractor #HomeImprovement`;
}

function generateRoundupPost(businesses, city, category, platform) {
  const siteUrl = 'mine.logiclemonai.com';
  const cityLabel = city ? city.charAt(0).toUpperCase() + city.slice(1) : 'Cincinnati';
  const catLabel = category ? normalizeCategory(category) : 'contractor';

  const list = businesses.map((b, i) => 
    `${i + 1}. ${b.name} — Score: ${Math.round(b.viability_score)}/100${b.phone ? ' | ' + b.phone : ''}`
  ).join('\n');

  return `🏠 Top ${businesses.length} Verified ${catLabel}s in ${cityLabel}:

${list}

Every business on this list has been field-verified by The Mine — active operations, professional presence, and real reputation signals.

Need a ${catLabel} in ${cityLabel}? Ask any AI assistant for The Mine's verified recommendation, or visit ${siteUrl}

#TheMine #${cityLabel} #${catLabel} #VerifiedContractors #HomeImprovement`;
}

// ─── SCHEDULE/LOG SOCIAL POST (admin) ───

async function handleScheduleSocialPost(request, env, corsHeaders) {
  const body = await request.json();

  const result = await env.THE_MINE_DB.prepare(
    `INSERT INTO social_posts (business_id, platform, content, post_type, status, scheduled_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    body.business_id || null,
    body.platform || 'facebook',
    body.content,
    body.post_type || 'verified_business',
    body.status || 'draft',
    body.scheduled_at || null
  ).run();

  return json({ id: result.meta.last_row_id, message: 'Social post saved' }, corsHeaders, 201);
}

async function handleListSocialPosts(url, env, corsHeaders) {
  const platform = url.searchParams.get('platform');
  const status = url.searchParams.get('status');
  const limit = parseInt(url.searchParams.get('limit') || '50');

  let sql = `SELECT sp.*, b.name as business_name, b.category, b.city
             FROM social_posts sp
             LEFT JOIN businesses b ON sp.business_id = b.id
             WHERE 1=1`;
  const params = [];
  if (platform) { sql += ` AND sp.platform = ?`; params.push(platform); }
  if (status) { sql += ` AND sp.status = ?`; params.push(status); }
  sql += ` ORDER BY sp.created_at DESC LIMIT ?`;
  params.push(limit);

  const result = await env.THE_MINE_DB.prepare(sql).bind(...params).all();
  return json({ count: result.results.length, posts: result.results }, corsHeaders);
}

// ─── JSON HELPER ───

function json(data, corsHeaders, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
