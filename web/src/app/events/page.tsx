"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface EventBanner {
  id: string;
  name: string;
  icon: string;
  eventUrl: string;
  color: string;
  description: string;
  category: string;
}

const EVENT_BANNERS: EventBanner[] = [
  // 항공사
  {
    id: "korean-air",
    name: "대한항공",
    icon: "✈️",
    eventUrl: "https://www.koreanair.com/kr/ko/promotion/list",
    color: "#00256C",
    description: "마일리지 적립·항공권 특가·여행 패키지",
    category: "항공",
  },
  {
    id: "asiana",
    name: "아시아나항공",
    icon: "🛫",
    eventUrl: "https://flyasiana.com/C/KR/KO/event/index",
    color: "#C4272F",
    description: "특가 항공권·마일리지 프로모션",
    category: "항공",
  },
  {
    id: "jeju-air",
    name: "제주항공",
    icon: "🍊",
    eventUrl: "https://www.jejuair.net/ko/event/event.do",
    color: "#FF6600",
    description: "초특가 항공권·깜짝 세일",
    category: "항공",
  },
  {
    id: "tway",
    name: "티웨이항공",
    icon: "🔴",
    eventUrl: "https://www.twayair.com/app/promotion/event/being",
    color: "#E60012",
    description: "특가·쿠폰·이벤트",
    category: "항공",
  },
  {
    id: "jin-air",
    name: "진에어",
    icon: "💚",
    eventUrl: "https://www.jinair.com/promotion/eventList?snsLang=ko_KR&ctrCd=KOR",
    color: "#00A651",
    description: "플라이데이·특가 프로모션",
    category: "항공",
  },
  {
    id: "air-busan",
    name: "에어부산",
    icon: "🌊",
    eventUrl: "https://www.airbusan.com/content/common/flynjoy/flyNEvent/",
    color: "#00AEEF",
    description: "FLY&JOY 이벤트·특가",
    category: "항공",
  },
  {
    id: "air-seoul",
    name: "에어서울",
    icon: "💙",
    eventUrl: "https://flyairseoul.com/CW/ko/ingEvent.do",
    color: "#0066B3",
    description: "서울 출발 특가·이벤트",
    category: "항공",
  },
  {
    id: "eastar",
    name: "이스타항공",
    icon: "⭐",
    eventUrl: "https://www.eastarjet.com/newstar/PGWTA00001",
    color: "#F7941D",
    description: "뉴스타 특가·이벤트",
    category: "항공",
  },
  // 쇼핑
  {
    id: "coupang",
    name: "쿠팡",
    icon: "🚀",
    eventUrl: "https://www.coupang.com/np/goldbox",
    color: "#E31837",
    description: "골드박스·로켓와우·타임딜",
    category: "쇼핑",
  },
  {
    id: "naver-shopping",
    name: "네이버 쇼핑",
    icon: "💚",
    eventUrl: "https://shopping.naver.com/plan/home",
    color: "#03C75A",
    description: "기획전·쇼핑라이브·최저가",
    category: "쇼핑",
  },
  {
    id: "11st",
    name: "11번가",
    icon: "🔴",
    eventUrl: "https://www.11st.co.kr/html/event/event_main.html",
    color: "#FF0000",
    description: "십일절·타임딜·쿠폰",
    category: "쇼핑",
  },
  {
    id: "gmarket",
    name: "G마켓",
    icon: "🟢",
    eventUrl: "https://corners.gmarket.co.kr/Corners/Promotion",
    color: "#00A846",
    description: "슈퍼딜·빅스마일데이",
    category: "쇼핑",
  },
  // 결제·카드
  {
    id: "toss",
    name: "토스",
    icon: "💙",
    eventUrl: "https://toss.im/benefitshub",
    color: "#0064FF",
    description: "캐시백·머니 이벤트",
    category: "결제",
  },
  {
    id: "kakaopay",
    name: "카카오페이",
    icon: "💛",
    eventUrl: "https://www.kakaopay.com/promotion",
    color: "#FEE500",
    description: "결제 혜택·포인트 적립",
    category: "결제",
  },
  {
    id: "naverpay",
    name: "네이버페이",
    icon: "💚",
    eventUrl: "https://new-m.pay.naver.com/benefit",
    color: "#03C75A",
    description: "포인트 충전·결제 혜택",
    category: "결제",
  },
];

const CATEGORIES = ["전체", "항공", "쇼핑", "결제"];

export default function EventsPage() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState("전체");

  const filtered = activeCategory === "전체"
    ? EVENT_BANNERS
    : EVENT_BANNERS.filter(b => b.category === activeCategory);

  return (
    <div className="main">
      <header className="header">
        <span className="header-link" onClick={() => router.push("/")} style={{ cursor: "pointer" }}>홈</span>
        <span className="header-link" onClick={() => router.push("/agents")} style={{ cursor: "pointer" }}>에이전트</span>
        <span className="header-link" onClick={() => router.push("/seller/login")} style={{ cursor: "pointer" }}>셀러</span>
      </header>

      <div className="events-page">
        <div className="events-hero">
          <h1 className="events-title">🔥 지금 진행중인 이벤트</h1>
          <p className="events-subtitle">항공권부터 쇼핑, 결제 혜택까지 — 더 싸게 사는 모든 방법</p>
        </div>

        <div className="events-categories">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              className={`events-cat-btn ${activeCategory === cat ? "active" : ""}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="events-grid">
          {filtered.map(banner => (
            <a
              key={banner.id}
              href={banner.eventUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="event-banner"
              style={{ "--banner-color": banner.color } as React.CSSProperties}
            >
              <div className="event-banner-icon">{banner.icon}</div>
              <div className="event-banner-info">
                <div className="event-banner-name">{banner.name}</div>
                <div className="event-banner-desc">{banner.description}</div>
              </div>
              <div className="event-banner-category">{banner.category}</div>
              <div className="event-banner-arrow">→</div>
            </a>
          ))}
        </div>

        <div className="events-footer-note">
          더 많은 이벤트가 곧 추가됩니다
        </div>
      </div>
    </div>
  );
}
