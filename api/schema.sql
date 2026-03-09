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
