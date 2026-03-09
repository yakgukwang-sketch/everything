-- 할인 상품
CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  original_price INTEGER,
  sale_price INTEGER,
  discount_rate INTEGER,
  url TEXT NOT NULL,
  image_url TEXT,
  category TEXT,
  source TEXT NOT NULL,
  source_id TEXT,
  posted_at DATETIME,
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_deals_source ON deals(source);
CREATE INDEX IF NOT EXISTS idx_deals_category ON deals(category);
CREATE INDEX IF NOT EXISTS idx_deals_posted ON deals(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_discount ON deals(discount_rate DESC);

-- AI 에이전트
CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  commission_rate REAL DEFAULT 0,
  endpoint TEXT,
  api_key TEXT UNIQUE NOT NULL,
  rating REAL DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  total_queries INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 에이전트 응답 기록
CREATE TABLE IF NOT EXISTS agent_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  query TEXT NOT NULL,
  response TEXT,
  confidence REAL,
  selected BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- 에이전트 리뷰
CREATE TABLE IF NOT EXISTS agent_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_rating ON agents(rating DESC);
CREATE INDEX IF NOT EXISTS idx_responses_agent ON agent_responses(agent_id);
CREATE INDEX IF NOT EXISTS idx_reviews_agent ON agent_reviews(agent_id);
