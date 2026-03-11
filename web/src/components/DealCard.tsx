import {
  Deal, formatPrice, timeAgo, sanitizeUrl,
  SOURCE_NAMES, SOURCE_COLORS,
} from "@/lib/shared";

type DealCardProps = {
  deal: Deal;
  showHotBadge?: boolean;
  showOriginalPrice?: boolean;
};

export default function DealCard({ deal, showHotBadge = true, showOriginalPrice = true }: DealCardProps) {
  const isHot = showHotBadge && deal.hotScore && deal.hotScore > 30;
  const isBiz = deal.source.startsWith("biz:");

  return (
    <a
      href={sanitizeUrl(deal.url)}
      target="_blank"
      rel="noopener noreferrer"
      className={`deal-card ${isHot ? "deal-hot" : ""}`}
    >
      {isHot && (
        <div className="hot-score-bar">
          <span className="hot-fire">🔥 HOT</span>
          {deal.recommendations && deal.recommendations > 0 && (
            <span className="hot-recs">추천 {deal.recommendations}</span>
          )}
        </div>
      )}
      <div className="deal-image">
        {deal.image_url ? (
          <img
            src={deal.image_url}
            alt={deal.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="deal-image-placeholder">
            <span>{SOURCE_NAMES[deal.source] || deal.source}</span>
          </div>
        )}
      </div>
      <div className="deal-body">
        <div className="deal-source">
          <span
            className="deal-source-badge"
            style={{ background: isBiz ? "#6c5ce7" : (SOURCE_COLORS[deal.source] || "#5f6368") }}
          >
            {isBiz ? deal.source.replace("biz:", "") : (SOURCE_NAMES[deal.source] || deal.source)}
          </span>
          <span className="deal-time">{timeAgo(deal.posted_at)}</span>
        </div>
        <div className="deal-title">{deal.title}</div>
        <div className="deal-price-row">
          {deal.discount_rate > 0 && <span className="deal-discount">{deal.discount_rate}%</span>}
          {deal.sale_price > 0 && <span className="deal-sale-price">{formatPrice(deal.sale_price)}</span>}
        </div>
        {showOriginalPrice && deal.original_price > 0 && deal.original_price !== deal.sale_price && (
          <span className="deal-original-price">{formatPrice(deal.original_price)}</span>
        )}
      </div>
    </a>
  );
}
