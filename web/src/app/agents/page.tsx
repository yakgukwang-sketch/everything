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
      const res = await fetch(`${API_URL}/api/agents`);
      const data = await res.json();
      setAgents(data.data || []);
    } catch (err) {
      console.error(err);
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
      setResponses(data.responses || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

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
              placeholder="에이전트에게 물어보세요 (예: 에어팟 최저가)"
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
              에이전트 응답
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
                      <div>
                        <strong style={{ fontSize: 16 }}>{r.agent_name}</strong>
                        {i === 0 && <span style={{ marginLeft: 8, fontSize: 12, color: "#1a73e8", background: "#e8f0fe", padding: "2px 8px", borderRadius: 10 }}>BEST</span>}
                      </div>
                      <div style={{ fontSize: 13, color: "#70757a" }}>
                        수수료 {r.commission_rate}% · 신뢰도 {Math.round((r.response.confidence || 0) * 100)}%
                      </div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>{r.response.recommendation}</div>
                    <div style={{ fontSize: 13, color: "#5f6368" }}>{r.response.reasoning}</div>
                    {r.response.deals && r.response.deals.length > 0 && (
                      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {r.response.deals.slice(0, 3).map((deal: any, j: number) => (
                          <a key={j} href={deal.url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 12, padding: "4px 10px", background: "#f1f3f4", borderRadius: 16, color: "#1a73e8", textDecoration: "none" }}>
                            {deal.title?.substring(0, 30)}... {deal.sale_price ? `${deal.sale_price.toLocaleString()}원` : ""}
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

        {/* 에이전트 목록 */}
        <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 16, paddingBottom: 8, borderBottom: "2px solid #202124" }}>
          등록된 에이전트 ({agents.length})
        </h3>
        {agents.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {agents.map((agent) => (
              <div key={agent.id} style={{
                padding: 20,
                border: "1px solid #e0e0e0",
                borderRadius: 12,
                transition: "box-shadow 0.2s",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <strong style={{ fontSize: 16 }}>{agent.name}</strong>
                  <span style={{ fontSize: 12, color: "#34a853", background: "#e6f4ea", padding: "2px 8px", borderRadius: 10 }}>
                    {agent.status}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: "#5f6368", margin: "8px 0" }}>{agent.description}</p>
                <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#70757a" }}>
                  <span><Stars rating={agent.rating} /> ({agent.review_count})</span>
                  <span>수수료 {agent.commission_rate}%</span>
                  <span>쿼리 {agent.total_queries}</span>
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
