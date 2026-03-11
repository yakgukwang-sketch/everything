import { DeliveryAgent, StoreRow } from "../types";

// ===== 5개 배달 에이전트 전략 =====

const lowestPrice: DeliveryAgent = {
  name: "최저가",
  description: "가장 저렴한 가게를 찾아드려요",
  evaluate(items, ctx) {
    // menu_info에서 가격 추출 시도
    const withPrice = items.map(s => {
      const priceMatch = (s.menu_info || "").match(/[\d,]+원/);
      const price = priceMatch ? parseInt(priceMatch[0].replace(/[,원]/g, "")) : 0;
      return { store: s, price };
    });
    const priced = withPrice.filter(s => s.price > 0).sort((a, b) => a.price - b.price);
    let store: StoreRow | null;
    let reasoning: string;
    if (priced.length > 0) {
      store = priced[0].store;
      reasoning = `${store.name}은(는) 메뉴 가격이 저렴합니다. 가성비 최고!`;
    } else {
      const sorted = [...items].sort((a, b) => (b.review_count || 0) - (a.review_count || 0));
      store = sorted[0] || null;
      reasoning = store ? `${store.name}은(는) 가성비가 좋기로 유명합니다.` : noStore(ctx.area);
    }
    const fee = Math.max(2000, Math.round(ctx.budget * 0.05));
    return { recommendation: reasoning, confidence: store ? 0.7 : 0.1, reasoning, topPick: store, items: store ? [store] : [], meta: { deliveryFee: fee } };
  },
};

const popularAgent: DeliveryAgent = {
  name: "맛집",
  description: "평점 최고 맛집을 추천해요",
  evaluate(items, ctx) {
    const sorted = [...items].sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.review_count || 0) - (a.review_count || 0));
    const store = sorted[0] || null;
    const reasoning = store ? `${store.name} — 평점 ${store.rating}점, 리뷰 ${store.review_count}개! 검증된 맛집입니다.` : noStore(ctx.area);
    const fee = Math.max(3000, Math.round(ctx.budget * 0.08));
    return { recommendation: reasoning, confidence: store ? 0.8 : 0.1, reasoning, topPick: store, items: store ? [store] : [], meta: { deliveryFee: fee } };
  },
};

const fastDelivery: DeliveryAgent = {
  name: "빠른배달",
  description: "가장 가까운 가게로 빠르게 배달해요",
  evaluate(items, ctx) {
    const sorted = [...items].sort((a, b) => (b.verified ? 1 : 0) - (a.verified ? 1 : 0));
    const store = sorted[0] || null;
    const reasoning = store ? `${store.name}은(는) 검증된 가게라 조리가 빠르고 배달이 신속합니다!` : noStore(ctx.area);
    const fee = Math.max(2500, Math.round(ctx.budget * 0.06));
    return { recommendation: reasoning, confidence: store ? 0.75 : 0.1, reasoning, topPick: store, items: store ? [store] : [], meta: { deliveryFee: fee } };
  },
};

const curatorAgent: DeliveryAgent = {
  name: "큐레이터",
  description: "가격·맛·속도 종합 분석해요",
  evaluate(items, ctx) {
    const scored = items.map(s => {
      let score = 0;
      score += (s.rating || 0) * 20;
      score += (s.review_count || 0) * 0.5;
      if (s.verified) score += 30;
      if (s.review_count > 50 && ctx.budget > 0) score += 20;
      return { store: s, score };
    }).sort((a, b) => b.score - a.score);
    const best = scored[0];
    const store = best?.store || null;
    const reasoning = store ? `${store.name} — 맛, 가격, 배달 속도를 종합 분석한 최적의 선택입니다!` : noStore(ctx.area);
    const fee = Math.max(2500, Math.round(ctx.budget * 0.07));
    return { recommendation: reasoning, confidence: store ? 0.8 : 0.1, reasoning, topPick: store, items: store ? [store] : [], meta: { deliveryFee: fee } };
  },
};

const reviewKing: DeliveryAgent = {
  name: "리뷰왕",
  description: "리뷰가 많은 검증된 가게를 추천해요",
  evaluate(items, ctx) {
    const sorted = [...items].sort((a, b) => (b.review_count || 0) - (a.review_count || 0));
    const store = sorted[0] || null;
    const reasoning = store ? `${store.name} — 리뷰 ${store.review_count}개! 많은 사람들이 선택한 데는 이유가 있습니다.` : noStore(ctx.area);
    const fee = Math.max(2500, Math.round(ctx.budget * 0.06));
    return { recommendation: reasoning, confidence: store ? 0.75 : 0.1, reasoning, topPick: store, items: store ? [store] : [], meta: { deliveryFee: fee } };
  },
};

function noStore(area: string) {
  return `${area} 지역에 관련 가게가 없습니다`;
}

// ===== 전략 레지스트리 =====

export const DELIVERY_STRATEGIES: Record<string, DeliveryAgent> = {
  lowest_price: lowestPrice,
  popular: popularAgent,
  fast_delivery: fastDelivery,
  curator: curatorAgent,
  value: reviewKing,
};
