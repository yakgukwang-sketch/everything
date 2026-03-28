"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_URL, Deal, formatPrice } from "@/lib/shared";

const BRANDS: Record<string, { name: string; color: string; logo: string }> = {
  gs25: { name: "GS25", color: "#00a4e0", logo: "🏪" },
  cu: { name: "CU", color: "#652f8d", logo: "🟣" },
  seven_eleven: { name: "세븐일레븐", color: "#008061", logo: "🟢" },
};

type EventTab = "all" | "1+1" | "2+1";

export default function CvsFlyer() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const brand = BRANDS[id] || { name: id, color: "#333", logo: "🏪" };

  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<EventTab>("all");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/deals?source=${id}&limit=100&sort=latest`);
        const data = await res.json();
        setDeals(data.data || []);
      } catch {
        setDeals([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const filtered = tab === "all"
    ? deals
    : deals.filter(d => d.description?.includes(tab));

  return (
    <div className="flyer-page">
      <div className="flyer-header" style={{ background: brand.color }}>
        <button className="flyer-back" onClick={() => router.push("/")}>←</button>
        <span className="flyer-logo">{brand.logo}</span>
        <span className="flyer-brand-name">{brand.name} 행사 전단지</span>
      </div>

      <div className="flyer-tabs">
        {(["all", "1+1", "2+1"] as EventTab[]).map(t => (
          <button
            key={t}
            className={`flyer-tab ${tab === t ? "active" : ""}`}
            style={tab === t ? { background: brand.color, color: "#fff" } : {}}
            onClick={() => setTab(t)}
          >
            {t === "all" ? "전체" : t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flyer-loading">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="flyer-empty">행사 상품이 없습니다</div>
      ) : (
        <div className="flyer-grid">
          {filtered.map((deal, i) => (
            <div key={i} className="flyer-item">
              {deal.image_url ? (
                <div className="flyer-item-img">
                  <img
                    src={deal.image_url}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              ) : (
                <div className="flyer-item-img flyer-item-noimg">
                  <span>{brand.logo}</span>
                </div>
              )}
              <div className="flyer-item-badge" style={{ background: brand.color }}>
                {deal.description || brand.name}
              </div>
              <div className="flyer-item-title">
                {deal.title.replace(/^\[.*?\]\s*/, "")}
              </div>
              {deal.sale_price > 0 && (
                <div className="flyer-item-price">{formatPrice(deal.sale_price)}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
