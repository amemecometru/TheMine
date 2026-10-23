-- The Mine — Outreach & Subscribers Schema Migration
-- Run this against the the-mine D1 database after deploying the Worker
-- Usage: wrangler d1 execute the-mine --file=migrations/001_outreach.sql

-- Outreach campaigns — track every email sent to contractors
CREATE TABLE IF NOT EXISTS outreach_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  email_to TEXT NOT NULL,
  email_from TEXT DEFAULT 'outreach@mine.logiclemonai.com',
  subject TEXT NOT NULL,
  body_text TEXT,
  body_html TEXT,
  template TEXT DEFAULT 'initial_outreach',
  status TEXT DEFAULT 'pending',  -- pending, sent, opened, responded, accepted, declined, bounced
  message_id TEXT,                -- Cloudflare email message ID for tracking
  sent_by TEXT,
  sent_at TEXT,
  responded_at TEXT,
  response_status TEXT,            -- accepted, declined, interested, no_response
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id)
);

CREATE INDEX IF NOT EXISTS idx_outreach_business ON outreach_campaigns(business_id);
CREATE INDEX IF NOT EXISTS idx_outreach_status ON outreach_campaigns(status);

-- Subscribers — homeowners who want updates on verified contractors
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  city TEXT,
  state TEXT,
  interests TEXT,                  -- comma-separated categories: "painter,plumber,hvac"
  source TEXT DEFAULT 'landing_page',  -- landing_page, facebook, ai_assistant, referral
  status TEXT DEFAULT 'active',   -- active, unsubscribed, bounced
  ip_address TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_city ON subscribers(city);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);

-- Social posts — track generated social media content
CREATE TABLE IF NOT EXISTS social_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER,
  platform TEXT NOT NULL,          -- facebook, instagram, twitter, linkedin
  content TEXT NOT NULL,
  post_type TEXT DEFAULT 'verified_business',  -- verified_business, weekly_roundup, announcement
  status TEXT DEFAULT 'draft',     -- draft, scheduled, posted, failed
  scheduled_at TEXT,
  posted_at TEXT,
  post_url TEXT,                   -- URL of the posted content
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id)
);

CREATE INDEX IF NOT EXISTS idx_social_business ON social_posts(business_id);
CREATE INDEX IF NOT EXISTS idx_social_platform ON social_posts(platform);
CREATE INDEX IF NOT EXISTS idx_social_status ON social_posts(status);
