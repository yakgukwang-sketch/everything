// ===== Bindings =====

export type Bindings = {
  DB: D1Database;
  GEMINI_API_KEY: string;
  ADMIN_API_KEY: string;
  JWT_SECRET: string;
};

// ===== DB Row Types =====

export interface DealRow {
  id: number;
  title: string;
  description: string;
  original_price: number;
  sale_price: number;
  discount_rate: number;
  url: string;
  image_url: string;
  category: string;
  source: string;
  source_id: string;
  posted_at: string;
  created_at: string;
  expires_at: string;
}

export interface AgentRow {
  id: number;
  name: string;
  description: string | null;
  commission_rate: number;
  endpoint: string | null;
  api_key: string | null;
  rating: number;
  review_count: number;
  total_queries: number;
  status: string;
  created_at: string;
}


export interface CommentRow {
  id: number;
  source: string;
  post_id: string;
  author: string;
  content: string;
  recommendations: number;
  created_at: string;
  crawled_at: string;
}

export interface PriceGuideRow {
  id: number;
  product: string;
  category: string;
  deal_count: number;
  price_avg: number;
  price_median: number;
  price_min: number;
  price_max: number;
  price_godly: number;
  price_good: number;
  price_normal: number;
  price_expensive: number;
  avg_rec: number;
  best_deal_title: string;
  best_deal_price: number;
  best_deal_rec: number;
  updated_at: string;
}

// ===== AgentCore — 통합 에이전트 인터페이스 =====
//
// 모든 도메인(쇼핑, 배달, 숙박 등)의 에이전트가 공유하는 코어.
// TContext: 도메인별 입력 (검색어, 예산 등)
// TItem: 평가 대상 (DealRow, StoreRow 등)

export interface AgentCore<TContext, TItem> {
  name: string;
  description: string;
  evaluate(items: TItem[], context: TContext): AgentResult<TItem>;
}

export interface AgentResult<TItem> {
  recommendation: string;
  confidence: number;
  reasoning: string;
  topPick: TItem | null;
  items: TItem[];
  meta?: Record<string, unknown>;
}

// ===== Domain Contexts =====

export interface ShoppingContext {
  query: string;
}

// ===== Domain Agent Type Aliases =====

export type ShoppingAgent = AgentCore<ShoppingContext, DealRow>;

// ===== Seller Types =====

export interface SellerRow {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  business_name: string | null;
  phone: string | null;
  status: string;
  verified: number;
  created_at: string;
}

export interface SellerProductRow {
  id: number;
  seller_id: number;
  title: string;
  description: string | null;
  price: number;
  original_price: number | null;
  image_url: string | null;
  category: string | null;
  stock: number;
  status: string;
  created_at: string;
  updated_at: string;
}

// ===== Agent Chat Config =====

export interface AgentChatConfig {
  name: string;
  icon: string;
  description: string;
  systemPrompt: string;
  searchSort: string;       // SQL ORDER BY clause for DB search
  searchLimit: number;      // max items to fetch from DB
  greeting: string;         // first message when chat starts
}
