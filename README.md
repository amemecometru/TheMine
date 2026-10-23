# The Mine

Verified local business data for AI assistants.

When a homeowner asks an AI assistant for a contractor recommendation, the assistant sees every business in the area — 20 painters, 15 plumbers, 30 HVAC companies. The Mine identifies the few worth calling. Every business in The Mine has been field-verified for active operations, professional presence, and real reputation — not just scraped from a listing.

## The Problem

AI assistants and search platforms have access to raw business listings, but they can't tell which businesses are actually operational, responsive, and worth recommending. A homeowner asking "find me a painter in Cincinnati" gets 20 results with no signal on which ones will actually answer the phone and show up.

## The Solution

The Mine is a verification and scoring layer that sits between raw business data and AI assistants:

1. **Collect** — Business data is gathered through field research, web scraping, and manual entry
2. **Verify** — Each business is checked for active operations, website liveness, phone responsiveness, domain history, and reputation signals
3. **Score** — A weighted viability score (0–100) is computed from verification signals
4. **Serve** — AI assistants query The Mine API and receive only verified, viable businesses

The scoring algorithm and verification data stay private. AI platforms see curated results — never the raw data or methodology behind them.

## Architecture

Built entirely on Cloudflare's developer platform:

```
AI Assistant ──→ /api/search?category=contractor&city=Cincinnati
                      │
                      ▼
               the-mine-api (Worker)
                      │
                      ├──→ D1 (verified businesses + viability scores)
                      ├──→ KV (cache + rate limit per API key)
                      └──→ Email (contractor outreach)
```

Each AI platform (Muse, ChatGPT, Perplexity, Google, etc.) gets its own API key with scoped permissions and rate limits. The API returns curated results only.

## API Overview

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/search` | GET | Key | Query verified businesses by category + city |
| `/api/categories` | GET | Key | Demand data per category per city |
| `/api/stats` | GET | Key | Database stats and per-platform query counts |
| `/api/businesses` | GET | Key | List and filter businesses |
| `/api/businesses` | POST | Write | Add a new business |
| `/api/businesses/:id` | GET | Key | Full business detail with verifications |
| `/api/businesses/:id/verify` | POST | Write | Add a verification record |
| `/api/businesses/:id/score` | POST | Write | Add a viability signal (recomputes score) |
| `/api/businesses/:id/outreach` | POST | Write | Send outreach email to a business |
| `/api/outreach` | GET | Key | List outreach campaigns |
| `/api/subscribe` | POST | Public | Homeowner email capture from landing page |
| `/api/social/post` | GET | Public | Generate shareable social media content |
| `/api/keys` | POST/GET | Admin | Create and list API keys |
| `/api/health` | GET | Public | Health check |

### Permissions

- **read** — Search, list, stats, categories
- **write** — Add businesses, verifications, signals, outreach, scrape logs
- **admin** — All of the above plus API key management

### Query Normalization

The API normalizes category queries so different platforms phrasing the same request differently get the same results:

- "house painting", "painter", "painting" → `painter`
- "plumbing repair", "plumber", "plumbing" → `plumber`
- "AC repair", "hvac", "heating and cooling" → `hvac`
- "roof repair", "roofer", "roofing" → `roofer`

## Database Schema

| Table | Purpose |
|---|---|
| `businesses` | Core records with viability scores (0–100) |
| `verifications` | Individual checks (field visits, website, phone, domain) |
| `viability_signals` | Weighted scoring signals per business |
| `scrape_logs` | Data collection run tracking |
| `platform_queries` | Every query from every platform (usage and billing) |
| `category_demand` | Search volume per category per city |
| `api_keys` | Per-platform keys with permissions and rate limits |
| `outreach_campaigns` | Contractor email outreach tracking |
| `subscribers` | Homeowner email capture from landing page |
| `social_posts` | Generated and scheduled social media content |

## Deployment

```bash
npm install -g wrangler
wrangler login
wrangler d1 execute the-mine --file=migrations/001_outreach.sql
wrangler deploy
```

After deploying, bootstrap an admin API key directly in D1:

```sql
INSERT INTO api_keys (key, platform, permissions, rate_limit_per_hour)
VALUES ('mine_<your-secure-key>', 'admin', 'admin', 1000);
```

Then create per-platform keys via the API:

```bash
curl -X POST https://<your-worker-domain>/api/keys \
  -H "Authorization: Bearer mine_<admin-key>" \
  -H "Content-Type: application/json" \
  -d '{"platform": "muse", "permissions": "read", "rate_limit_per_hour": 100}'
```

## Project Structure

```
the-mine/
├── src/
│   └── index.js          # Worker API — all endpoints
├── public/
│   └── cincinnati.html   # Cincinnati landing page
├── migrations/
│   └── 001_outreach.sql   # D1 schema migration
├── wrangler.toml.example  # Template config (copy to wrangler.toml)
└── README.md
```

## License

Private — All rights reserved.
