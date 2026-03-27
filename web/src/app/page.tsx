"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  API_URL, Deal, ChatMessage, AgentInfo, MediaCard,
  formatPrice, sanitizeUrl,
} from "@/lib/shared";
import DealFeed from "@/components/DealFeed";

// 하드코딩된 에이전트 목록 (API 실패 시 폴백)
const FALLBACK_AGENTS: AgentInfo[] = [
  { id: "gamja", name: "감자", icon: "🥔", description: "싼 거 전문! 가성비 끝판왕", greeting: "안녕! 나 감자 🥔 싼 거 전문이야 ㅋㅋ 뭐 찾아?" },
  { id: "chip", name: "칩", icon: "💻", description: "노트북 전문가! 사양·트렌드·할인 다 알려줌", greeting: "안녕! 나 칩 💻 노트북이면 나한테 물어봐. 용도가 뭐야?" },
];

export default function Home() {
  const [input, setInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [phase, setPhase] = useState<"idle" | "chatting" | "agent_chat">("idle");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [feedTab, setFeedTab] = useState<"hot" | "latest">("hot");
  const [feedFilter, setFeedFilter] = useState("all");
  const [feedLoading, setFeedLoading] = useState(false);

  // 에이전트 채팅 state
  const [activeAgent, setActiveAgent] = useState<AgentInfo | null>(null);
  const [agents, setAgents] = useState<AgentInfo[]>(FALLBACK_AGENTS);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
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
    if (!chatLoading) {
      setTimeout(() => chatInputRef.current?.focus(), 100);
    }
  }, [chatMsgs, chatLoading, phase]);

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

    if (phase === "idle") {
      // 쇼핑 → 감자 에이전트로 바로 연결
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
  };

  // 선택지 클릭
  const handleOptionClick = (option: string) => {
    if (chatLoading) return;
    const newMsgs = [...chatMsgs, { role: "user" as const, text: option }];
    setChatMsgs(newMsgs);
    sendToAgent(newMsgs);
  };

  // 새 대화
  const handleReset = () => {
    setChatMsgs([]);
    setPhase("idle");
    setActiveAgent(null);
    setChatLoading(false);
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
        <span className="header-link" onClick={() => router.push("/events")} style={{ cursor: "pointer", color: "#ea4335", fontWeight: 600 }}>🔥 이벤트</span>
        <span className="header-link" onClick={() => router.push("/agents")} style={{ cursor: "pointer" }}>에이전트</span>
        <span className="header-link" onClick={() => router.push("/submit")} style={{ cursor: "pointer" }}>상품 등록</span>
        <span className="header-link" onClick={() => router.push("/seller/login")} style={{ cursor: "pointer" }}>셀러</span>
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
              "이어폰 사고싶어",
              "가성비 키보드",
              "선물 추천",
            ].map(ex => (
              <button key={ex} className="example-chip" onClick={() => {
                const gamja = agents.find(a => a.id === "gamja") || FALLBACK_AGENTS[0];
                setActiveAgent(gamja);
                setPhase("agent_chat");
                const agentMsgs: ChatMessage[] = [
                  { role: "system", text: gamja.greeting },
                  { role: "user", text: ex },
                ];
                setChatMsgs(agentMsgs);
                sendToAgent(agentMsgs, gamja);
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

            {chatLoading && (
              <div className="chat-msg system">
                <div className="chat-bot-icon">{botIcon}</div>
                <div className="chat-bubble system">
                  <div className="typing-indicator">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* 입력창 */}
          <form className="chat-input-form" onSubmit={handleSubmit}>
            <input
              ref={chatInputRef}
              className="chat-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                phase === "agent_chat" && activeAgent ? `${activeAgent.name}에게 말하기...` :
                "답변을 입력하세요..."
              }
              autoFocus
              disabled={chatLoading}
            />
            <button type="submit" className="chat-send-btn" disabled={chatLoading}>전송</button>
          </form>
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
