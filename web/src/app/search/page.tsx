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

const SOURCE_NAMES: Record<string, string> = {
  coupang: "쿠팡",
  naver_shopping: "네이버쇼핑",
  "11st": "11번가",
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
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (q) {
      setQuery(q);
      doSearch(q);
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
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
              autoFocus
            />
          </div>
        </form>
      </header>

      <div className="results-tabs">
        <div className="results-tab active">전체</div>
        <div className="results-tab">쿠팡</div>
        <div className="results-tab">네이버</div>
        <div className="results-tab">11번가</div>
      </div>

      <div className="results-body">
        {loading ? (
          <div className="loading">
            <div className="loading-dot" />
            <div className="loading-dot" />
            <div className="loading-dot" />
            <div className="loading-dot" />
          </div>
        ) : results.length > 0 ? (
          <>
            <div className="results-info">
              약 {results.length}개의 할인 상품
            </div>
            {results.map((deal) => (
              <div key={deal.id} className="result-card">
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
            ))}
          </>
        ) : searched ? (
          <div className="empty-state">
            <h2>&apos;{q}&apos;에 대한 할인 상품이 없습니다</h2>
            <p>다른 키워드로 검색해보세요</p>
          </div>
        ) : null}
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
