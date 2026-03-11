"use client";

import { API_URL, AgentBid, DriverBid, AGENT_ICONS, formatPrice, ChatMessage } from "@/lib/shared";

type DeliveryBid = AgentBid & { agent_name?: string; store_name?: string };

type DeliveryFlowProps = {
  phase: string;
  deliveryOrderId: number | null;
  deliveryBids: DeliveryBid[];
  driverBids: DriverBid[];
  agentRating: number;
  driverRating: number;
  foodRating: number;
  reviewComment: string;
  onSelectAgent: (bidId: number) => void;
  onAcceptDriver: (bidId: number) => void;
  onRefreshDrivers: () => void;
  onDeliveryReview: () => void;
  onSetPhase: (phase: string) => void;
  onSetAgentRating: (v: number) => void;
  onSetDriverRating: (v: number) => void;
  onSetFoodRating: (v: number) => void;
  onSetReviewComment: (v: string) => void;
  onAddChatMsg: (msg: ChatMessage) => void;
};

function StarSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" onClick={() => onChange(i)}
          style={{ fontSize: 20, color: i <= value ? "#fbbc05" : "#e0e0e0", background: "none", border: "none", cursor: "pointer", padding: 1 }}>
          {i <= value ? "★" : "☆"}
        </button>
      ))}
    </div>
  );
}

export default function DeliveryFlow({
  phase, deliveryOrderId, deliveryBids, driverBids,
  agentRating, driverRating, foodRating, reviewComment,
  onSelectAgent, onAcceptDriver, onRefreshDrivers, onDeliveryReview,
  onSetPhase, onSetAgentRating, onSetDriverRating, onSetFoodRating, onSetReviewComment,
  onAddChatMsg,
}: DeliveryFlowProps) {
  return (
    <>
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
            {[...deliveryBids].sort((a, b) => (a.total_price || 0) - (b.total_price || 0)).slice(0, 6).map((bid, i) => (
              <div key={bid.id} className={`agent-response-card ${i === 0 ? "agent-best" : ""}`} style={{ cursor: "pointer" }}
                onClick={() => onSelectAgent(bid.id)}>
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
                  onClick={() => onAcceptDriver(bid.id)}>
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
              <button className="refresh-btn" onClick={onRefreshDrivers}>기사 새로고침</button>
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
          <button className="confirm-btn-yes" onClick={async () => {
            if (!deliveryOrderId) return;
            try {
              const res = await fetch(`${API_URL}/api/delivery/${deliveryOrderId}/complete`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
              });
              const data = await res.json();
              if (data.success) {
                onSetPhase("delivery_review");
              } else {
                onAddChatMsg({ role: "system", text: "배달 완료 처리에 실패했어요. 다시 시도해주세요." });
              }
            } catch (err) {
              console.error(err);
              onAddChatMsg({ role: "system", text: "네트워크 오류가 발생했어요." });
            }
          }} style={{ maxWidth: 300 }}>
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
            <StarSelector value={agentRating} onChange={onSetAgentRating} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>기사</span>
            <StarSelector value={driverRating} onChange={onSetDriverRating} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>음식</span>
            <StarSelector value={foodRating} onChange={onSetFoodRating} />
          </div>
          <input
            type="text"
            value={reviewComment}
            onChange={e => onSetReviewComment(e.target.value)}
            placeholder="한마디 남기기"
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #dfe1e5", borderRadius: 8, marginTop: 12, fontSize: 14, outline: "none" }}
          />
          <button className="confirm-btn-yes" onClick={onDeliveryReview} style={{ width: "100%", marginTop: 12 }}>
            평가 보내기
          </button>
        </div>
      )}
    </>
  );
}
