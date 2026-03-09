"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://everything-api.deri58.workers.dev";

type Agent = {
  id: number;
  name: string;
  description: string;
  commission_rate: number;
  rating: number;
  review_count: number;
  total_queries: number;
  status: string;
  created_at: string;
  rank?: number;
  badge?: string;
  tier?: string;
  trustScore?: number;
};

const AGENT_ICONS: Record<string, string> = {
  "최저가봇": "💰",
  "인기봇": "🔥",
  "큐레이터봇": "🎯",
  "타임딜봇": "⚡",
  "알뜰봇": "🏷️",
  "가격예측봇": "📊",
  "비교봇": "⚖️",
  "선물봇": "🎁",
  "가성비봇": "💎",
  "어드바이저봇": "🧠",
  "카테고리봇": "📂",
  "트렌드봇": "📈",
};

const AGENT_COLORS: Record<string, string> = {
  "최저가봇": "#4285f4",
  "인기봇": "#ea4335",
  "큐레이터봇": "#fbbc05",
  "타임딜봇": "#34a853",
  "알뜰봇": "#ff6d01",
  "가격예측봇": "#46bdc6",
  "비교봇": "#7b61ff",
  "선물봇": "#e91e63",
  "가성비봇": "#00bcd4",
  "어드바이저봇": "#9c27b0",
  "카테고리봇": "#607d8b",
  "트렌드봇": "#ff5722",
};

type AgentResponse = {
  agent_id: number;
  agent_name: string;
  commission_rate: number;
  rating: number;
  response: {
    recommendation: string;
    confidence: number;
    reasoning: string;
    deals: any[];
  };
};

function Stars({ rating }: { rating: number }) {
  return (
    <span style={{ color: "#fbbc05" }}>
      {"★".repeat(Math.round(rating))}
      {"☆".repeat(5 - Math.round(rating))}
      <span style={{ color: "#70757a", marginLeft: 4 }}>{rating.toFixed(1)}</span>
    </span>
  );
}

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [query, setQuery] = useState("");
  const [responses, setResponses] = useState<AgentResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [queried, setQueried] = useState(false);

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const res = await fetch(`${API_URL}/api/agents/ranking`);
      const data = await res.json();
      setAgents(data.data || []);
    } catch (err) {
      // fallback to regular agents endpoint
      try {
        const res = await fetch(`${API_URL}/api/agents`);
        const data = await res.json();
        setAgents(data.data || []);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setQueried(true);

    try {
      const res = await fetch(`${API_URL}/api/agents/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await res.json();
      // Sort by confidence (best first)
      const sorted = (data.responses || []).sort(
        (a: AgentResponse, b: AgentResponse) => (b.response.confidence || 0) - (a.response.confidence || 0)
      );
      setResponses(sorted);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const maxTrust = Math.max(...agents.map(a => a.trustScore || 0), 1);

  return (
    <div className="results-page">
      <header className="results-header">
        <div className="results-logo" onClick={() => router.push("/")}>
          <span style={{ color: "#4285f4" }}>e</span>
          <span style={{ color: "#ea4335" }}>v</span>
          <span>e</span>
          <span style={{ color: "#4285f4" }}>r</span>
          <span style={{ color: "#34a853" }}>y</span>
          <span>t</span>
          <span style={{ color: "#fbbc05" }}>h</span>
          <span>i</span>
          <span style={{ color: "#ea4335" }}>n</span>
          <span style={{ color: "#4285f4" }}>g</span>
        </div>

        <form onSubmit={handleQuery} style={{ flex: 1, maxWidth: "692px" }}>
          <div className="results-search-wrapper">
            <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              className="search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="에이전트에게 물어보세요 (예: 오늘 할인 추천해줘)"
            />
          </div>
        </form>
      </header>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 20px" }}>
        <h2 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 8 }}>에이전트 마켓플레이스</h2>
        <p style={{ color: "#70757a", fontSize: 14, marginBottom: 24 }}>
          AI 에이전트들이 당신의 질문에 경쟁적으로 답합니다. 가장 좋은 답을 선택하세요.
        </p>

        {/* 에이전트 쿼리 결과 */}
        {queried && (
          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 16, paddingBottom: 8, borderBottom: "2px solid #202124" }}>
              에이전트 경쟁 응답
            </h3>
            {loading ? (
              <div className="loading">
                <div className="loading-dot" />
                <div className="loading-dot" />
                <div className="loading-dot" />
                <div className="loading-dot" />
              </div>
            ) : responses.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {responses.map((r, i) => (
                  <div key={i} style={{
                    padding: 20,
                    border: i === 0 ? "2px solid #1a73e8" : "1px solid #e0e0e0",
                    borderRadius: 12,
                    background: i === 0 ? "#f0f7ff" : "#fff",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <strong style={{ fontSize: 16 }}>{r.agent_name}</strong>
                        {i === 0 && <span style={{ fontSize: 12, color: "#fff", background: "#1a73e8", padding: "2px 10px", borderRadius: 10, fontWeight: 700 }}>BEST</span>}
                        <span style={{ fontSize: 12, color: "#ea4335", background: "#fce8e6", padding: "2px 8px", borderRadius: 10 }}>
                          수수료 {r.commission_rate}%
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: "#70757a" }}>
                        신뢰도 {Math.round((r.response.confidence || 0) * 100)}%
                      </div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>{r.response.recommendation}</div>
                    <div style={{ fontSize: 13, color: "#5f6368" }}>{r.response.reasoning}</div>
                    {r.response.deals && r.response.deals.length > 0 && (
                      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {r.response.deals.slice(0, 3).map((deal: any, j: number) => (
                          <a key={j} href={deal.url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 12, padding: "4px 10px", background: "#f1f3f4", borderRadius: 16, color: "#1a73e8", textDecoration: "none" }}>
                            {deal.title?.substring(0, 30)}{deal.title?.length > 30 ? "..." : ""} {deal.sale_price ? `${deal.sale_price.toLocaleString()}원` : ""}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: 40, textAlign: "center", color: "#70757a" }}>
                등록된 에이전트가 없거나 응답이 없습니다.
              </div>
            )}
          </div>
        )}

        {/* 에이전트 랭킹 */}
        <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 16, paddingBottom: 8, borderBottom: "2px solid #202124" }}>
          에이전트 랭킹 ({agents.length})
        </h3>
        {agents.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {agents.map((agent, i) => (
              <div key={agent.id} className={`agent-rank-card ${i < 3 ? "top-agent" : ""}`}>
                <div className="agent-card-inner">
                  <div className="agent-card-left">
                    <div className="agent-avatar-circle" style={{ background: AGENT_COLORS[agent.name] || "#4285f4" }}>
                      <span className="agent-avatar-icon">{AGENT_ICONS[agent.name] || "🤖"}</span>
                    </div>
                    <span className="agent-rank-num">{agent.badge || `${i + 1}`}</span>
                  </div>
                  <div className="agent-card-right">
                    <div className="agent-card-top-row">
                      <div>
                        <strong style={{ fontSize: 16 }}>{agent.name}</strong>
                        <span className="agent-commission-badge">
                          수수료 {agent.commission_rate}%
                        </span>
                      </div>
                      <span className="agent-tier-badge">
                        {agent.tier || `${i + 1}위`}
                      </span>
                    </div>
                    <p className="agent-desc">{agent.description}</p>
                    <div className="agent-stats-row">
                      <span><Stars rating={agent.rating} /> ({agent.review_count})</span>
                      <span>쿼리 {agent.total_queries}회</span>
                    </div>
                    <div className="trust-bar">
                      <div className="trust-fill" style={{ width: `${((agent.trustScore || 0) / maxTrust) * 100}%` }} />
                    </div>
                    <div className="social-proof">
                      <span className="social-proof-dot" />
                      {agent.total_queries > 0
                        ? `${agent.total_queries}명이 이 에이전트를 사용했습니다`
                        : "새로운 에이전트"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 40, textAlign: "center", color: "#70757a" }}>
            아직 등록된 에이전트가 없습니다
          </div>
        )}
      </div>
    </div>
  );
}
