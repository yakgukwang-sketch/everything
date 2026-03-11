"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  API_URL, Deal, AgentResponse, ChatMessage, AgentBid, DriverBid,
  AGENT_ICONS, AGENT_INTROS,
  formatPrice, sanitizeUrl,
} from "@/lib/shared";
import { detectDelivery, extractArea, extractFoodType, extractBudget, extractQuantity } from "@/lib/delivery-utils";
import DealFeed from "@/components/DealFeed";
import DeliveryFlow from "@/components/DeliveryFlow";

type DeliveryBid = AgentBid & { agent_name?: string; store_name?: string };

export default function Home() {
  const [input, setInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [agentResponses, setAgentResponses] = useState<AgentResponse[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const [phase, setPhase] = useState<
    "idle" | "chatting" | "agents" |
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
            // confirm 없이 바로 에이전트에게 전달
            setPhase("agents");
            setChatMsgs(prev => [...prev, { role: "system", text: "좋아요! 에이전트들에게 물어볼게요." }]);
            sendToAgents(finalQuery);
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
        (a: AgentResponse, b: AgentResponse) => (b.rating || 0) - (a.rating || 0)
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
    if (agentSelectingRef.current) return; // ref 기반 중복 클릭 방지
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
        // 주문 상세 조회해서 driver bids 가져오기
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
        body: JSON.stringify({
          agent_rating: agentRating,
          driver_rating: driverRating,
          food_rating: foodRating,
          comment: reviewComment,
        }),
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

    const newMsgs = [...chatMsgs, { role: "user" as const, text }];
    setChatMsgs(newMsgs);

    if (phase === "idle" || phase === "agents" || phase === "delivery_review") {
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
    const isDelivery = detectDelivery(query);
    if (isDelivery) {
      setChatMsgs(prev => [...prev, { role: "system", text: "배달 주문이네요! 에이전트들이 최적의 가게를 찾고 있어요..." }]);
      sendDeliveryRequest(query);
    } else {
      setPhase("agents");
      setChatMsgs(prev => [...prev, { role: "system", text: "좋아요! 에이전트들에게 물어볼게요." }]);
      sendToAgents(query);
    }
  };

  // 선택지 클릭
  const handleOptionClick = (option: string) => {
    if (chatLoading) return;
    const newMsgs = [...chatMsgs, { role: "user" as const, text: option }];
    setChatMsgs(newMsgs);
    sendChat(newMsgs);
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

            {/* 에이전트 로딩 (쇼핑) */}
            {agentLoading && (
              <div className="chat-msg system">
                <div className="chat-bot-icon">E</div>
                <div className="chat-bubble system">
                  <p>에이전트들이 경쟁 중...</p>
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
                            ★ {(r.rating || 0).toFixed(1)} · 수수료 {r.commission_rate}%
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
                  phase === "delivery_bids" ? "에이전트를 선택하거나 추가 질문..." :
                  phase === "delivery_drivers" ? "기사를 선택하거나 추가 질문..." :
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
