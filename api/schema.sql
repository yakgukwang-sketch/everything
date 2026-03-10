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

-- 가게 (네이버 플레이스 + 카카오맵 교차검증)
CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  road_address TEXT,
  phone TEXT,
  category TEXT,
  lat REAL,
  lng REAL,
  naver_id TEXT,
  kakao_id TEXT,
  verified BOOLEAN DEFAULT 0,
  menu_info TEXT,
  image_url TEXT,
  rating REAL DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name, address)
);

CREATE INDEX IF NOT EXISTS idx_stores_category ON stores(category);
CREATE INDEX IF NOT EXISTS idx_stores_location ON stores(lat, lng);
CREATE INDEX IF NOT EXISTS idx_stores_verified ON stores(verified);

-- 배달 주문
CREATE TABLE IF NOT EXISTS delivery_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consumer_request TEXT NOT NULL,
  area TEXT,
  food_type TEXT,
  budget INTEGER,
  quantity TEXT,
  status TEXT DEFAULT 'pending',
  selected_agent_id INTEGER,
  selected_driver_id INTEGER,
  final_price INTEGER,
  store_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (selected_agent_id) REFERENCES agents(id),
  FOREIGN KEY (selected_driver_id) REFERENCES drivers(id),
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

-- status: pending → agent_bidding → agent_selected → driver_bidding → driver_assigned → delivering → delivered → reviewed

-- 에이전트 입찰
CREATE TABLE IF NOT EXISTS agent_bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  proposed_store_id INTEGER,
  proposed_price INTEGER,
  delivery_fee INTEGER,
  total_price INTEGER,
  message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES delivery_orders(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (proposed_store_id) REFERENCES stores(id)
);

-- 배달 기사
CREATE TABLE IF NOT EXISTS drivers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  area TEXT,
  vehicle_type TEXT DEFAULT 'motorcycle',
  status TEXT DEFAULT 'available',
  rating REAL DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  total_deliveries INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 기사 입찰
CREATE TABLE IF NOT EXISTS driver_bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  driver_id INTEGER NOT NULL,
  proposed_fee INTEGER,
  estimated_time INTEGER,
  message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES delivery_orders(id),
  FOREIGN KEY (driver_id) REFERENCES drivers(id)
);

-- 배달 리뷰
CREATE TABLE IF NOT EXISTS delivery_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  agent_rating INTEGER CHECK(agent_rating >= 1 AND agent_rating <= 5),
  driver_rating INTEGER CHECK(driver_rating >= 1 AND driver_rating <= 5),
  food_rating INTEGER CHECK(food_rating >= 1 AND food_rating <= 5),
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES delivery_orders(id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_status ON delivery_orders(status);
CREATE INDEX IF NOT EXISTS idx_delivery_area ON delivery_orders(area);
CREATE INDEX IF NOT EXISTS idx_agent_bids_order ON agent_bids(order_id);
CREATE INDEX IF NOT EXISTS idx_driver_bids_order ON driver_bids(order_id);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_drivers_area ON drivers(area);
