"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://everything-api.deri58.workers.dev";

type Deal = {
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

const SOURCE_NAMES: Record<string, string> = {
  coupang: "쿠팡",
  "11st": "11번가",
  danawa: "다나와",
  ppomppu: "뽐뿌",
  ruliweb: "루리웹",
  clien: "클리앙",
  fmkorea: "FM코리아",
  quasarzone: "퀘사이저존",
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

function formatPrice(price: number) {
  if (!price) return "";
  return price.toLocaleString() + "원";
}

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") || "";

  const [query, setQuery] = useState(q);
  const [results, setResults] = useState<Deal[]>([]);
  const [agentResponses, setAgentResponses] = useState<AgentResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("all");

  useEffect(() => {
    if (q) {
      setQuery(q);
      doSearch(q);
      askAgents(q);
    }
  }, [q]);

  const doSearch = async (searchQuery: string) => {
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(
        `${API_URL}/api/deals?q=${encodeURIComponent(searchQuery)}`
      );
      const data = await res.json();
      setResults(data.data || []);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const askAgents = async (searchQuery: string) => {
    setAgentLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/agents/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });
      const data = await res.json();
      const sorted = (data.responses || []).sort(
        (a: AgentResponse, b: AgentResponse) => (b.response.confidence || 0) - (a.response.confidence || 0)
      );
      setAgentResponses(sorted);
    } catch (err) {
      console.error("Agent query failed:", err);
    } finally {
      setAgentLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const filteredResults = sourceFilter === "all"
    ? results
    : results.filter(d => d.source === sourceFilter);

  const sources = ["all", ...Array.from(new Set(results.map(d => d.source)))];

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

        <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: "692px" }}>
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
              placeholder="에이전트에게 물어보세요"
              autoFocus
            />
          </div>
        </form>
      </header>

      <div className="results-body" style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px" }}>
        {/* 에이전트 응답 섹션 */}
        <div className="agent-answer-section">
          <h3 className="section-title">
            <span className="section-icon">🤖</span>
            에이전트 추천
          </h3>
          {agentLoading ? (
            <div className="loading">
              <div className="loading-dot" />
              <div className="loading-dot" />
              <div className="loading-dot" />
              <div className="loading-dot" />
            </div>
          ) : agentResponses.length > 0 ? (
            <div className="agent-answer-grid">
              {agentResponses.slice(0, 4).map((r, i) => (
                <div key={i} className={`agent-answer-card ${i === 0 ? "agent-best" : ""}`}>
                  <div className="agent-response-header">
                    <div className="agent-avatar">
                      {AGENT_ICONS[r.agent_name] || "🤖"}
                    </div>
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
                  <div className="agent-response-text">{r.response.recommendation}</div>
                  <div className="agent-response-reason">{r.response.reasoning}</div>
                  {r.response.deals && r.response.deals.length > 0 && (
                    <div className="agent-deal-cards">
                      {r.response.deals.slice(0, 2).map((deal: any, j: number) => (
                        <a key={j} href={deal.url} target="_blank" rel="noopener noreferrer" className="agent-deal-card">
                          {deal.image_url && (
                            <div className="agent-deal-img">
                              <img src={deal.image_url} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
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
              {agentResponses.length > 4 && (
                <button
                  className="show-more-agents"
                  onClick={() => router.push("/agents")}
                >
                  +{agentResponses.length - 4}개 에이전트 더보기
                </button>
              )}
            </div>
          ) : searched ? (
            <div style={{ padding: "20px", color: "#70757a", fontSize: 14 }}>
              에이전트 응답을 불러오는 중 문제가 발생했습니다.
            </div>
          ) : null}
        </div>

        {/* 상품 검색 결과 */}
        <div className="deal-results-section">
          <h3 className="section-title">
            <span className="section-icon">🏷️</span>
            할인 상품 검색 결과
          </h3>

          {results.length > 0 && (
            <div className="source-filter-row">
              {sources.map(s => (
                <button
                  key={s}
                  className={`filter-btn ${sourceFilter === s ? "active" : ""}`}
                  onClick={() => setSourceFilter(s)}
                >
                  {s === "all" ? "전체" : SOURCE_NAMES[s] || s}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="loading">
              <div className="loading-dot" />
              <div className="loading-dot" />
              <div className="loading-dot" />
              <div className="loading-dot" />
            </div>
          ) : filteredResults.length > 0 ? (
            <>
              <div className="results-info">
                약 {filteredResults.length}개의 할인 상품
              </div>
              {filteredResults.map((deal) => (
                <div key={deal.id} className="result-card">
                  <div style={{ display: "flex", gap: 16 }}>
                    {deal.image_url && (
                      <div className="result-thumb">
                        <img src={deal.image_url} alt={deal.title} />
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div className="result-source">
                        {SOURCE_NAMES[deal.source] || deal.source} <span>› {deal.category}</span>
                      </div>
                      <a
                        href={deal.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="result-name"
                      >
                        {deal.title}
                      </a>
                      <div className="result-meta">
                        {deal.discount_rate > 0 && (
                          <span style={{ color: "#ea4335", fontWeight: "bold" }}>{deal.discount_rate}%</span>
                        )}
                        <span style={{ fontWeight: "bold", color: "#202124" }}>{formatPrice(deal.sale_price)}</span>
                        {deal.original_price > 0 && deal.original_price !== deal.sale_price && (
                          <span style={{ textDecoration: "line-through" }}>{formatPrice(deal.original_price)}</span>
                        )}
                      </div>
                      {deal.description && (
                        <div className="result-desc">{deal.description}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : searched ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#70757a" }}>
              <p>&apos;{q}&apos;에 대한 할인 상품이 없습니다</p>
              <p style={{ fontSize: 13, marginTop: 4 }}>위 에이전트 추천을 참고해보세요</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="loading"><div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" /></div>}>
      <SearchContent />
    </Suspense>
  );
}
