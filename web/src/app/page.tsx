"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  API_URL, Deal, AgentResponse, ChatMessage,
  AGENT_ICONS, AGENT_INTROS, SOURCE_NAMES, SOURCE_COLORS,
  formatPrice, timeAgo, sanitizeUrl,
} from "@/lib/shared";

export default function Home() {
  const [input, setInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [agentResponses, setAgentResponses] = useState<AgentResponse[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const [phase, setPhase] = useState<"idle" | "chatting" | "confirm" | "agents">("idle");
  const [pendingQuery, setPendingQuery] = useState<{ query: string; parsed: { product?: string; specs?: Record<string, string>; budget?: string; keywords?: string[] } | null } | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [feedTab, setFeedTab] = useState<"hot" | "latest">("hot");
  const [feedFilter, setFeedFilter] = useState("all");
  const [feedLoading, setFeedLoading] = useState(false);


  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
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
    if ((phase === "chatting" || phase === "agents") && !chatLoading) {
      setTimeout(() => chatInputRef.current?.focus(), 100);
    }
  }, [chatMsgs, agentResponses, chatLoading, phase]);

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
        const reply = data.reply || "어떤 상품을 찾고 계신가요?";
        const options = data.options || [];
        const updated = [...newMsgs, { role: "system" as const, text: reply, options }];
        setChatMsgs(updated);

        // LLM이 니즈 파악 완료했으면 확인 단계로
        if (data.ready && data.query) {
          const keywords = data.query.keywords || [];
          const product = data.query.product || "";
          const specs = data.query.specs ? Object.values(data.query.specs).join(" ") : "";
          const budget = data.query.budget || "";
          const finalQuery = `${product} ${specs} ${budget} ${keywords.join(" ")}`.trim();
          setPendingQuery({ query: finalQuery, parsed: data.query });
          setPhase("confirm");
        }
      }
    } catch (err) {
      console.error(err);
      setChatMsgs(prev => [...prev, { role: "system", text: "죄송해요, 잠시 문제가 생겼어요. 다시 말씀해주세요!" }]);
    } finally {
      setChatLoading(false);
    }
  };

  // 에이전트 전달
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

  // 유저 입력
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || chatLoading) return;
    const text = input.trim();
    setInput("");

    const newMsgs = [...chatMsgs, { role: "user" as const, text }];
    setChatMsgs(newMsgs);

    if (phase === "idle" || phase === "agents" || phase === "confirm") {
      setPhase("chatting");
      setAgentResponses([]);
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

  // 확인 후 에이전트에게 보내기
  const handleConfirmSend = () => {
    if (!pendingQuery) return;
    setPhase("agents");
    setChatMsgs(prev => [...prev, { role: "system", text: "좋아요! 에이전트들에게 물어볼게요." }]);
    sendToAgents(pendingQuery.query);
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
    setChatMsgs(prev => [...prev, { role: "system", text: "좋아요, 더 알려주세요! 어떤 부분이 더 궁금하세요?" }]);
  };

  // 새 대화
  const handleReset = () => {
    setChatMsgs([]);
    setPhase("idle");
    setAgentResponses([]);
    setAgentLoading(false);
    setChatLoading(false);
    setPendingQuery(null);
  };

  return (
    <div className="main">
      <header className="header">
        <span className="header-link" onClick={() => router.push("/agents")} style={{ cursor: "pointer" }}>에이전트</span>
        <span className="header-link" onClick={() => router.push("/submit")} style={{ cursor: "pointer" }}>상품 등록</span>
        <span className="header-link">API 문서</span>
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
                placeholder="무엇을 찾고 계신가요? (예: 침대 사고싶어)"
                autoFocus
              />
            </div>
          </form>

          <div className="quick-examples">
            {["노트북 추천해줘", "선물 뭐가 좋을까", "이어폰 사고싶어", "침대 추천"].map(ex => (
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
              <div className="empty-feed">아직 수집된 딜이 없습니다. 크롤러를 실행해주세요.</div>
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

            {chatLoading && (
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
                  이 정도면 충분해요 — 에이전트에게 물어보기
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
                      네, 에이전트에게 물어보기
                    </button>
                    <button className="confirm-btn-no" onClick={handleContinueChat}>
                      아니요, 더 말할게 있어요
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 에이전트 로딩 */}
            {agentLoading && (
              <div className="chat-msg system">
                <div className="chat-bot-icon">E</div>
                <div className="chat-bubble system">
                  <p>12개 에이전트가 경쟁 중...</p>
                  <div className="loading" style={{ padding: "10px 0" }}>
                    <div className="loading-dot" />
                    <div className="loading-dot" />
                    <div className="loading-dot" />
                    <div className="loading-dot" />
                  </div>
                </div>
              </div>
            )}

            {/* 에이전트 응답 */}
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

            <div ref={chatEndRef} />
          </div>

          {/* 입력창 (대화 중 + 에이전트 결과 후에도 계속 대화 가능) */}
          {(phase === "chatting" || phase === "agents" || phase === "confirm") && (
            <form className="chat-input-form" onSubmit={handleSubmit}>
              <input
                ref={chatInputRef}
                className="chat-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={phase === "confirm" ? "더 추가할 내용을 입력하세요..." : phase === "agents" ? "추가 질문이 있으면 입력하세요..." : "답변을 입력하세요..."}
                autoFocus
                disabled={chatLoading}
              />
              <button type="submit" className="chat-send-btn" disabled={chatLoading}>전송</button>
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
