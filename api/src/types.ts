// ===== Bindings =====

export type Bindings = {
  DB: D1Database;
  GEMINI_API_KEY: string;
  ADMIN_API_KEY: string;
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

export interface StoreRow {
  id: number;
  name: string;
  address: string;
  road_address: string;
  phone: string;
  category: string;
  lat: number;
  lng: number;
  verified: boolean;
  menu_info: string;
  image_url: string;
  rating: number;
  review_count: number;
}

export interface DeliveryOrderRow {
  id: number;
  consumer_request: string;
  area: string;
  food_type: string;
  budget: number;
  quantity: string;
  status: string;
  selected_agent_id: number;
  selected_driver_id: number;
  final_price: number;
  store_id: number;
  created_at: string;
  updated_at: string;
}

export interface DriverRow {
  id: number;
  name: string;
  phone: string;
  area: string;
  vehicle_type: string;
  status: string;
  rating: number;
  review_count: number;
  total_deliveries: number;
  created_at: string;
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

export interface DeliveryContext {
  budget: number;
  area: string;
  foodType: string;
}

// ===== Domain Agent Type Aliases =====

export type ShoppingAgent = AgentCore<ShoppingContext, DealRow>;
export type DeliveryAgent = AgentCore<DeliveryContext, StoreRow>;

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
