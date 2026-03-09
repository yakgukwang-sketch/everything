"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

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

function timeAgo(dateStr: string) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [filter, setFilter] = useState("all");
  const router = useRouter();

  useEffect(() => {
    fetchDeals();
  }, [filter]);

  const fetchDeals = async () => {
    try {
      const params = new URLSearchParams({ sort: "latest", limit: "30" });
      if (filter !== "all") params.set("source", filter);
      const res = await fetch(`${API_URL}/api/deals?${params}`);
      const data = await res.json();
      setDeals(data.data || []);
    } catch (err) {
      console.error("Fetch failed:", err);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div className="main">
      <header className="header">
        <span className="header-link">에이전트 등록</span>
        <span className="header-link">API 문서</span>
      </header>

      <div className="hero">
        <h1 className="logo">
          <span className="e1">e</span>
          <span className="v">v</span>
          <span>e</span>
          <span className="r">r</span>
          <span className="y">y</span>
          <span>t</span>
          <span className="e2">h</span>
          <span>i</span>
          <span className="v">n</span>
          <span className="e1">g</span>
        </h1>
        <p className="tagline">모든 할인, 하나의 검색</p>

        <form className="search-form" onSubmit={handleSearch}>
          <div className="search-wrapper">
            <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              className="search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="찾고 싶은 할인 상품을 검색하세요"
              autoFocus
            />
          </div>
        </form>
      </div>

      <div className="feed">
        <div className="feed-header">
          <h2 className="feed-title">실시간 할인</h2>
          <div className="feed-filters">
            {[
              { key: "all", label: "전체" },
              { key: "coupang", label: "쿠팡" },
              { key: "naver_shopping", label: "네이버" },
              { key: "11st", label: "11번가" },
            ].map((f) => (
              <button
                key={f.key}
                className={`filter-btn ${filter === f.key ? "active" : ""}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {deals.length > 0 ? (
          <div className="deal-grid">
            {deals.map((deal) => (
              <a
                key={deal.id}
                href={deal.url}
                target="_blank"
                rel="noopener noreferrer"
                className="deal-card"
              >
                {deal.image_url && (
                  <div className="deal-image">
                    <img src={deal.image_url} alt={deal.title} />
                  </div>
                )}
                <div className="deal-body">
                  <div className="deal-source">
                    {SOURCE_NAMES[deal.source] || deal.source}
                    {deal.posted_at && (
                      <span className="deal-time">{timeAgo(deal.posted_at)}</span>
                    )}
                  </div>
                  <div className="deal-title">{deal.title}</div>
                  <div className="deal-price-row">
                    {deal.discount_rate > 0 && (
                      <span className="deal-discount">{deal.discount_rate}%</span>
                    )}
                    <span className="deal-sale-price">{formatPrice(deal.sale_price)}</span>
                    {deal.original_price > 0 && deal.original_price !== deal.sale_price && (
                      <span className="deal-original-price">{formatPrice(deal.original_price)}</span>
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="empty-feed">
            <p>아직 수집된 할인 상품이 없습니다</p>
            <p style={{ fontSize: "14px", color: "#9aa0a6" }}>크롤러를 실행하면 여기에 상품이 표시됩니다</p>
          </div>
        )}
      </div>

      <footer className="footer">
        <div className="footer-top">대한민국</div>
        <div className="footer-bottom">
          <div className="footer-links">
            <span>소개</span>
            <span>개인정보처리방침</span>
            <span>약관</span>
          </div>
          <div className="footer-links">
            <span>API</span>
            <span>에이전트</span>
            <span>문의</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
