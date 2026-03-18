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

-- 커뮤니티 댓글
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  post_id TEXT NOT NULL,
  author TEXT,
  content TEXT NOT NULL,
  recommendations INTEGER DEFAULT 0,
  created_at DATETIME,
  crawled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source, post_id, author, content)
);

CREATE INDEX IF NOT EXISTS idx_comments_source ON comments(source);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_crawled ON comments(crawled_at DESC);

-- 상품별 적정가격 가이드 (크롤링 데이터 기반)
CREATE TABLE IF NOT EXISTS price_guide (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product TEXT NOT NULL UNIQUE,
  category TEXT,
  deal_count INTEGER DEFAULT 0,
  price_avg INTEGER,
  price_median INTEGER,
  price_min INTEGER,
  price_max INTEGER,
  price_godly INTEGER,
  price_good INTEGER,
  price_normal INTEGER,
  price_expensive INTEGER,
  avg_rec REAL DEFAULT 0,
  best_deal_title TEXT,
  best_deal_price INTEGER,
  best_deal_rec INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_price_guide_product ON price_guide(product);
CREATE INDEX IF NOT EXISTS idx_price_guide_category ON price_guide(category);

-- 셀러 (직접 상품 등록하는 판매자)
CREATE TABLE IF NOT EXISTS sellers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  business_name TEXT,
  phone TEXT,
  status TEXT DEFAULT 'active',
  verified BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sellers_email ON sellers(email);
CREATE INDEX IF NOT EXISTS idx_sellers_status ON sellers(status);

-- 셀러 직접 등록 상품 (deals 테이블과 분리)
CREATE TABLE IF NOT EXISTS seller_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,
  original_price INTEGER,
  image_url TEXT,
  category TEXT,
  stock INTEGER DEFAULT -1,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (seller_id) REFERENCES sellers(id)
);

CREATE INDEX IF NOT EXISTS idx_seller_products_seller ON seller_products(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_products_status ON seller_products(status);
CREATE INDEX IF NOT EXISTS idx_seller_products_category ON seller_products(category);
CREATE INDEX IF NOT EXISTS idx_seller_products_price ON seller_products(price ASC);

-- 주문 (소비자 → 셀러 상품, 에이전트 경유)
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  product_id INTEGER NOT NULL,
  seller_id INTEGER NOT NULL,
  agent_id TEXT,

  -- 소비자 정보
  buyer_name TEXT NOT NULL,
  buyer_phone TEXT NOT NULL,
  buyer_email TEXT,
  buyer_address TEXT,

  -- 가격 구조
  product_price INTEGER NOT NULL,
  agent_fee INTEGER DEFAULT 0,
  total_price INTEGER NOT NULL,

  -- 상태: pending → paid → confirmed → shipped → delivered → completed / cancelled / refunded
  status TEXT DEFAULT 'pending',
  payment_method TEXT,
  paid_at DATETIME,

  memo TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES seller_products(id),
  FOREIGN KEY (seller_id) REFERENCES sellers(id)
);

CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_agent ON orders(agent_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
