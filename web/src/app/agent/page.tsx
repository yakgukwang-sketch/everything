"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  API_URL, Deal, formatPrice, timeAgo,
  SOURCE_NAMES,
} from "@/lib/shared";
import DealCard from "@/components/DealCard";

type PipelineStep = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  summary?: string;
  data?: unknown;
};

type HistoryEntry = {
  role: "user" | "agent";
  text: string;
};

const SUGGEST_CHIPS = [
  "에어팟 프로", "갤럭시 S24", "다이슨 에어랩",
  "닌텐도 스위치", "나이키 운동화", "로봇청소기",
];

// 불용어 제거 후 키워드 추출
const STOP_WORDS = new Set([
  "사고", "싶어", "싶은", "추천", "추천해줘", "찾아", "찾아줘", "알려줘",
  "해줘", "할까", "좋을까", "괜찮을까", "어때", "뭐가", "좀", "나", "이",
  "그", "저", "것", "거", "좋은", "가장", "제일", "하나", "있어", "있을까",
  "사줘", "골라줘", "보여줘", "볼래", "볼까", "사고싶어", "구매", "구입",
]);

function extractKeywords(input: string): string {
  const words = input
    .replace(/[?!.,~]/g, "")
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));
  return words.join(" ") || input.trim();
}

export default function DealHunterPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>로딩중...</div>}>
      <DealHunterAgent />
    </Suspense>
  );
}

function DealHunterAgent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [finalResult, setFinalResult] = useState<{
    recommendation: string;
    buyAdvice: string;
    topDeals: Deal[];
    allDeals: Deal[];
  } | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const initialRan = useRef(false);

  // URL ?q= 파라미터로 자동 검색
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !initialRan.current) {
      initialRan.current = true;
      setHistory([{ role: "user", text: q }]);
      runPipeline(q);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isRunning && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isRunning]);

  // 스크롤 to bottom on step changes
  useEffect(() => {
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [steps, finalResult]);

  const updateStep = (id: string, update: Partial<PipelineStep>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...update } : s));
  };

  const runPipeline = async (searchQuery: string) => {
    const keyword = extractKeywords(searchQuery);
    setIsRunning(true);
    setFinalResult(null);

    const initialSteps: PipelineStep[] = [
      { id: "search", label: "DB 검색", status: "pending" },
      { id: "hot", label: "핫딜 크로스체크", status: "pending" },
      { id: "trends", label: "트렌드 분석", status: "pending" },
      { id: "price", label: "가격 비교", status: "pending" },
      { id: "ai", label: "AI 종합 추천", status: "pending" },
    ];
    setSteps(initialSteps);

    let deals: Deal[] = [];
    let hotDeals: Deal[] = [];
    let trends: { query: string; count: number }[] = [];

    // Step 1: DB 검색
    updateStep("search", { status: "running" });
    try {
      const res = await fetch(`${API_URL}/api/deals?q=${encodeURIComponent(keyword)}&limit=30`);
      const data = await res.json();
      deals = data.data || [];
      updateStep("search", { status: "done", summary: `${deals.length}건 발견`, data: deals });
    } catch {
      updateStep("search", { status: "error", summary: "검색 실패" });
    }

    // Step 2: 핫딜 크로스체크
    updateStep("hot", { status: "running" });
    try {
      const res = await fetch(`${API_URL}/api/hot?limit=30&period=week`);
      const data = await res.json();
      const allHot: Deal[] = data.data || [];
      // 키워드와 관련된 핫딜 필터
      const kws = keyword.toLowerCase().split(/\s+/);
      hotDeals = allHot.filter(d =>
        kws.some(kw => d.title.toLowerCase().includes(kw))
      );
      updateStep("hot", { status: "done", summary: `관련 핫딜 ${hotDeals.length}건`, data: hotDeals });
    } catch {
      updateStep("hot", { status: "error", summary: "핫딜 조회 실패" });
    }

    // Step 3: 트렌드 분석
    updateStep("trends", { status: "running" });
    try {
      const res = await fetch(`${API_URL}/api/trends`);
      const data = await res.json();
      const trendData = data.data || {};
      trends = trendData.trendingSearches || [];
      const relevantTrends = trends.filter((t: { query: string }) =>
        keyword.toLowerCase().split(/\s+/).some(kw => t.query.toLowerCase().includes(kw))
      );
      updateStep("trends", {
        status: "done",
        summary: relevantTrends.length > 0
          ? `관련 트렌드 ${relevantTrends.length}건`
          : `전체 트렌드 ${trends.length}건 분석`,
        data: relevantTrends.length > 0 ? relevantTrends : trends.slice(0, 5),
      });
    } catch {
      updateStep("trends", { status: "error", summary: "트렌드 조회 실패" });
    }

    // Step 4: 가격 비교 (프론트엔드 계산)
    updateStep("price", { status: "running" });
    const allDeals = [...deals, ...hotDeals];
    const uniqueDeals = allDeals.filter((d, i, arr) =>
      arr.findIndex(x => x.id === d.id) === i
    );
    const priceDeals = uniqueDeals.filter(d => d.sale_price > 0);

    let priceSummary = "가격 정보 없음";
    if (priceDeals.length > 0) {
      const sorted = [...priceDeals].sort((a, b) => a.sale_price - b.sale_price);
      const cheapest = sorted[0];
      priceSummary = `최저 ${formatPrice(cheapest.sale_price)} (${SOURCE_NAMES[cheapest.source] || cheapest.source})`;

      // 소스별 최저가
      const bySource: Record<string, Deal> = {};
      for (const d of sorted) {
        if (!bySource[d.source]) bySource[d.source] = d;
      }
      if (Object.keys(bySource).length > 1) {
        priceSummary += ` · ${Object.keys(bySource).length}개 소스 비교`;
      }
    }
    updateStep("price", { status: "done", summary: priceSummary });

    // Step 5: AI 종합 추천
    updateStep("ai", { status: "running" });
    try {
      const res = await fetch(`${API_URL}/api/agent/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: keyword,
          deals: deals.slice(0, 10).map(d => ({
            title: d.title,
            sale_price: d.sale_price,
            source: d.source,
            url: d.url,
            discount_rate: d.discount_rate,
          })),
          hotDeals: hotDeals.slice(0, 5).map(d => ({
            title: d.title,
            sale_price: d.sale_price,
            source: d.source,
            recommendations: d.recommendations || 0,
          })),
          trends: (trends || []).slice(0, 5),
        }),
      });
      const data = await res.json();

      if (data.success) {
        const topDealIds: number[] = data.topDealIds || [];
        const topDeals = topDealIds
          .filter(i => i >= 0 && i < deals.length)
          .map(i => deals[i]);

        setFinalResult({
          recommendation: data.recommendation,
          buyAdvice: data.buyAdvice,
          topDeals: topDeals.length > 0 ? topDeals : deals.slice(0, 3),
          allDeals: uniqueDeals,
        });
        updateStep("ai", { status: "done", summary: "분석 완료" });

        // 히스토리에 추가
        setHistory(prev => [
          ...prev,
          { role: "agent", text: data.recommendation },
        ]);
      } else {
        updateStep("ai", { status: "error", summary: "AI 분석 실패" });
        // 폴백: AI 없이 결과 보여주기
        setFinalResult({
          recommendation: deals.length > 0
            ? `"${keyword}" 검색 결과 ${deals.length}건을 찾았어! 아래 딜들을 확인해봐.`
            : `"${keyword}"에 대한 딜을 찾지 못했어. 다른 키워드로 검색해볼래?`,
          buyAdvice: "neutral",
          topDeals: deals.slice(0, 3),
          allDeals: uniqueDeals,
        });
      }
    } catch {
      updateStep("ai", { status: "error", summary: "AI 분석 실패" });
      setFinalResult({
        recommendation: deals.length > 0
          ? `"${keyword}" 검색 결과 ${deals.length}건을 찾았어!`
          : `"${keyword}"에 대한 딜을 찾지 못했어.`,
        buyAdvice: "neutral",
        topDeals: deals.slice(0, 3),
        allDeals: uniqueDeals,
      });
    }

    setIsRunning(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isRunning) return;
    const text = query.trim();
    setQuery("");
    setHistory(prev => [...prev, { role: "user", text }]);
    runPipeline(text);
  };

  const handleChipClick = (chip: string) => {
    if (isRunning) return;
    setQuery("");
    setHistory(prev => [...prev, { role: "user", text: chip }]);
    runPipeline(chip);
  };

  const handleReset = () => {
    setSteps([]);
    setFinalResult(null);
    setIsRunning(false);
    setHistory([]);
    setQuery("");
  };

  const buyAdviceLabel = (advice: string) => {
    switch (advice) {
      case "buy_now": return { text: "지금이 적기!", icon: "🟢", color: "#34a853" };
      case "wait": return { text: "좀 더 기다려봐", icon: "🟡", color: "#ff9800" };
      default: return { text: "참고해서 판단해", icon: "🔵", color: "#4285f4" };
    }
  };

  const isInitial = steps.length === 0 && history.length === 0;

  return (
    <div className="deal-hunter-page">
      {/* Header */}
      <header className="deal-hunter-header">
        <div className="deal-hunter-header-left" onClick={() => router.push("/")} style={{ cursor: "pointer" }}>
          <span className="deal-hunter-logo">
            <span style={{ color: "#4285f4" }}>e</span><span style={{ color: "#ea4335" }}>v</span><span>e</span>
            <span style={{ color: "#4285f4" }}>r</span><span style={{ color: "#34a853" }}>y</span><span>t</span>
            <span style={{ color: "#fbbc05" }}>h</span><span>i</span><span style={{ color: "#ea4335" }}>n</span>
            <span style={{ color: "#4285f4" }}>g</span>
          </span>
          <span className="deal-hunter-badge">DEAL HUNTER</span>
        </div>
        {!isInitial && (
          <button className="deal-hunter-reset" onClick={handleReset}>새 검색</button>
        )}
      </header>

      {/* Initial state */}
      {isInitial ? (
        <div className="deal-hunter-hero">
          <div className="deal-hunter-icon">🎯</div>
          <h1 className="deal-hunter-title">딜 헌터</h1>
          <p className="deal-hunter-subtitle">찾고 싶은 상품을 말해봐. AI가 최적의 딜을 찾아줄게.</p>

          <form className="deal-hunter-search-form" onSubmit={handleSubmit}>
            <div className="deal-hunter-search-wrapper">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                className="deal-hunter-search-input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="에어팟 프로 사고 싶어"
                autoFocus
              />
            </div>
          </form>

          <div className="deal-hunter-chips">
            {SUGGEST_CHIPS.map(chip => (
              <button key={chip} className="deal-hunter-chip" onClick={() => handleChipClick(chip)}>
                {chip}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Running / Result state */
        <div className="deal-hunter-content">
          {/* History */}
          {history.map((entry, i) => (
            <div key={i} className={`deal-hunter-history ${entry.role}`}>
              {entry.role === "user" ? (
                <div className="deal-hunter-user-msg">
                  <span className="deal-hunter-user-icon">👤</span>
                  <span>{entry.text}</span>
                </div>
              ) : (
                <div className="deal-hunter-agent-msg">
                  <span className="deal-hunter-agent-icon">🎯</span>
                  <span>{entry.text}</span>
                </div>
              )}
            </div>
          ))}

          {/* Pipeline steps */}
          {steps.length > 0 && (
            <div className="pipeline-steps">
              {steps.map((step, i) => (
                <div
                  key={step.id}
                  className={`pipeline-step ${step.status}`}
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <div className="pipeline-step-icon">
                    {step.status === "pending" && <span className="step-num">{i + 1}</span>}
                    {step.status === "running" && <span className="step-spinner" />}
                    {step.status === "done" && <span className="step-check">✓</span>}
                    {step.status === "error" && <span className="step-error">!</span>}
                  </div>
                  <div className="pipeline-step-body">
                    <div className="pipeline-step-label">{step.label}</div>
                    {step.summary && (
                      <div className="pipeline-step-summary">{step.summary}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Final result */}
          {finalResult && (
            <div className="deal-hunter-result" ref={resultRef}>
              {/* AI Recommendation */}
              <div className="deal-hunter-recommendation">
                <div className="recommendation-header">
                  <span className="recommendation-icon">🎯</span>
                  <span className="recommendation-title">AI 추천</span>
                  <span
                    className="recommendation-advice"
                    style={{ color: buyAdviceLabel(finalResult.buyAdvice).color }}
                  >
                    {buyAdviceLabel(finalResult.buyAdvice).icon} {buyAdviceLabel(finalResult.buyAdvice).text}
                  </span>
                </div>
                <p className="recommendation-text">{finalResult.recommendation}</p>
              </div>

              {/* Top deals */}
              {finalResult.topDeals.length > 0 && (
                <div className="deal-hunter-top-deals">
                  <h3 className="top-deals-title">추천 딜</h3>
                  <div className="deal-grid">
                    {finalResult.topDeals.map(deal => (
                      <DealCard key={deal.id} deal={deal} />
                    ))}
                  </div>
                </div>
              )}

              {/* All deals */}
              {finalResult.allDeals.length > finalResult.topDeals.length && (
                <div className="deal-hunter-all-deals">
                  <h3 className="all-deals-title">전체 검색 결과 ({finalResult.allDeals.length}건)</h3>
                  <div className="deal-grid">
                    {finalResult.allDeals
                      .filter(d => !finalResult.topDeals.some(td => td.id === d.id))
                      .slice(0, 12)
                      .map(deal => (
                        <DealCard key={deal.id} deal={deal} showHotBadge={false} showOriginalPrice={false} />
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Follow-up input */}
          {!isRunning && finalResult && (
            <form className="deal-hunter-followup" onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                type="text"
                className="deal-hunter-followup-input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="후속 질문을 입력하세요..."
                autoFocus
              />
              <button type="submit" className="deal-hunter-followup-btn">검색</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
