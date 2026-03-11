"use client";

import { Deal, SOURCE_NAMES, SOURCE_COLORS, formatPrice, timeAgo, sanitizeUrl } from "@/lib/shared";

type DealFeedProps = {
  deals: Deal[];
  feedTab: "hot" | "latest";
  feedFilter: string;
  feedLoading: boolean;
  onTabChange: (tab: "hot" | "latest") => void;
  onFilterChange: (filter: string) => void;
};

export default function DealFeed({ deals, feedTab, feedFilter, feedLoading, onTabChange, onFilterChange }: DealFeedProps) {
  return (
    <div className="feed">
      <div className="feed-header">
        <div className="feed-tabs">
          <button className={`feed-tab ${feedTab === "hot" ? "active" : ""}`} onClick={() => onTabChange("hot")}>HOT</button>
          <button className={`feed-tab ${feedTab === "latest" ? "active" : ""}`} onClick={() => onTabChange("latest")}>최신</button>
        </div>
        <div className="feed-filters">
          {["all", ...Array.from(new Set(deals.map(d => d.source)))].map(s => (
            <button key={s} className={`filter-btn ${feedFilter === s ? "active" : ""}`} onClick={() => onFilterChange(s)}>
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
        <div className="empty-feed">아직 수집된 딜이 없습니다.</div>
      )}
    </div>
  );
}
