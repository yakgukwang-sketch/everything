"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  API_URL, AgentBid, DELIVERY_STATUS, formatPrice, timeAgo,
  AGENT_ICONS, AGENT_INTROS,
} from "@/lib/shared";

type AgentInfo = {
  id: number;
  name: string;
  description: string;
  commission_rate: number;
  rating: number;
  review_count: number;
  total_queries: number;
  status: string;
};

type BidWithOrder = AgentBid & {
  consumer_request: string;
  area: string;
  food_type: string;
  quantity: string;
  order_status: string;
  selected_agent_id: number;
  is_selected: boolean;
};

export default function AgentPage() {
  const router = useRouter();
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [bids, setBids] = useState<BidWithOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"bids" | "stats">("bids");

  // Load agent list for selection
  useEffect(() => {
    const savedId = localStorage.getItem("agent_id");
    fetchAgents(savedId);
  }, []);

  const fetchAgents = async (savedId: string | null) => {
    try {
      const res = await fetch(`${API_URL}/api/agents`);
      const data = await res.json();
      if (data.success && data.data) {
        setAgents(data.data);
        if (savedId) {
          const found = data.data.find((a: AgentInfo) => String(a.id) === savedId);
          if (found) {
            setAgent(found);
            loadBids(savedId);
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const selectAgent = (id: string) => {
    localStorage.setItem("agent_id", id);
    const found = agents.find(a => String(a.id) === id);
    if (found) {
      setAgent(found);
      loadBids(id);
    }
  };

  const loadBids = useCallback(async (agentId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/agents/${agentId}/bids`);
      const data = await res.json();
      setBids(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = () => {
    localStorage.removeItem("agent_id");
    setAgent(null);
    setBids([]);
  };

  // Stats computed from bids
  const totalBids = bids.length;
  const wonBids = bids.filter(b => b.is_selected).length;
  const winRate = totalBids > 0 ? Math.round((wonBids / totalBids) * 100) : 0;

  const bidStatusLabel = (bid: BidWithOrder) => {
    if (bid.is_selected) return { text: "선택됨", icon: "✅", color: "#34a853" };
    if (bid.order_status === "agent_bidding") return { text: "대기중", icon: "⏳", color: "#ff9800" };
    return { text: "미선택", icon: "❌", color: "#ea4335" };
  };

  return (
    <div className="driver-page">
      <header className="driver-header">
        <div className="driver-header-left" onClick={() => router.push("/")} style={{ cursor: "pointer" }}>
          <span className="driver-logo">
            <span style={{ color: "#4285f4" }}>e</span><span style={{ color: "#ea4335" }}>v</span><span>e</span>
            <span style={{ color: "#4285f4" }}>r</span><span style={{ color: "#34a853" }}>y</span><span>t</span>
            <span style={{ color: "#fbbc05" }}>h</span><span>i</span><span style={{ color: "#ea4335" }}>n</span>
            <span style={{ color: "#4285f4" }}>g</span>
          </span>
          <span className="driver-badge" style={{ background: "#4285f4" }}>AGENT</span>
        </div>
        {agent && (
          <div className="driver-profile-mini">
            <span className="driver-status-dot" style={{ background: "#4285f4" }} />
            <span>{AGENT_ICONS[agent.name] || "🤖"} {agent.name}</span>
            <button onClick={logout} style={{ fontSize: 12, color: "#5f6368", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
              변경
            </button>
          </div>
        )}
      </header>

      {/* Agent selection */}
      {!agent && (
        <div className="driver-content">
          <div className="driver-register" style={{ flexDirection: "column", alignItems: "center" }}>
            <div className="register-card">
              <h2>에이전트 선택</h2>
              <p style={{ color: "#5f6368", marginBottom: 20 }}>대시보드에 접속할 에이전트를 선택하세요</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {agents.map(a => (
                  <button
                    key={a.id}
                    onClick={() => selectAgent(String(a.id))}
                    className="agent-select-btn"
                  >
                    <span style={{ fontSize: 20 }}>{AGENT_ICONS[a.name] || "🤖"}</span>
                    <div style={{ flex: 1, textAlign: "left" }}>
                      <div style={{ fontWeight: 600 }}>{a.name}</div>
                      <div style={{ fontSize: 12, color: "#5f6368" }}>{AGENT_INTROS[a.name] || a.description}</div>
                    </div>
                    <span style={{ fontSize: 12, color: "#5f6368" }}>수수료 {a.commission_rate}%</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      {agent && (
        <div className="driver-tabs">
          <button className={`driver-tab ${tab === "bids" ? "active" : ""}`} onClick={() => { setTab("bids"); loadBids(String(agent.id)); }}>
            내 입찰 ({totalBids})
          </button>
          <button className={`driver-tab ${tab === "stats" ? "active" : ""}`} onClick={() => setTab("stats")}>
            실적
          </button>
        </div>
      )}

      {/* Content */}
      {agent && (
        <div className="driver-content">
          {/* Bids Tab */}
          {tab === "bids" && (
            <div className="driver-jobs">
              <div className="jobs-header">
                <h2>내 입찰 내역</h2>
                <button className="refresh-btn" onClick={() => loadBids(String(agent.id))}>새로고침</button>
              </div>

              {loading ? (
                <div className="loading">
                  <div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" />
                </div>
              ) : bids.length > 0 ? (
                <div className="job-list">
                  {bids.map(bid => {
                    const status = bidStatusLabel(bid);
                    return (
                      <div key={bid.id} className="job-card">
                        <div className="job-top">
                          <div className="job-info">
                            <div className="job-request">{bid.consumer_request}</div>
                            <div className="job-meta">
                              <span className="job-area">{bid.area}</span>
                              <span className="job-food">{bid.food_type}</span>
                              <span className="job-qty">{bid.quantity}</span>
                            </div>
                          </div>
                          <div className="job-time">{timeAgo(bid.created_at)}</div>
                        </div>

                        <div className="job-status-bar">
                          <span className="status-badge" style={{ background: DELIVERY_STATUS[bid.order_status]?.color || "#9e9e9e" }}>
                            {DELIVERY_STATUS[bid.order_status]?.label || bid.order_status}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: status.color }}>
                            {status.icon} {status.text}
                          </span>
                        </div>

                        <div className="agent-bid-prices">
                          <div className="agent-bid-price-item">
                            <span className="agent-bid-price-label">상품가</span>
                            <span className="agent-bid-price-value">{formatPrice(bid.proposed_price)}</span>
                          </div>
                          <div className="agent-bid-price-item">
                            <span className="agent-bid-price-label">배달비</span>
                            <span className="agent-bid-price-value">{formatPrice(bid.delivery_fee)}</span>
                          </div>
                          <div className="agent-bid-price-item" style={{ borderTop: "1px solid #e0e0e0", paddingTop: 8 }}>
                            <span className="agent-bid-price-label" style={{ fontWeight: 700 }}>합계</span>
                            <span className="agent-bid-price-value" style={{ fontWeight: 700, color: "#4285f4" }}>{formatPrice(bid.total_price)}</span>
                          </div>
                        </div>

                        {bid.message && (
                          <div style={{ fontSize: 13, color: "#5f6368", marginTop: 8, fontStyle: "italic" }}>
                            &quot;{bid.message}&quot;
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-jobs">
                  <div className="empty-icon">🤖</div>
                  <p>아직 입찰 내역이 없습니다</p>
                  <p className="empty-sub">배달 주문이 들어오면 자동으로 입찰합니다</p>
                </div>
              )}
            </div>
          )}

          {/* Stats Tab */}
          {tab === "stats" && (
            <div className="driver-my-deliveries">
              <h2>실적 현황</h2>
              <div className="driver-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                <div className="stat-card">
                  <div className="stat-num">{totalBids}</div>
                  <div className="stat-label">총 입찰</div>
                </div>
                <div className="stat-card">
                  <div className="stat-num">{wonBids}</div>
                  <div className="stat-label">낙찰</div>
                </div>
                <div className="stat-card">
                  <div className="stat-num">{winRate}%</div>
                  <div className="stat-label">낙찰률</div>
                </div>
              </div>

              <div className="driver-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginTop: 12 }}>
                <div className="stat-card">
                  <div className="stat-num">{agent.rating.toFixed(1)}</div>
                  <div className="stat-label">평점</div>
                </div>
                <div className="stat-card">
                  <div className="stat-num">{agent.review_count}</div>
                  <div className="stat-label">리뷰 수</div>
                </div>
                <div className="stat-card">
                  <div className="stat-num">{agent.commission_rate}%</div>
                  <div className="stat-label">수수료율</div>
                </div>
              </div>

              <div className="driver-stats" style={{ gridTemplateColumns: "1fr", marginTop: 12 }}>
                <div className="stat-card">
                  <div className="stat-num">{agent.total_queries}</div>
                  <div className="stat-label">총 처리 건수</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
