"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  API_URL, Deal, AgentResponse, ChatMessage, AgentBid, DriverBid,
  AGENT_ICONS, AGENT_INTROS, SOURCE_NAMES, SOURCE_COLORS, DELIVERY_STATUS,
  formatPrice, timeAgo, sanitizeUrl,
} from "@/lib/shared";

// 배달 관련 키워드로 자동 감지
const DELIVERY_KEYWORDS = [
  "시켜", "배달", "주문", "인분", "그릇", "마리", "판",
  "치킨", "피자", "족발", "보쌈", "떡볶이", "짜장", "짬뽕", "탕수육",
  "제육", "삼겹살", "곱창", "냉면", "김밥", "돈까스", "초밥", "회",
  "햄버거", "분식", "중식", "한식", "일식", "양식",
  "먹고", "먹을", "배고", "야식", "점심", "저녁", "아침",
];

const AREA_KEYWORDS = [
  "부천", "인천", "서울", "수원", "성남", "안양", "고양", "용인",
  "화성", "시흥", "광명", "의정부", "파주", "김포", "구로", "강남",
  "마포", "송파", "관악", "영등포", "동대문", "종로",
];

function detectDelivery(query: string, parsed: Record<string, unknown> | null): boolean {
  const text = query.toLowerCase();
  return DELIVERY_KEYWORDS.some(kw => text.includes(kw));
}

function extractArea(query: string): string {
  for (const area of AREA_KEYWORDS) {
    if (query.includes(area)) return area;
  }
  return "부천";
}

function extractFoodType(query: string): string {
  const foods = [
    "제육볶음", "치킨", "피자", "족발", "보쌈", "떡볶이", "짜장면", "짬뽕",
    "탕수육", "삼겹살", "곱창", "냉면", "김밥", "돈까스", "초밥", "회",
    "햄버거", "분식", "라멘", "파스타", "샐러드", "커피",
  ];
  for (const food of foods) {
    if (query.includes(food)) return food;
  }
  // 키워드 없으면 첫 명사 추출
  const words = query.split(/\s+/).filter(w => w.length >= 2);
  return words[1] || words[0] || "음식";
}

function extractBudget(query: string): number {
  const match = query.match(/(\d+)\s*만\s*원/) || query.match(/(\d{4,})\s*원/);
  if (match) {
    return match[0].includes("만") ? parseInt(match[1]) * 10000 : parseInt(match[1]);
  }
  return 50000;
}

function extractQuantity(query: string): string {
  const match = query.match(/(\d+)\s*(인분|그릇|마리|판|개|잔)/);
  return match ? match[0] : "1인분";
}

type DeliveryBid = AgentBid & { agent_name?: string; store_name?: string };

export default function Home() {
  const [input, setInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [agentResponses, setAgentResponses] = useState<AgentResponse[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const [phase, setPhase] = useState<
    "idle" | "chatting" | "confirm" | "agents" |
    "delivery_bids" | "delivery_drivers" | "delivering" | "delivery_review"
  >("idle");
  const [pendingQuery, setPendingQuery] = useState<{ query: string; parsed: { product?: string; specs?: Record<string, string>; budget?: string; keywords?: string[] } | null } | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [feedTab, setFeedTab] = useState<"hot" | "latest">("hot");
  const [feedFilter, setFeedFilter] = useState("all");
  const [feedLoading, setFeedLoading] = useState(false);

  // 배달 state
  const [deliveryOrderId, setDeliveryOrderId] = useState<number | null>(null);
  const [deliveryBids, setDeliveryBids] = useState<DeliveryBid[]>([]);
  const [driverBids, setDriverBids] = useState<DriverBid[]>([]);
  const [deliveryLoading, setDeliveryLoading] = useState(false);

  // 리뷰
  const [agentRating, setAgentRating] = useState(5);
  const [driverRating, setDriverRating] = useState(5);
  const [foodRating, setFoodRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const agentSelectingRef = useRef(false);
  const router = useRouter();

  // 피드 데이터 로드
  const loadFeed = async (tab: "hot" | "latest") => {
    setFeedLoading(true);
    try {
      const url = tab === "hot"
        ? `${API_URL}/api/hot?limit=30&period=week`
        : `${API_URL}/api/deals?sort=latest&limit=30`;
      const res = await fetch(url);
      const data = await res.json();
      setDeals(data.data || []);
    } catch (err) {
      console.error("Feed load failed:", err);
    } finally {
      setFeedLoading(false);
    }
  };

  useEffect(() => {
    if (phase === "idle") loadFeed(feedTab);
  }, [feedTab, phase]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    if (!chatLoading && !deliveryLoading) {
      setTimeout(() => chatInputRef.current?.focus(), 100);
    }
  }, [chatMsgs, agentResponses, deliveryBids, driverBids, chatLoading, deliveryLoading, phase]);

  // Gemini 대화
  const sendChat = async (newMsgs: ChatMessage[]) => {
    setChatLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMsgs }),
      });
      const data = await res.json();

      if (data.success) {
        const reply = data.reply || "뭐 찾고 있어?";
        const options = data.options || [];
        const updated = [...newMsgs, { role: "system" as const, text: reply, options }];
        setChatMsgs(updated);

        if (data.ready && data.query) {
          // Gemini가 type을 알려줌: "delivery" or "shopping"
          const qType = data.query.type || "";

          if (qType === "delivery") {
            // 배달이면 바로 배달 플로우로
            const food = data.query.food || data.query.product || "";
            const area = data.query.area || extractArea(newMsgs.map(m => m.text).join(" "));
            const quantity = data.query.quantity || "1인분";
            const budget = parseInt(data.query.budget) || 50000;
            const deliveryQuery = `${area} ${food} ${quantity} ${budget}원`;

            setChatMsgs(prev => [...prev, { role: "system", text: `배달 주문이네! ${area} ${food} ${quantity} — 에이전트들이 경쟁 입찰 중...` }]);
            sendDeliveryRequest(deliveryQuery);
          } else {
            // 쇼핑이면 기존 confirm 플로우
            const keywords = data.query.keywords || [];
            const product = data.query.product || "";
            const specs = data.query.specs ? Object.values(data.query.specs).join(" ") : "";
            const budget = data.query.budget || "";
            const finalQuery = `${product} ${specs} ${budget} ${keywords.join(" ")}`.trim();
            setPendingQuery({ query: finalQuery, parsed: data.query });
            setPhase("confirm");
          }
        }
      }
    } catch (err) {
      console.error(err);
      setChatMsgs(prev => [...prev, { role: "system", text: "죄송해요, 잠시 문제가 생겼어요. 다시 말씀해주세요!" }]);
    } finally {
      setChatLoading(false);
    }
  };

  // 쇼핑 에이전트 전달
  const sendToAgents = async (query: string) => {
    setAgentLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/agents/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      const sorted = (data.responses || []).sort(
        (a: AgentResponse, b: AgentResponse) => (b.response.confidence || 0) - (a.response.confidence || 0)
      );
      setAgentResponses(sorted);
    } catch (err) { console.error(err); }
    finally { setAgentLoading(false); }
  };

  // 배달 주문 생성
  const sendDeliveryRequest = async (query: string) => {
    setDeliveryLoading(true);
    const area = extractArea(query);
    const foodType = extractFoodType(query);
    const budget = extractBudget(query);
    const quantity = extractQuantity(query);

    try {
      const res = await fetch(`${API_URL}/api/delivery/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consumer_request: query,
          area,
          food_type: foodType,
          budget,
          quantity,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDeliveryOrderId(data.order_id);
        const bids = (data.bids || []).map((b: Record<string, unknown>, i: number) => ({
          id: b.id || i + 1,
          order_id: data.order_id,
          agent_id: b.agent_id,
          agent_name: b.agent_name,
          store_name: typeof b.proposed_store === "string" ? b.proposed_store : (b.proposed_store as Record<string, unknown>)?.name || b.store_name || "추천 가게",
          proposed_price: b.proposed_price,
          delivery_fee: b.delivery_fee,
          total_price: b.total_price,
          message: b.message,
          created_at: new Date().toISOString(),
        }));
        setDeliveryBids(bids);
        setPhase("delivery_bids");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeliveryLoading(false);
    }
  };

  // 에이전트 선택 (배달)
  const handleSelectDeliveryAgent = async (bidId: number) => {
    if (!deliveryOrderId || deliveryLoading) return;
    if (phase !== "delivery_bids") return;
    if (agentSelectingRef.current) return; // ref 기반 중복 클릭 방지
    agentSelectingRef.current = true;
    setDeliveryLoading(true);
    setPhase("delivery_drivers");
    setChatMsgs(prev => [...prev, { role: "system", text: "에이전트를 선택했어요! 기사님을 찾고 있어요..." }]);
    try {
      const res = await fetch(`${API_URL}/api/delivery/${deliveryOrderId}/select-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_bid_id: bidId }),
      });
      const data = await res.json();
      if (data.success) {
        // 주문 상세 조회해서 driver bids 가져오기
        const orderRes = await fetch(`${API_URL}/api/delivery/${deliveryOrderId}`);
        const orderData = await orderRes.json();
        setDriverBids(orderData.data?.driver_bids || []);
        setPhase("delivery_drivers");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeliveryLoading(false);
    }
  };

  // 기사 수락
  const handleAcceptDriver = async (bidId: number) => {
    if (!deliveryOrderId) return;
    setDeliveryLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/delivery/${deliveryOrderId}/accept-driver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driver_bid_id: bidId }),
      });
      const data = await res.json();
      if (data.success) {
        setChatMsgs(prev => [...prev, { role: "system", text: "기사님이 배달을 시작했어요! 🛵" }]);
        setPhase("delivering");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeliveryLoading(false);
    }
  };

  // 배달 완료 + 리뷰
  const handleDeliveryReview = async () => {
    if (!deliveryOrderId) return;
    try {
      await fetch(`${API_URL}/api/delivery/${deliveryOrderId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      await fetch(`${API_URL}/api/delivery/${deliveryOrderId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_rating: agentRating,
          driver_rating: driverRating,
          food_rating: foodRating,
          comment: reviewComment,
        }),
      });
      setChatMsgs(prev => [...prev, { role: "system", text: "평가 완료! 감사합니다 😊" }]);
      setPhase("delivery_review");
    } catch (err) {
      console.error(err);
    }
  };

  // 기사 새로고침
  const refreshDriverBids = async () => {
    if (!deliveryOrderId) return;
    try {
      const res = await fetch(`${API_URL}/api/delivery/${deliveryOrderId}`);
      const data = await res.json();
      setDriverBids(data.data?.driver_bids || []);
    } catch (err) {
      console.error(err);
    }
  };

  // 유저 입력
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || chatLoading) return;
    const text = input.trim();
    setInput("");

    const newMsgs = [...chatMsgs, { role: "user" as const, text }];
    setChatMsgs(newMsgs);

    if (phase === "idle" || phase === "agents" || phase === "confirm" || phase === "delivery_review") {
      setPhase("chatting");
      setAgentResponses([]);
      setDeliveryBids([]);
      setDriverBids([]);
      setDeliveryOrderId(null);
      setPendingQuery(null);
    }
    sendChat(newMsgs);
  };

  // 바로 에이전트에게 보내기
  const handleDirectSend = () => {
    if (chatMsgs.length === 0) return;
    const userMsgs = chatMsgs.filter(m => m.role === "user").map(m => m.text);
    const query = userMsgs.join(" ");
    setPendingQuery({ query, parsed: null });
    setPhase("confirm");
    setChatMsgs(prev => [...prev, { role: "system", text: "이 정도면 충분할까요?" }]);
  };

  // 확인 후 — 배달 vs 쇼핑 자동 감지
  const handleConfirmSend = () => {
    if (!pendingQuery) return;
    const isDelivery = detectDelivery(pendingQuery.query, pendingQuery.parsed as Record<string, unknown> | null);

    if (isDelivery) {
      setChatMsgs(prev => [...prev, { role: "system", text: "배달 주문이네요! 에이전트들이 최적의 가게를 찾고 있어요..." }]);
      sendDeliveryRequest(pendingQuery.query);
    } else {
      setPhase("agents");
      setChatMsgs(prev => [...prev, { role: "system", text: "좋아요! 에이전트들에게 물어볼게요." }]);
      sendToAgents(pendingQuery.query);
    }
    setPendingQuery(null);
  };

  // 선택지 클릭
  const handleOptionClick = (option: string) => {
    if (chatLoading) return;
    const newMsgs = [...chatMsgs, { role: "user" as const, text: option }];
    setChatMsgs(newMsgs);
    if (phase === "confirm") {
      setPhase("chatting");
      setPendingQuery(null);
    }
    sendChat(newMsgs);
  };

  // 더 대화하기
  const handleContinueChat = () => {
    setPhase("chatting");
    setPendingQuery(null);
    setChatMsgs(prev => [...prev, { role: "system", text: "좋아요, 더 알려줘!" }]);
  };

  // 새 대화
  const handleReset = () => {
    setChatMsgs([]);
    setPhase("idle");
    setAgentResponses([]);
    setDeliveryBids([]);
    setDriverBids([]);
    setDeliveryOrderId(null);
    setAgentLoading(false);
    setChatLoading(false);
    setDeliveryLoading(false);
    setPendingQuery(null);
    setAgentRating(5);
    setDriverRating(5);
    setFoodRating(5);
    setReviewComment("");
  };

  const StarSelector = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" onClick={() => onChange(i)}
          style={{ fontSize: 20, color: i <= value ? "#fbbc05" : "#e0e0e0", background: "none", border: "none", cursor: "pointer", padding: 1 }}>
          {i <= value ? "★" : "☆"}
        </button>
      ))}
    </div>
  );

  return (
    <div className="main">
      <header className="header">
        <span className="header-link" onClick={() => router.push("/agents")} style={{ cursor: "pointer" }}>에이전트</span>
        <span className="header-link" onClick={() => router.push("/driver")} style={{ cursor: "pointer" }}>기사</span>
        <span className="header-link" onClick={() => router.push("/submit")} style={{ cursor: "pointer" }}>상품 등록</span>
      </header>

      {phase === "idle" ? (
        /* 초기 상태 */
        <div className="hero">
          <h1 className="logo">
            <span className="e1">e</span><span className="v">v</span><span>e</span>
            <span className="r">r</span><span className="y">y</span><span>t</span>
            <span className="e2">h</span><span>i</span><span className="v">n</span>
            <span className="e1">g</span>
          </h1>
          <p className="tagline">AI 에이전트에게 물어보세요</p>

          <form className="search-form" onSubmit={handleSubmit}>
            <div className="search-wrapper">
              <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                className="search-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="뭐든 물어보세요 (쇼핑, 배달, 뭐든)"
                autoFocus
              />
            </div>
          </form>

          <div className="quick-examples">
            {[
              "노트북 추천해줘",
              "부천 제육볶음 4인분 4만원",
              "치킨 2마리 시켜줘",
              "이어폰 사고싶어",
            ].map(ex => (
              <button key={ex} className="example-chip" onClick={() => {
                const msgs = [{ role: "user" as const, text: ex }];
                setChatMsgs(msgs);
                setPhase("chatting");
                sendChat(msgs);
              }}>
                {ex}
              </button>
            ))}
          </div>

          {/* 딜 피드 */}
          <div className="feed">
            <div className="feed-header">
              <div className="feed-tabs">
                <button className={`feed-tab ${feedTab === "hot" ? "active" : ""}`} onClick={() => setFeedTab("hot")}>HOT</button>
                <button className={`feed-tab ${feedTab === "latest" ? "active" : ""}`} onClick={() => setFeedTab("latest")}>최신</button>
              </div>
              <div className="feed-filters">
                {["all", ...Array.from(new Set(deals.map(d => d.source)))].map(s => (
                  <button key={s} className={`filter-btn ${feedFilter === s ? "active" : ""}`} onClick={() => setFeedFilter(s)}>
                    {s === "all" ? "전체" : s.startsWith("biz:") ? s.replace("biz:", "") : SOURCE_NAMES[s] || s}
                  </button>
                ))}
              </div>
            </div>

            {feedLoading ? (
              <div className="loading">
                <div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" />
              </div>
            ) : (
              <div className="deal-grid">
                {(feedFilter === "all" ? deals : deals.filter(d => d.source === feedFilter)).map((deal) => (
                  <a key={deal.id} href={sanitizeUrl(deal.url)} target="_blank" rel="noopener noreferrer" className={`deal-card ${deal.hotScore && deal.hotScore > 30 ? "deal-hot" : ""}`}>
                    {deal.hotScore && deal.hotScore > 30 && (
                      <div className="hot-score-bar">
                        <span className="hot-fire">🔥 HOT</span>
                        {deal.recommendations && deal.recommendations > 0 && (
                          <span className="hot-recs">추천 {deal.recommendations}</span>
                        )}
                      </div>
                    )}
                    <div className="deal-image">
                      {deal.image_url ? (
                        <img src={deal.image_url} alt={deal.title} loading="lazy" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div className="deal-image-placeholder">
                          <span>{SOURCE_NAMES[deal.source] || deal.source}</span>
                        </div>
                      )}
                    </div>
                    <div className="deal-body">
                      <div className="deal-source">
                        <span className="deal-source-badge" style={{ background: deal.source.startsWith("biz:") ? "#6c5ce7" : (SOURCE_COLORS[deal.source] || "#5f6368") }}>
                          {deal.source.startsWith("biz:") ? deal.source.replace("biz:", "") : (SOURCE_NAMES[deal.source] || deal.source)}
                        </span>
                        <span className="deal-time">{timeAgo(deal.posted_at)}</span>
                      </div>
                      <div className="deal-title">{deal.title}</div>
                      <div className="deal-price-row">
                        {deal.discount_rate > 0 && (
                          <span className="deal-discount">{deal.discount_rate}%</span>
                        )}
                        {deal.sale_price > 0 && (
                          <span className="deal-sale-price">{formatPrice(deal.sale_price)}</span>
                        )}
                      </div>
                      {deal.original_price > 0 && deal.original_price !== deal.sale_price && (
                        <span className="deal-original-price">{formatPrice(deal.original_price)}</span>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            )}

            {!feedLoading && deals.length === 0 && (
              <div className="empty-feed">아직 수집된 딜이 없습니다.</div>
            )}
          </div>
        </div>
      ) : (
        /* 대화 모드 */
        <div className="chat-container">
          <div className="chat-header">
            <div className="results-logo" onClick={handleReset} style={{ cursor: "pointer" }}>
              <span style={{ color: "#4285f4" }}>e</span><span style={{ color: "#ea4335" }}>v</span><span>e</span>
              <span style={{ color: "#4285f4" }}>r</span><span style={{ color: "#34a853" }}>y</span><span>t</span>
              <span style={{ color: "#fbbc05" }}>h</span><span>i</span><span style={{ color: "#ea4335" }}>n</span>
              <span style={{ color: "#4285f4" }}>g</span>
            </div>
            <button className="reset-btn" onClick={handleReset}>새 질문</button>
          </div>

          <div className="chat-messages">
            {chatMsgs.map((msg, i) => (
              <div key={i}>
                <div className={`chat-msg ${msg.role}`}>
                  {msg.role === "system" && <div className="chat-bot-icon">E</div>}
                  <div className={`chat-bubble ${msg.role}`}>
                    <p>{msg.text}</p>
                  </div>
                </div>
                {msg.role === "system" && msg.options && msg.options.length > 0 && (
                  <div className="chat-options" style={i !== chatMsgs.length - 1 ? { opacity: 0.5, pointerEvents: "none" } : {}}>
                    {msg.options.map((opt, j) => (
                      <button key={j} className="chat-option-btn" onClick={() => handleOptionClick(opt)}>
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {(chatLoading || deliveryLoading) && (
              <div className="chat-msg system">
                <div className="chat-bot-icon">E</div>
                <div className="chat-bubble system">
                  <div className="typing-indicator">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              </div>
            )}

            {/* 바로 에이전트에게 보내기 버튼 */}
            {phase === "chatting" && !chatLoading && chatMsgs.length >= 2 && (
              <div className="chat-skip">
                <button className="skip-btn" onClick={handleDirectSend}>
                  이 정도면 충분해요 — 에이전트에게 맡기기
                </button>
              </div>
            )}

            {/* 확인 단계 */}
            {phase === "confirm" && pendingQuery && (
              <div className="confirm-section">
                <div className="confirm-card">
                  <div className="confirm-title">이 정도면 충분할까요?</div>
                  <div className="confirm-summary">
                    {pendingQuery.parsed ? (
                      <div className="confirm-details">
                        {pendingQuery.parsed.product && (
                          <div className="confirm-item">
                            <span className="confirm-label">상품</span>
                            <span>{pendingQuery.parsed.product}</span>
                          </div>
                        )}
                        {pendingQuery.parsed.specs && Object.keys(pendingQuery.parsed.specs).length > 0 && (
                          <div className="confirm-item">
                            <span className="confirm-label">조건</span>
                            <span>{Object.entries(pendingQuery.parsed.specs).map(([k, v]) => `${k}: ${v}`).join(", ")}</span>
                          </div>
                        )}
                        {pendingQuery.parsed.budget && (
                          <div className="confirm-item">
                            <span className="confirm-label">예산</span>
                            <span>{pendingQuery.parsed.budget}</span>
                          </div>
                        )}
                        {pendingQuery.parsed.keywords && pendingQuery.parsed.keywords.length > 0 && (
                          <div className="confirm-item">
                            <span className="confirm-label">검색어</span>
                            <span>{pendingQuery.parsed.keywords.join(", ")}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="confirm-details">
                        <div className="confirm-item">
                          <span className="confirm-label">검색어</span>
                          <span>{pendingQuery.query}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="confirm-buttons">
                    <button className="confirm-btn-yes" onClick={handleConfirmSend}>
                      네, 에이전트에게 맡기기
                    </button>
                    <button className="confirm-btn-no" onClick={handleContinueChat}>
                      아니요, 더 말할게 있어요
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 에이전트 로딩 (쇼핑) */}
            {agentLoading && (
              <div className="chat-msg system">
                <div className="chat-bot-icon">E</div>
                <div className="chat-bubble system">
                  <p>12개 에이전트가 경쟁 중...</p>
                  <div className="loading" style={{ padding: "10px 0" }}>
                    <div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" />
                  </div>
                </div>
              </div>
            )}

            {/* 쇼핑 에이전트 응답 */}
            {agentResponses.length > 0 && (
              <div className="agent-results-chat">
                <div className="chat-msg system">
                  <div className="chat-bot-icon">E</div>
                  <div className="chat-bubble system">
                    <p>에이전트들이 추천을 준비했어요!</p>
                  </div>
                </div>
                <div className="agent-response-grid">
                  {agentResponses.slice(0, 6).map((r, i) => (
                    <div key={i} className={`agent-response-card ${i === 0 ? "agent-best" : ""}`}>
                      <div className="agent-response-header">
                        <div className="agent-avatar">{AGENT_ICONS[r.agent_name] || "🤖"}</div>
                        <div className="agent-response-info">
                          <div className="agent-response-name">
                            {r.agent_name}
                            {i === 0 && <span className="best-badge">BEST</span>}
                          </div>
                          <div className="agent-response-meta">
                            신뢰도 {Math.round((r.response.confidence || 0) * 100)}% · 수수료 {r.commission_rate}%
                          </div>
                        </div>
                      </div>
                      {AGENT_INTROS[r.agent_name] && (
                        <div className="agent-intro">{AGENT_INTROS[r.agent_name]}</div>
                      )}
                      <div className="agent-response-text">{r.response.recommendation}</div>
                      <div className="agent-response-reason">{r.response.reasoning}</div>
                      {r.response.deals && r.response.deals.length > 0 && (
                        <div className="agent-deal-cards">
                          {r.response.deals.slice(0, 2).map((deal, j) => (
                            <a key={j} href={sanitizeUrl(deal.url)} target="_blank" rel="noopener noreferrer" className="agent-deal-card">
                              {deal.image_url && (
                                <div className="agent-deal-img">
                                  <img src={deal.image_url} alt="" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                </div>
                              )}
                              <div className="agent-deal-info">
                                <div className="agent-deal-title">{deal.title?.substring(0, 30)}{deal.title?.length > 30 ? "..." : ""}</div>
                                {deal.sale_price > 0 && <div className="agent-deal-price">{deal.sale_price.toLocaleString()}원</div>}
                              </div>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ===== 배달 플로우 (채팅 안에서 전부 진행) ===== */}

            {/* 배달 에이전트 입찰 */}
            {phase === "delivery_bids" && deliveryBids.length > 0 && (
              <div className="agent-results-chat">
                <div className="chat-msg system">
                  <div className="chat-bot-icon">E</div>
                  <div className="chat-bubble system">
                    <p>에이전트 {deliveryBids.length}명이 조건을 제시했어요! 마음에 드는 걸 선택하세요.</p>
                  </div>
                </div>
                <div className="agent-response-grid">
                  {deliveryBids.sort((a, b) => (a.total_price || 0) - (b.total_price || 0)).slice(0, 6).map((bid, i) => (
                    <div key={bid.id} className={`agent-response-card ${i === 0 ? "agent-best" : ""}`} style={{ cursor: "pointer" }}
                      onClick={() => handleSelectDeliveryAgent(bid.id)}>
                      <div className="agent-response-header">
                        <div className="agent-avatar">{AGENT_ICONS[bid.agent_name || ""] || "🤖"}</div>
                        <div className="agent-response-info">
                          <div className="agent-response-name">
                            {bid.agent_name || `에이전트 ${bid.agent_id}`}
                            {i === 0 && <span className="best-badge">BEST</span>}
                          </div>
                          <div className="agent-response-meta">
                            {bid.store_name || "추천 가게"}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: "#ea4335" }}>{formatPrice(bid.total_price)}</div>
                          <div style={{ fontSize: 11, color: "#9aa0a6" }}>음식 {formatPrice(bid.proposed_price)} + 배달 {formatPrice(bid.delivery_fee)}</div>
                        </div>
                      </div>
                      <div className="agent-response-reason">{bid.message}</div>
                      <button className="select-agent-btn" style={{ marginTop: 8 }}>이 에이전트 선택</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 기사 입찰 대기 */}
            {phase === "delivery_drivers" && (
              <div className="agent-results-chat">
                <div className="chat-msg system">
                  <div className="chat-bot-icon">E</div>
                  <div className="chat-bubble system">
                    <p>기사님을 기다리고 있어요... ({driverBids.length}명 입찰)</p>
                  </div>
                </div>

                {driverBids.length > 0 ? (
                  <div className="agent-response-grid">
                    {driverBids.map((bid) => (
                      <div key={bid.id} className="agent-response-card" style={{ cursor: "pointer" }}
                        onClick={() => handleAcceptDriver(bid.id)}>
                        <div className="agent-response-header">
                          <div className="agent-avatar">🛵</div>
                          <div className="agent-response-info">
                            <div className="agent-response-name">{bid.driver_name || `기사 ${bid.driver_id}`}</div>
                            <div className="agent-response-meta">배달비 {formatPrice(bid.proposed_fee)} · 예상 {bid.estimated_time}분</div>
                          </div>
                        </div>
                        {bid.message && <div className="agent-response-reason">{bid.message}</div>}
                        <button className="select-agent-btn" style={{ marginTop: 8, background: "#34a853" }}>이 기사 선택</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: 20 }}>
                    <button className="refresh-btn" onClick={refreshDriverBids}>기사 새로고침</button>
                    <p style={{ fontSize: 13, color: "#9aa0a6", marginTop: 8 }}>
                      기사님이 아직 입찰하지 않았어요. /driver 에서 기사로 등록하고 입찰해보세요!
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 배달중 */}
            {phase === "delivering" && (
              <div style={{ textAlign: "center", padding: "30px 0" }}>
                <div style={{ fontSize: 56, marginBottom: 12, animation: "ride 2s ease-in-out infinite" }}>🛵</div>
                <p style={{ fontSize: 16, fontWeight: 600 }}>배달 중...</p>
                <p style={{ fontSize: 13, color: "#9aa0a6", marginBottom: 20 }}>기사님이 음식을 가져오고 있어요</p>
                <div style={{ maxWidth: 200, margin: "0 auto 20px" }}>
                  <div className="progress-bar"><div className="progress-fill" /></div>
                </div>
                <button className="confirm-btn-yes" onClick={() => setPhase("delivery_review")} style={{ maxWidth: 300 }}>
                  배달 받았어요
                </button>
              </div>
            )}

            {/* 리뷰 */}
            {phase === "delivery_review" && (
              <div style={{ maxWidth: 400, margin: "20px auto", background: "#fff", borderRadius: 16, padding: 24, border: "1px solid #e0e0e0" }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>배달은 어땠나요?</h3>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>에이전트</span>
                  <StarSelector value={agentRating} onChange={setAgentRating} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>기사</span>
                  <StarSelector value={driverRating} onChange={setDriverRating} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>음식</span>
                  <StarSelector value={foodRating} onChange={setFoodRating} />
                </div>
                <input
                  type="text"
                  value={reviewComment}
                  onChange={e => setReviewComment(e.target.value)}
                  placeholder="한마디 남기기"
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #dfe1e5", borderRadius: 8, marginTop: 12, fontSize: 14, outline: "none" }}
                />
                <button className="confirm-btn-yes" onClick={handleDeliveryReview} style={{ width: "100%", marginTop: 12 }}>
                  평가 보내기
                </button>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* 입력창 */}
          {!["delivering"].includes(phase) && (
            <form className="chat-input-form" onSubmit={handleSubmit}>
              <input
                ref={chatInputRef}
                className="chat-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  phase === "delivery_bids" ? "에이전트를 선택하거나 추가 질문..." :
                  phase === "delivery_drivers" ? "기사를 선택하거나 추가 질문..." :
                  phase === "confirm" ? "더 추가할 내용을 입력하세요..." :
                  phase === "agents" ? "추가 질문이 있으면 입력하세요..." :
                  "답변을 입력하세요..."
                }
                autoFocus
                disabled={chatLoading || deliveryLoading}
              />
              <button type="submit" className="chat-send-btn" disabled={chatLoading || deliveryLoading}>전송</button>
            </form>
          )}
        </div>
      )}

      <footer className="footer">
        <div className="footer-top">대한민국</div>
        <div className="footer-bottom">
          <div className="footer-links"><span>소개</span><span>개인정보처리방침</span><span>약관</span></div>
          <div className="footer-links"><span>API</span><span>에이전트</span><span>문의</span></div>
        </div>
      </footer>
    </div>
  );
}
