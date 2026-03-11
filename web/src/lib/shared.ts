export const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://everything-api.deri58.workers.dev";

// === Types ===

export type Deal = {
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
  posted_at: string;
  hotScore?: number;
  recommendations?: number;
};

export type AgentResponse = {
  agent_id: number;
  agent_name: string;
  commission_rate: number;
  rating: number;
  response: {
    recommendation: string;
    confidence: number;
    reasoning: string;
    deals: Deal[];
  };
};

export type ChatMessage = {
  role: "user" | "system";
  text: string;
  options?: string[];
};

// === Delivery Types ===

export type Store = {
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
};

export type DeliveryOrder = {
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
};

export type AgentBid = {
  id: number;
  order_id: number;
  agent_id: number;
  agent_name?: string;
  proposed_store_id: number;
  store_name?: string;
  proposed_price: number;
  delivery_fee: number;
  total_price: number;
  message: string;
  created_at: string;
};

export type DriverBid = {
  id: number;
  order_id: number;
  driver_id: number;
  driver_name?: string;
  proposed_fee: number;
  estimated_time: number;
  message: string;
  created_at: string;
};

export type Driver = {
  id: number;
  name: string;
  phone: string;
  area: string;
  vehicle_type: string;
  status: string;
  rating: number;
  review_count: number;
  total_deliveries: number;
};

// Delivery status labels
export const DELIVERY_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "대기중", color: "#9e9e9e" },
  agent_bidding: { label: "에이전트 입찰중", color: "#ff9800" },
  agent_selected: { label: "에이전트 선택됨", color: "#2196f3" },
  driver_bidding: { label: "기사 입찰중", color: "#ff9800" },
  driver_assigned: { label: "기사 배정됨", color: "#2196f3" },
  delivering: { label: "배달중", color: "#4caf50" },
  delivered: { label: "배달 완료", color: "#4caf50" },
  reviewed: { label: "평가 완료", color: "#9c27b0" },
};

// === Constants ===

export const AGENT_ICONS: Record<string, string> = {
  "최저가봇": "💰", "인기봇": "🔥", "큐레이터봇": "🎯", "타임딜봇": "⚡",
  "알뜰봇": "🏷️", "가격예측봇": "📊", "비교봇": "⚖️", "선물봇": "🎁",
  "가성비봇": "💎", "어드바이저봇": "🧠", "카테고리봇": "📂", "트렌드봇": "📈",
};

export const AGENT_INTROS: Record<string, string> = {
  "최저가봇": "무조건 제일 싼 거 찾아드립니다",
  "인기봇": "커뮤니티에서 반응 좋은 것만 골라요",
  "큐레이터봇": "여러 쇼핑몰에서 엄선해서 추천해요",
  "타임딜봇": "방금 올라온 따끈따끈한 딜만 잡아요",
  "알뜰봇": "할인율 높은 것만 쏙쏙 골라요",
  "가격예측봇": "지금 사야 할지 기다려야 할지 알려드려요",
  "비교봇": "여러 쇼핑몰 가격을 한눈에 비교해요",
  "선물봇": "선물하기 딱 좋은 가격대로 추천해요",
  "가성비봇": "가격 대비 가치를 꼼꼼히 따져요",
  "어드바이저봇": "가격, 인기, 신뢰도 종합 분석해요",
  "카테고리봇": "카테고리별 최고 상품만 골라요",
  "트렌드봇": "지금 뜨는 키워드와 상품을 잡아요",
};

export const SOURCE_NAMES: Record<string, string> = {
  ppomppu: "뽐뿌",
  "지마켓": "지마켓", "네이버": "네이버", "11번가": "11번가", "옥션": "옥션",
  "롯데온": "롯데온", "G마켓": "G마켓", "오늘의집": "오늘의집", "톡딜": "톡딜",
  "카카오": "카카오", "토스": "토스", "토스쇼핑": "토스쇼핑", "무신사": "무신사",
  "쿠팡": "쿠팡", "하이마트몰": "하이마트몰", "CJ더마켓": "CJ더마켓", "신세계": "신세계",
};

export const SOURCE_COLORS: Record<string, string> = {
  ppomppu: "#0d5aa7",
  "지마켓": "#e44232", "네이버": "#03c75a", "11번가": "#ff0038", "옥션": "#f58220",
  "롯데온": "#e60012", "G마켓": "#e44232", "오늘의집": "#35c5f0", "톡딜": "#fee500",
  "카카오": "#fee500", "토스": "#0064ff", "토스쇼핑": "#0064ff", "무신사": "#000000",
  "쿠팡": "#e44232", "하이마트몰": "#0070c0", "CJ더마켓": "#ff6600", "신세계": "#8b0000",
};

export const CATEGORIES = [
  "전자기기", "패션", "식품", "생활용품", "뷰티", "가구/인테리어",
  "스포츠/레저", "도서/문구", "반려동물", "유아/아동", "기타",
];

// === Utils ===

export function formatPrice(price: number): string {
  if (price == null) return "";
  if (price === 0) return "0원";
  return price.toLocaleString() + "원";
}

export function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const parsed = new Date(dateStr).getTime();
  if (isNaN(parsed)) return "";
  const diff = Date.now() - parsed;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export function sanitizeUrl(url: string): string {
  if (!url) return "#";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return "#";
}
