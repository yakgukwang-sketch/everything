"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  API_URL, Deal, ChatMessage, AgentBid, DriverBid, AgentInfo, MediaCard,
  formatPrice, sanitizeUrl,
} from "@/lib/shared";
import { detectDelivery, extractArea, extractFoodType, extractBudget, extractQuantity } from "@/lib/delivery-utils";
import DealFeed from "@/components/DealFeed";
import DeliveryFlow from "@/components/DeliveryFlow";

type DeliveryBid = AgentBid & { agent_name?: string; store_name?: string };

// 하드코딩된 에이전트 목록 (API 실패 시 폴백)
const FALLBACK_AGENTS: AgentInfo[] = [
  { id: "gamja", name: "감자", icon: "🥔", description: "싼 거 전문! 가성비 끝판왕", greeting: "안녕! 나 감자 🥔 싼 거 전문이야 ㅋㅋ 뭐 찾아?" },
  { id: "chip", name: "칩", icon: "💻", description: "노트북 전문가! 사양·트렌드·할인 다 알려줌", greeting: "안녕! 나 칩 💻 노트북이면 나한테 물어봐. 용도가 뭐야?" },
];

export default function Home() {
  const [input, setInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [phase, setPhase] = useState<
    "idle" | "chatting" | "agent_chat" |
    "delivery_bids" | "delivery_drivers" | "delivering" | "delivery_review"
  >("idle");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [feedTab, setFeedTab] = useState<"hot" | "latest">("hot");
  const [feedFilter, setFeedFilter] = useState("all");
  const [feedLoading, setFeedLoading] = useState(false);

  // 에이전트 채팅 state
  const [activeAgent, setActiveAgent] = useState<AgentInfo | null>(null);
  const [agents, setAgents] = useState<AgentInfo[]>(FALLBACK_AGENTS);

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

  // 에이전트 목록 로드
  useEffect(() => {
    fetch(`${API_URL}/api/agent/list`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.agents?.length > 0) setAgents(data.agents);
      })
      .catch(() => {}); // fallback 사용
  }, []);

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
  }, [chatMsgs, deliveryBids, driverBids, chatLoading, deliveryLoading, phase]);

  // === 에이전트 1:1 채팅 ===

  const startAgentChat = (agent: AgentInfo) => {
    setActiveAgent(agent);
    setPhase("agent_chat");
    setChatMsgs([{ role: "system", text: agent.greeting }]);
  };

  const sendToAgent = async (newMsgs: ChatMessage[], agentOverride?: AgentInfo) => {
    const agent = agentOverride || activeAgent;
    if (!agent) return;
    setChatLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agent.id,
          messages: newMsgs.map(m => ({ role: m.role === "user" ? "user" : "system", text: m.text })),
        }),
      });
      const data = await res.json();

      if (data.success) {
        const reply = data.reply || "음...";
        const options = data.options || [];
        const recommendations = (data.recommendations || []).map((r: { deal: Deal; comment: string }) => ({
          deal: r.deal,
          comment: r.comment,
        }));
        const media: MediaCard[] | undefined = data.media;
        setChatMsgs([...newMsgs, { role: "system", text: reply, options, recommendations, media }]);
      } else {
        setChatMsgs(prev => [...prev, { role: "system", text: "잠깐 문제 생겼어 😅 다시 말해줘!" }]);
      }
    } catch (err) {
      console.error(err);
      setChatMsgs(prev => [...prev, { role: "system", text: "네트워크 오류! 다시 시도해줘." }]);
    } finally {
      setChatLoading(false);
    }
  };

  // === 배달 전용 Gemini 대화 (기존 /api/chat) ===

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
          const qType = data.query.type || "";

          if (qType === "delivery") {
            const food = data.query.food || data.query.product || "";
            const area = data.query.area || extractArea(newMsgs.map(m => m.text).join(" "));
            const quantity = data.query.quantity || "1인분";
            const budget = parseInt(data.query.budget) || 50000;
            const deliveryQuery = `${area} ${food} ${quantity} ${budget}원`;

            setChatMsgs(prev => [...prev, { role: "system", text: `배달 주문이네! ${area} ${food} ${quantity} — 에이전트들이 경쟁 입찰 중...` }]);
            sendDeliveryRequest(deliveryQuery);
          }
          // 쇼핑은 더 이상 여기서 처리 안 함 — 에이전트 1:1 채팅으로 전환됨
        }
      }
    } catch (err) {
      console.error(err);
      setChatMsgs(prev => [...prev, { role: "system", text: "죄송해요, 잠시 문제가 생겼어요. 다시 말씀해주세요!" }]);
    } finally {
      setChatLoading(false);
    }
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
        body: JSON.stringify({ consumer_request: query, area, food_type: foodType, budget, quantity }),
      });
      const data = await res.json();
      if (data.success) {
        setDeliveryOrderId(data.order_id);
        const bids = (data.bids || []).map((b: Record<string, unknown>, i: number) => ({
          id: b.id || i + 1,
          order_id: data.order_id,
          agent_id: b.agent_id,
          agent_name: b.agent_name,
          store_name: typeof b.proposed_store === "string" ? b.proposed_store : (b.proposed_store != null && typeof b.proposed_store === "object") ? (b.proposed_store as Record<string, unknown>)?.name || b.store_name || "추천 가게" : b.store_name || "추천 가게",
          proposed_price: b.proposed_price,
          delivery_fee: b.delivery_fee,
          total_price: b.total_price,
          message: b.message,
          created_at: new Date().toISOString(),
        }));
        if (bids.length === 0) {
          setChatMsgs(prev => [...prev, { role: "system", text: data.message || "해당 지역에 등록된 가게가 없어요. 다른 지역이나 음식으로 다시 시도해보세요!" }]);
          setPhase("chatting");
        } else {
          setDeliveryBids(bids);
          setPhase("delivery_bids");
        }
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
    if (agentSelectingRef.current) return;
    agentSelectingRef.current = true;
    setDeliveryLoading(true);
    setChatMsgs(prev => [...prev, { role: "system", text: "에이전트를 선택하는 중..." }]);
    try {
      const res = await fetch(`${API_URL}/api/delivery/${deliveryOrderId}/select-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_bid_id: bidId }),
      });
      const data = await res.json();
      if (data.success) {
        const orderRes = await fetch(`${API_URL}/api/delivery/${deliveryOrderId}`);
        const orderData = await orderRes.json();
        setDriverBids(orderData.data?.driver_bids || []);
        setPhase("delivery_drivers");
        setChatMsgs(prev => [...prev, { role: "system", text: "에이전트를 선택했어요! 기사님을 찾고 있어요..." }]);
      } else {
        setChatMsgs(prev => [...prev, { role: "system", text: data.error || "에이전트 선택에 실패했어요. 다시 시도해주세요." }]);
      }
    } catch (err) {
      console.error(err);
      setChatMsgs(prev => [...prev, { role: "system", text: "네트워크 오류가 발생했어요. 다시 시도해주세요." }]);
    } finally {
      setDeliveryLoading(false);
      agentSelectingRef.current = false;
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
      const completeRes = await fetch(`${API_URL}/api/delivery/${deliveryOrderId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const completeData = await completeRes.json();
      if (!completeData.success) {
        setChatMsgs(prev => [...prev, { role: "system", text: "배달 완료 처리에 실패했어요. 다시 시도해주세요." }]);
        return;
      }
      const reviewRes = await fetch(`${API_URL}/api/delivery/${deliveryOrderId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_rating: agentRating, driver_rating: driverRating, food_rating: foodRating, comment: reviewComment }),
      });
      const reviewData = await reviewRes.json();
      if (reviewData.success) {
        setChatMsgs(prev => [...prev, { role: "system", text: "평가 완료! 감사합니다" }]);
      } else {
        setChatMsgs(prev => [...prev, { role: "system", text: "배달은 완료됐지만 평가 저장에 실패했어요." }]);
      }
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

    // 에이전트 1:1 채팅 중이면 에이전트에게 전송
    if (phase === "agent_chat" && activeAgent) {
      const newMsgs = [...chatMsgs, { role: "user" as const, text }];
      setChatMsgs(newMsgs);
      sendToAgent(newMsgs);
      return;
    }

    const newMsgs = [...chatMsgs, { role: "user" as const, text }];
    setChatMsgs(newMsgs);

    if (phase === "idle" || phase === "delivery_review") {
      // 배달 키워드 감지하면 배달 플로우
      if (detectDelivery(text)) {
        setPhase("chatting");
        sendChat(newMsgs);
        return;
      }
      // 그 외 쇼핑 → 감자 에이전트로 바로 연결
      const gamja = agents.find(a => a.id === "gamja") || FALLBACK_AGENTS[0];
      setActiveAgent(gamja);
      setPhase("agent_chat");
      const agentMsgs: ChatMessage[] = [
        { role: "system", text: gamja.greeting },
        { role: "user", text },
      ];
      setChatMsgs(agentMsgs);
      sendToAgent(agentMsgs, gamja);
      return;
    }

    if (phase === "chatting") {
      sendChat(newMsgs);
    }
  };

  // 선택지 클릭
  const handleOptionClick = (option: string) => {
    if (chatLoading) return;
    const newMsgs = [...chatMsgs, { role: "user" as const, text: option }];
    setChatMsgs(newMsgs);
    if (phase === "agent_chat") {
      sendToAgent(newMsgs);
    } else {
      sendChat(newMsgs);
    }
  };

  // 새 대화
  const handleReset = () => {
    setChatMsgs([]);
    setPhase("idle");
    setActiveAgent(null);
    setDeliveryBids([]);
    setDriverBids([]);
    setDeliveryOrderId(null);
    setChatLoading(false);
    setDeliveryLoading(false);
    setAgentRating(5);
    setDriverRating(5);
    setFoodRating(5);
    setReviewComment("");
  };

  // 미디어 카드 렌더러
  const renderMediaCard = (card: MediaCard, idx: number) => {
    switch (card.type) {
      case "image": {
        const inner = (
          <div className="media-card media-image" key={idx}>
            <img src={card.image_url} alt={card.caption || ""} referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            {card.caption && <div className="media-image-caption">{card.caption}</div>}
          </div>
        );
        return card.link_url ? <a key={idx} href={sanitizeUrl(card.link_url)} target="_blank" rel="noopener noreferrer">{inner}</a> : inner;
      }
      case "link":
        return (
          <a key={idx} href={sanitizeUrl(card.url)} target="_blank" rel="noopener noreferrer" className="media-card media-link">
            {card.image_url && <img src={card.image_url} alt="" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
            <div className="media-link-text">
              <div className="media-link-title">{card.title}</div>
              {card.description && <div className="media-link-desc">{card.description}</div>}
            </div>
          </a>
        );
      case "banner": {
        const inner = (
          <div className="media-card media-banner" key={idx}>
            <img src={card.image_url} alt="" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          </div>
        );
        return card.link_url ? <a key={idx} href={sanitizeUrl(card.link_url)} target="_blank" rel="noopener noreferrer">{inner}</a> : inner;
      }
      default:
        return null;
    }
  };

  // 현재 에이전트 아이콘
  const botIcon = activeAgent?.icon || "E";

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
          <h1 className="logo">everything</h1>
          <p className="tagline">당신을 위한 세일즈맨</p>

          {/* 에이전트 카드 섹션 */}
          <div className="agent-cards-section">
            {agents.map(agent => (
              <div
                key={agent.id}
                className="agent-select-card"
                onClick={() => startAgentChat(agent)}
              >
                <div className="agent-select-icon">{agent.icon}</div>
                <div className="agent-select-info">
                  <div className="agent-select-name">{agent.name} 에이전트</div>
                  <div className="agent-select-desc">{agent.description}</div>
                </div>
              </div>
            ))}
            <div className="agent-select-card agent-coming-soon">
              <div className="agent-select-icon" style={{ opacity: 0.4 }}>🔜</div>
              <div className="agent-select-info">
                <div className="agent-select-name" style={{ opacity: 0.5 }}>더 많은 에이전트</div>
                <div className="agent-select-desc" style={{ opacity: 0.4 }}>coming soon...</div>
              </div>
            </div>
          </div>

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
                if (detectDelivery(ex)) {
                  const msgs = [{ role: "user" as const, text: ex }];
                  setChatMsgs(msgs);
                  setPhase("chatting");
                  sendChat(msgs);
                } else {
                  // 쇼핑 → 감자 에이전트
                  const gamja = agents.find(a => a.id === "gamja") || FALLBACK_AGENTS[0];
                  setActiveAgent(gamja);
                  setPhase("agent_chat");
                  const agentMsgs: ChatMessage[] = [
                    { role: "system", text: gamja.greeting },
                    { role: "user", text: ex },
                  ];
                  setChatMsgs(agentMsgs);
                  sendToAgent(agentMsgs, gamja);
                }
              }}>
                {ex}
              </button>
            ))}
          </div>

          {/* 딜 피드 */}
          <DealFeed
            deals={deals}
            feedTab={feedTab}
            feedFilter={feedFilter}
            feedLoading={feedLoading}
            onTabChange={setFeedTab}
            onFilterChange={setFeedFilter}
          />
        </div>
      ) : (
        /* 대화 모드 */
        <div className="chat-container">
          <div className="chat-header">
            <div className="results-logo" onClick={handleReset} style={{ cursor: "pointer" }}>
              {activeAgent ? (
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 24 }}>{activeAgent.icon}</span>
                  <span style={{ fontWeight: 700 }}>{activeAgent.name}</span>
                </span>
              ) : (
                <>
                  <span style={{ color: "#4285f4" }}>e</span><span style={{ color: "#ea4335" }}>v</span><span>e</span>
                  <span style={{ color: "#4285f4" }}>r</span><span style={{ color: "#34a853" }}>y</span><span>t</span>
                  <span style={{ color: "#fbbc05" }}>h</span><span>i</span><span style={{ color: "#ea4335" }}>n</span>
                  <span style={{ color: "#4285f4" }}>g</span>
                </>
              )}
            </div>
            <button className="reset-btn" onClick={handleReset}>새 대화</button>
          </div>

          <div className="chat-messages">
            {chatMsgs.map((msg, i) => (
              <div key={i}>
                <div className={`chat-msg ${msg.role}`}>
                  {msg.role === "system" && <div className="chat-bot-icon">{botIcon}</div>}
                  <div className={`chat-bubble ${msg.role}`}>
                    <p>{msg.text}</p>
                  </div>
                </div>

                {/* 추천 상품 카드 (인라인) */}
                {msg.role === "system" && msg.recommendations && msg.recommendations.length > 0 && (
                  <div className="agent-recommend-cards">
                    {msg.recommendations.map((rec, j) => (
                      <a
                        key={j}
                        href={sanitizeUrl(rec.deal.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="agent-recommend-card"
                      >
                        {rec.deal.image_url && (
                          <div className="agent-recommend-img">
                            <img
                              src={rec.deal.image_url}
                              alt=""
                              referrerPolicy="no-referrer"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          </div>
                        )}
                        <div className="agent-recommend-info">
                          <div className="agent-recommend-title">
                            {rec.deal.title?.substring(0, 40)}{(rec.deal.title?.length || 0) > 40 ? "..." : ""}
                          </div>
                          <div className="agent-recommend-price">
                            {rec.deal.sale_price > 0 ? formatPrice(rec.deal.sale_price) : ""}
                            {rec.deal.discount_rate > 0 && (
                              <span className="agent-recommend-discount">{rec.deal.discount_rate}% OFF</span>
                            )}
                          </div>
                          {rec.comment && <div className="agent-recommend-comment">{rec.comment}</div>}
                          <div className="agent-recommend-source">{rec.deal.source}</div>
                        </div>
                      </a>
                    ))}
                  </div>
                )}

                {/* 미디어 카드 */}
                {msg.role === "system" && msg.media && msg.media.length > 0 && (
                  <div className="agent-media-cards">
                    {msg.media.map((card, j) => renderMediaCard(card, j))}
                  </div>
                )}

                {/* 선택지 버튼 */}
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
                <div className="chat-bot-icon">{botIcon}</div>
                <div className="chat-bubble system">
                  <div className="typing-indicator">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              </div>
            )}

            {/* 배달 플로우 */}
            <DeliveryFlow
              phase={phase}
              deliveryOrderId={deliveryOrderId}
              deliveryBids={deliveryBids}
              driverBids={driverBids}
              agentRating={agentRating}
              driverRating={driverRating}
              foodRating={foodRating}
              reviewComment={reviewComment}
              onSelectAgent={handleSelectDeliveryAgent}
              onAcceptDriver={handleAcceptDriver}
              onRefreshDrivers={refreshDriverBids}
              onDeliveryReview={handleDeliveryReview}
              onSetPhase={(p) => setPhase(p as typeof phase)}
              onSetAgentRating={setAgentRating}
              onSetDriverRating={setDriverRating}
              onSetFoodRating={setFoodRating}
              onSetReviewComment={setReviewComment}
              onAddChatMsg={(msg) => setChatMsgs(prev => [...prev, msg])}
            />

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
                  phase === "agent_chat" && activeAgent ? `${activeAgent.name}에게 말하기...` :
                  phase === "delivery_bids" ? "에이전트를 선택하거나 추가 질문..." :
                  phase === "delivery_drivers" ? "기사를 선택하거나 추가 질문..." :
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
