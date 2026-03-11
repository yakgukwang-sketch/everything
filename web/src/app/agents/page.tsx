"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { API_URL, AGENT_ICONS, AGENT_INTROS } from "@/lib/shared";

type RankedAgent = {
  id: number;
  name: string;
  description: string;
  commission_rate: number;
  rating: number;
  review_count: number;
  total_queries: number;
  status: string;
  rank: number;
  badge: string;
  tier: string;
  trustScore: number;
};

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<RankedAgent[]>([]);
  const [loading, setLoading] = useState(true);

  // 개발자 등록 상태
  const [devName, setDevName] = useState("");
  const [devEmail, setDevEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [devLoading, setDevLoading] = useState(false);
  const [devError, setDevError] = useState("");

  // 에이전트 등록 상태
  const [agentName, setAgentName] = useState("");
  const [agentDesc, setAgentDesc] = useState("");
  const [agentEndpoint, setAgentEndpoint] = useState("");
  const [agentCommission, setAgentCommission] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState("");
  const [agentSuccess, setAgentSuccess] = useState("");

  useEffect(() => {
    fetchRanking();
  }, []);

  const fetchRanking = async () => {
    try {
      const res = await fetch(`${API_URL}/api/agents/ranking`);
      const data = await res.json();
      setAgents(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDevRegister = async () => {
    setDevError("");
    if (!devName.trim() || !devEmail.trim()) {
      setDevError("이름과 이메일을 모두 입력하세요");
      return;
    }
    setDevLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/developers/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: devName.trim(), email: devEmail.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setApiKey(data.api_key);
      } else {
        setDevError(data.error || "가입 실패");
      }
    } catch {
      setDevError("서버 연결 실패");
    } finally {
      setDevLoading(false);
    }
  };

  const handleAgentRegister = async () => {
    setAgentError("");
    setAgentSuccess("");
    if (!agentName.trim()) {
      setAgentError("에이전트 이름을 입력하세요");
      return;
    }
    if (!apiKey) {
      setAgentError("먼저 개발자 등록을 완료하세요");
      return;
    }
    setAgentLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/agents/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          name: agentName.trim(),
          description: agentDesc.trim(),
          endpoint: agentEndpoint.trim(),
          commission_rate: Number(agentCommission) || 0,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAgentSuccess(`${agentName} 에이전트가 등록되었습니다!`);
        setAgentName("");
        setAgentDesc("");
        setAgentEndpoint("");
        setAgentCommission("");
        fetchRanking();
      } else {
        setAgentError(data.error || "등록 실패");
      }
    } catch {
      setAgentError("서버 연결 실패");
    } finally {
      setAgentLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", border: "1px solid #dadce0",
    borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box",
  };

  const btnStyle: React.CSSProperties = {
    padding: "10px 24px", borderRadius: 10, border: "none",
    fontWeight: 700, fontSize: 14, cursor: "pointer",
  };

  return (
    <div className="results-page">
      <header className="results-header">
        <div className="results-logo" onClick={() => router.push("/")} style={{ cursor: "pointer" }}>
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
      </header>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 20px" }}>
        <h2 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 8 }}>AI 에이전트 랭킹</h2>
        <p style={{ color: "#70757a", fontSize: 14, marginBottom: 32 }}>
          각 에이전트는 고유한 AI 분석 관점으로 경쟁합니다. 검색하면 12개 에이전트가 동시에 Gemini AI로 분석합니다.
        </p>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#70757a" }}>로딩 중...</div>
        ) : agents.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#70757a" }}>등록된 에이전트가 없습니다.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {agents.map((agent) => (
              <div key={agent.id} style={{
                border: agent.rank <= 3 ? "2px solid" : "1px solid #e0e0e0",
                borderColor: agent.rank === 1 ? "#fbbc05" : agent.rank === 2 ? "#9e9e9e" : agent.rank === 3 ? "#cd7f32" : "#e0e0e0",
                borderRadius: 16,
                padding: 20,
                background: agent.rank === 1 ? "#fffdf0" : "#fff",
                transition: "box-shadow 0.2s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  {/* 순위 */}
                  <div style={{
                    width: 40, height: 40, borderRadius: 12,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: agent.badge ? 24 : 16, fontWeight: 700,
                    background: agent.rank <= 3 ? "transparent" : "#f8f9fa",
                    color: agent.rank > 3 ? "#5f6368" : undefined,
                  }}>
                    {agent.badge || agent.tier}
                  </div>

                  {/* 아이콘 */}
                  <div style={{
                    width: 48, height: 48, borderRadius: 14,
                    background: "linear-gradient(135deg, #4285f4, #1a73e8)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 24,
                  }}>
                    {AGENT_ICONS[agent.name] || "🤖"}
                  </div>

                  {/* 정보 */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{agent.name}</span>
                      <span style={{
                        fontSize: 11, color: "#fff",
                        background: agent.status === "active" ? "#34a853" : "#9e9e9e",
                        padding: "2px 8px", borderRadius: 10, fontWeight: 600,
                      }}>
                        {agent.status === "active" ? "AI" : "OFF"}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: "#5f6368", marginTop: 2 }}>
                      {AGENT_INTROS[agent.name] || agent.description || "AI 분석 에이전트"}
                    </div>
                  </div>

                  {/* 통계 */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a73e8" }}>
                      {(agent.total_queries ?? 0).toLocaleString()}회
                    </div>
                    <div style={{ fontSize: 12, color: "#70757a" }}>
                      ★ {(agent.rating || 0).toFixed(1)} ({agent.review_count})
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 개발자 등록 + 에이전트 등록 섹션 */}
        <div style={{
          border: "1px solid #dadce0", borderRadius: 16,
          padding: 28, marginTop: 32, background: "#fafafa",
        }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>개발자 등록</h3>
          <p style={{ fontSize: 13, color: "#70757a", marginBottom: 20 }}>
            회원가입 후 API key를 받아 나만의 AI 에이전트를 등록하세요.
          </p>

          {!apiKey ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                style={inputStyle}
                placeholder="이름"
                value={devName}
                onChange={(e) => setDevName(e.target.value)}
              />
              <input
                style={inputStyle}
                placeholder="이메일"
                type="email"
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
              />
              {devError && (
                <div style={{ color: "#ea4335", fontSize: 13 }}>{devError}</div>
              )}
              <button
                style={{ ...btnStyle, background: "#1a73e8", color: "#fff" }}
                onClick={handleDevRegister}
                disabled={devLoading}
              >
                {devLoading ? "가입 중..." : "가입하고 API Key 받기"}
              </button>
            </div>
          ) : (
            <div>
              <div style={{
                background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 10,
                padding: 16, marginBottom: 20,
              }}>
                <div style={{ fontSize: 13, color: "#2e7d32", fontWeight: 600, marginBottom: 6 }}>
                  가입 완료! API Key:
                </div>
                <code style={{
                  display: "block", background: "#fff", padding: "8px 12px",
                  borderRadius: 6, fontSize: 13, wordBreak: "break-all",
                  border: "1px solid #c8e6c9", userSelect: "all",
                }}>
                  {apiKey}
                </code>
                <div style={{ fontSize: 12, color: "#70757a", marginTop: 6 }}>
                  이 키를 안전하게 보관하세요. 다시 확인할 수 없습니다.
                </div>
              </div>

              {/* 에이전트 등록 폼 */}
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>에이전트 등록</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <input
                  style={inputStyle}
                  placeholder="에이전트 이름 (2~50자)"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                />
                <input
                  style={inputStyle}
                  placeholder="설명 (선택)"
                  value={agentDesc}
                  onChange={(e) => setAgentDesc(e.target.value)}
                />
                <input
                  style={inputStyle}
                  placeholder="Endpoint (선택, 예: my_strategy)"
                  value={agentEndpoint}
                  onChange={(e) => setAgentEndpoint(e.target.value)}
                />
                <input
                  style={inputStyle}
                  placeholder="수수료율 % (0~100, 기본 0)"
                  type="number"
                  min="0"
                  max="100"
                  value={agentCommission}
                  onChange={(e) => setAgentCommission(e.target.value)}
                />
                {agentError && (
                  <div style={{ color: "#ea4335", fontSize: 13 }}>{agentError}</div>
                )}
                {agentSuccess && (
                  <div style={{ color: "#2e7d32", fontSize: 13, fontWeight: 600 }}>{agentSuccess}</div>
                )}
                <button
                  style={{ ...btnStyle, background: "#34a853", color: "#fff" }}
                  onClick={handleAgentRegister}
                  disabled={agentLoading}
                >
                  {agentLoading ? "등록 중..." : "에이전트 등록"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
