"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  API_URL, AgentBid, DriverBid, DELIVERY_STATUS, formatPrice, timeAgo,
  AGENT_ICONS,
} from "@/lib/shared";

type DeliveryState = {
  id: number;
  consumer_request: string;
  area: string;
  food_type: string;
  budget: number;
  quantity: string;
  status: string;
  agent_bids: (AgentBid & { agent_name?: string; store_name?: string })[];
  driver_bids: (DriverBid & { driver_name?: string })[];
};

export default function DeliveryPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"input" | "agents" | "drivers" | "delivering" | "review">("input");
  const [loading, setLoading] = useState(false);

  // Input form
  const [request, setRequest] = useState("");
  const [area, setArea] = useState("부천");
  const [foodType, setFoodType] = useState("");
  const [budget, setBudget] = useState("");
  const [quantity, setQuantity] = useState("");

  // Order state
  const [order, setOrder] = useState<DeliveryState | null>(null);

  // Review
  const [agentRating, setAgentRating] = useState(5);
  const [driverRating, setDriverRating] = useState(5);
  const [foodRating, setFoodRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");

  const AREAS = ["부천", "인천", "서울", "수원", "성남", "안양", "고양", "용인", "화성", "시흥"];

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request.trim()) return;
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/delivery/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consumer_request: request.trim(),
          area,
          food_type: foodType || request.trim(),
          budget: parseInt(budget) || 50000,
          quantity: quantity || "1인분",
        }),
      });
      const data = await res.json();
      if (data.success) {
        // API returns "bids" on creation, map to agent_bids format
        const agentBids = (data.bids || data.agent_bids || []).map((b: Record<string, unknown>, i: number) => ({
          id: b.id || i + 1,
          order_id: data.order_id,
          agent_id: b.agent_id,
          agent_name: b.agent_name,
          proposed_store_id: b.proposed_store_id,
          store_name: (b.proposed_store as Record<string, unknown>)?.name || b.store_name || "추천 가게",
          proposed_price: b.proposed_price,
          delivery_fee: b.delivery_fee,
          total_price: b.total_price,
          message: b.message,
          created_at: b.created_at || new Date().toISOString(),
        }));
        setOrder({
          id: data.order_id,
          consumer_request: request,
          area,
          food_type: foodType || request,
          budget: parseInt(budget) || 50000,
          quantity: quantity || "1인분",
          status: "agent_bidding",
          agent_bids: agentBids,
          driver_bids: [],
        });
        setPhase("agents");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAgent = async (bidId: number) => {
    if (!order) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/delivery/${order.id}/select-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_bid_id: bidId }),
      });
      const data = await res.json();
      if (data.success) {
        // Refresh order to get driver bids
        await refreshOrder(order.id);
        setPhase("drivers");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptDriver = async (bidId: number) => {
    if (!order) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/delivery/${order.id}/accept-driver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driver_bid_id: bidId }),
      });
      const data = await res.json();
      if (data.success) {
        setOrder(prev => prev ? { ...prev, status: "delivering" } : null);
        setPhase("delivering");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async () => {
    if (!order) return;
    setLoading(true);
    try {
      await fetch(`${API_URL}/api/delivery/${order.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_rating: agentRating,
          driver_rating: driverRating,
          food_rating: foodRating,
          comment: reviewComment,
        }),
      });
      setOrder(prev => prev ? { ...prev, status: "reviewed" } : null);
      setPhase("review");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const refreshOrder = async (orderId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/delivery/${orderId}`);
      const data = await res.json();
      if (data.success) {
        setOrder(prev => ({
          ...prev!,
          ...data.data,
          agent_bids: data.agent_bids || prev?.agent_bids || [],
          driver_bids: data.driver_bids || prev?.driver_bids || [],
        }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const StarSelector = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) => (
    <div className="rating-selector">
      <span className="rating-label">{label}</span>
      <div className="rating-stars">
        {[1, 2, 3, 4, 5].map(i => (
          <button key={i} type="button" className={`star-btn ${i <= value ? "active" : ""}`} onClick={() => onChange(i)}>
            {i <= value ? "★" : "☆"}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="delivery-page">
      <header className="driver-header">
        <div className="driver-header-left" onClick={() => router.push("/")} style={{ cursor: "pointer" }}>
          <span className="driver-logo">
            <span style={{ color: "#4285f4" }}>e</span><span style={{ color: "#ea4335" }}>v</span><span>e</span>
            <span style={{ color: "#4285f4" }}>r</span><span style={{ color: "#34a853" }}>y</span><span>t</span>
            <span style={{ color: "#fbbc05" }}>h</span><span>i</span><span style={{ color: "#ea4335" }}>n</span>
            <span style={{ color: "#4285f4" }}>g</span>
          </span>
          <span className="driver-badge" style={{ background: "#ea4335" }}>DELIVERY</span>
        </div>
      </header>

      <div className="delivery-content">
        {/* Step 1: Input */}
        {phase === "input" && (
          <div className="delivery-input-section">
            <h2>뭐 먹고 싶어?</h2>
            <p>원하는 음식, 지역, 예산을 알려주세요. 에이전트들이 경쟁해서 최고의 조건을 찾아드려요.</p>

            <form className="delivery-form" onSubmit={handleSubmitOrder}>
              <div className="form-group">
                <label>주문 내용</label>
                <input
                  type="text"
                  value={request}
                  onChange={e => setRequest(e.target.value)}
                  placeholder="예: 부천 제육볶음 4인분 4만원 안에 시켜줘"
                  required
                  autoFocus
                />
              </div>

              <div className="delivery-form-grid">
                <div className="form-group">
                  <label>지역</label>
                  <select value={area} onChange={e => setArea(e.target.value)}>
                    {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>음식 종류</label>
                  <input type="text" value={foodType} onChange={e => setFoodType(e.target.value)} placeholder="제육볶음" />
                </div>
                <div className="form-group">
                  <label>예산 (원)</label>
                  <input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="40000" />
                </div>
                <div className="form-group">
                  <label>수량</label>
                  <input type="text" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="4인분" />
                </div>
              </div>

              <button type="submit" className="delivery-submit" disabled={loading}>
                {loading ? "에이전트 찾는 중..." : "에이전트에게 맡기기"}
              </button>
            </form>

            <div className="delivery-examples">
              <p>이런 것도 가능해요</p>
              <div className="quick-examples">
                {[
                  "부천 제육볶음 4인분 4만원",
                  "인천 치킨 2마리 3만원",
                  "서울 피자 라지 2판",
                  "수원 곱창 2인분",
                ].map(ex => (
                  <button key={ex} className="example-chip" onClick={() => {
                    setRequest(ex);
                    const parts = ex.split(" ");
                    if (parts.length > 0) setArea(parts[0]);
                    if (parts.length > 1) setFoodType(parts[1]);
                  }}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Agent Bids */}
        {phase === "agents" && order && (
          <div className="delivery-agents-section">
            <div className="order-summary-bar">
              <div className="order-summary-text">{order.consumer_request}</div>
              <div className="order-summary-tags">
                <span className="job-area">{order.area}</span>
                <span className="job-food">{order.food_type}</span>
                <span className="job-budget">{formatPrice(order.budget)}</span>
                <span className="job-qty">{order.quantity}</span>
              </div>
            </div>

            <h3>에이전트 제안 ({order.agent_bids.length}건)</h3>
            <p className="section-desc">에이전트들이 조건을 제시했어요. 마음에 드는 걸 선택하세요.</p>

            {order.agent_bids.length > 0 ? (
              <div className="agent-bid-list">
                {order.agent_bids.map((bid, i) => (
                  <div key={bid.id} className={`agent-bid-card ${i === 0 ? "best-bid" : ""}`}>
                    <div className="agent-bid-header">
                      <div className="agent-bid-avatar">{AGENT_ICONS[bid.agent_name || ""] || "🤖"}</div>
                      <div className="agent-bid-info">
                        <div className="agent-bid-name">
                          {bid.agent_name || `에이전트 ${bid.agent_id}`}
                          {i === 0 && <span className="best-badge">BEST</span>}
                        </div>
                        <div className="agent-bid-store">{bid.store_name || "추천 가게"}</div>
                      </div>
                      <div className="agent-bid-price">
                        <div className="bid-total">{formatPrice(bid.total_price)}</div>
                        <div className="bid-breakdown">음식 {formatPrice(bid.proposed_price)} + 배달 {formatPrice(bid.delivery_fee)}</div>
                      </div>
                    </div>
                    <div className="agent-bid-message">{bid.message}</div>
                    <button className="select-agent-btn" onClick={() => handleSelectAgent(bid.id)} disabled={loading}>
                      이 에이전트 선택
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-jobs">
                <div className="empty-icon">🔍</div>
                <p>에이전트가 조건을 분석 중입니다...</p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Driver Bids */}
        {phase === "drivers" && order && (
          <div className="delivery-drivers-section">
            <div className="order-summary-bar">
              <div className="order-summary-text">{order.consumer_request}</div>
              <span className="status-badge" style={{ background: DELIVERY_STATUS[order.status]?.color }}>
                {DELIVERY_STATUS[order.status]?.label}
              </span>
            </div>

            <h3>기사 입찰 ({order.driver_bids.length}건)</h3>
            <p className="section-desc">기사들이 배달 조건을 제시하고 있어요.</p>

            {order.driver_bids.length > 0 ? (
              <div className="driver-bid-list">
                {order.driver_bids.map((bid) => (
                  <div key={bid.id} className="driver-bid-card">
                    <div className="driver-bid-info">
                      <div className="driver-bid-icon">🛵</div>
                      <div>
                        <div className="driver-bid-name">{bid.driver_name || `기사 ${bid.driver_id}`}</div>
                        <div className="driver-bid-meta">
                          배달비 {formatPrice(bid.proposed_fee)} · {bid.estimated_time}분
                        </div>
                      </div>
                    </div>
                    {bid.message && <div className="driver-bid-message">{bid.message}</div>}
                    <button className="select-agent-btn" onClick={() => handleAcceptDriver(bid.id)} disabled={loading}>
                      이 기사 선택
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-jobs">
                <div className="empty-icon">🛵</div>
                <p>기사를 기다리는 중...</p>
                <button className="refresh-btn" onClick={() => refreshOrder(order.id)} style={{ marginTop: 12 }}>
                  새로고침
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Delivering */}
        {phase === "delivering" && order && (
          <div className="delivering-section">
            <div className="delivering-card">
              <div className="delivering-icon">🛵</div>
              <h2>배달 중...</h2>
              <p>{order.consumer_request}</p>
              <div className="delivering-progress">
                <div className="progress-bar">
                  <div className="progress-fill" />
                </div>
              </div>
              <p className="delivering-sub">기사님이 배달 중입니다. 잠시만 기다려주세요.</p>
              <button className="delivery-submit" onClick={() => setPhase("review")} style={{ marginTop: 24 }}>
                배달 받았어요 — 평가하기
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {phase === "review" && order && (
          <div className="review-section">
            <div className="review-card">
              <h2>배달은 어땠나요?</h2>
              <p>{order.consumer_request}</p>

              <StarSelector value={agentRating} onChange={setAgentRating} label="에이전트" />
              <StarSelector value={driverRating} onChange={setDriverRating} label="기사" />
              <StarSelector value={foodRating} onChange={setFoodRating} label="음식" />

              <div className="form-group" style={{ marginTop: 16 }}>
                <label>한마디</label>
                <input type="text" value={reviewComment} onChange={e => setReviewComment(e.target.value)} placeholder="맛있었어요!" />
              </div>

              <button className="delivery-submit" onClick={handleReview} disabled={loading}>
                {order.status === "reviewed" ? "평가 완료!" : "평가 보내기"}
              </button>

              {order.status === "reviewed" && (
                <button className="refresh-btn" onClick={() => { setPhase("input"); setOrder(null); }} style={{ marginTop: 12, width: "100%" }}>
                  새 주문하기
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
