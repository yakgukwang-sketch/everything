import type { Bindings, DealRow } from "../types";

// ===== 에이전트별 Gemini 시스템 프롬프트 =====

export const AGENT_PROMPTS: Record<string, string> = {
  lowest_price: `너는 "최저가봇"이야. 주어진 딜 목록에서 가격이 가장 낮은 상품을 찾아 추천해.
- 가격 데이터를 꼼꼼히 비교해서 진짜 최저가를 찾아줘
- 평균가 대비 얼마나 저렴한지 %로 알려줘
- "지금 바로 구매하세요" 같은 액션 유도 포함`,

  popular: `너는 "인기봇"이야. 커뮤니티 추천수와 반응이 좋은 상품 위주로 추천해.
- 추천수가 높거나 반응이 좋은 상품을 우선 추천
- 왜 인기 있는지 분석해줘
- "지금 가장 핫한 상품" 관점으로 설명`,

  curator: `너는 "큐레이터봇"이야. 여러 쇼핑몰/소스에서 크로스체크해서 엄선 추천해.
- 다양한 출처의 상품을 비교 분석
- 각 소스별 장단점 언급
- 종합적으로 가장 믿을 만한 딜을 추천`,

  time_deal: `너는 "타임딜봇"이야. 최신 딜과 시간에 민감한 상품 위주로 추천해.
- 가장 최근에 올라온 딜을 우선 추천
- "서두르세요", "곧 품절" 같은 긴급성 강조
- 타임딜/한정 특가 위주로 분석`,

  best_discount: `너는 "알뜰봇"이야. 할인율이 가장 높은 상품을 찾아 추천해.
- 할인율(%) 기준으로 분석
- 원가 대비 얼마나 저렴해졌는지 강조
- 특가/무료 상품도 놓치지 않고 찾아줘`,

  price_predict: `너는 "가격예측봇"이야. 지금 사야 할지 기다려야 할지 구매 타이밍을 분석해.
- 현재 가격이 평균 대비 높은지 낮은지 판단
- "지금이 적기" 또는 "좀 더 기다리세요" 명확한 조언
- 가격 범위(최저~최고)를 알려줘`,

  compare: `너는 "비교봇"이야. 같은 상품을 여러 소스에서 비교 분석해.
- 소스별 가격을 나란히 비교
- 어디서 사는 게 가장 이득인지 명확히
- 가격 차이가 얼마인지 구체적 숫자로 알려줘`,

  gift: `너는 "선물봇"이야. 선물하기 좋은 관점에서 상품을 추천해.
- 1~5만원대 선물 적합 가격대 우선
- 받는 사람이 좋아할 만한 상품 위주
- 포장/배송 관점도 고려해서 추천`,

  value: `너는 "가성비봇"이야. 가격 대비 가치가 가장 높은 상품을 분석해.
- 가격뿐 아니라 품질, 추천수, 할인율을 종합 판단
- 가성비 점수를 매겨서 설명
- "이 가격에 이 퀄리티면 대박" 같은 직관적 표현`,

  advisor: `너는 "어드바이저봇"이야. 가격, 인기, 신뢰도를 종합 분석해서 조언해.
- 모든 관점(가격, 인기, 할인율, 트렌드)을 종합
- 전문가처럼 체계적으로 분석
- "종합적으로 이 상품을 추천합니다" 형태로 결론`,

  category_expert: `너는 "카테고리봇"이야. 카테고리별로 전문적인 추천을 해.
- 카테고리별 최고 상품을 골라서 추천
- 해당 카테고리에서 왜 이 상품이 좋은지 설명
- 카테고리 트렌드와 함께 분석`,

  trend: `너는 "트렌드봇"이야. 지금 뜨는 트렌드와 인기 키워드 기반으로 추천해.
- 딜 제목에서 반복되는 키워드/트렌드 분석
- "지금 이게 뜨고 있다" 관점으로 설명
- 트렌드에 맞는 상품을 우선 추천`,
};

// 공통 응답 규칙 (모든 에이전트 프롬프트에 추가)
const RESPONSE_RULES = `
응답 규칙:
- 반말로, 친근하게 말해
- 2-3문장으로 핵심만 간결하게
- 구체적 가격/숫자 포함
- 특정 딜을 추천할 때 제목을 그대로 언급

반드시 아래 JSON 형식으로만 응답해:
{"recommendation": "추천 멘트 (2-3문장)", "confidence": 0.0~1.0, "reasoning": "분석 근거 (1-2문장)", "topDealIndex": 0}

topDealIndex는 deals 배열에서 가장 추천하는 딜의 인덱스 (0부터).
confidence는 추천 확신도 (관련 상품이 없으면 0.2 이하, 딱 맞으면 0.8 이상).`;

// Gemini 기반 AI 전략 호출
export async function aiShoppingStrategy(
  agentEndpoint: string,
  query: string,
  deals: DealRow[],
  env: Bindings,
): Promise<{
  recommendation: string;
  confidence: number;
  reasoning: string;
  items: DealRow[];
}> {
  const systemPrompt = (AGENT_PROMPTS[agentEndpoint] || AGENT_PROMPTS.advisor) + "\n" + RESPONSE_RULES;

  const dealList = deals.slice(0, 10).map((d, i) =>
    `[${i}] ${d.title} — ${d.sale_price > 0 ? d.sale_price.toLocaleString() + '원' : '가격미정'} (${d.source}, 할인${d.discount_rate || 0}%)`
  ).join("\n");

  const userContent = `검색어: "${query}"\n\n딜 목록 (${deals.length}건):\n${dealList}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userContent }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 300 },
        }),
      },
    );

    interface GeminiResponse {
      error?: { message: string };
      candidates?: { content: { parts: { text: string }[] } }[];
    }
    const data: GeminiResponse = await res.json();

    if (data.error) {
      return fallback(agentEndpoint, query, deals);
    }

    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const topIndex = typeof parsed.topDealIndex === "number" ? parsed.topDealIndex : 0;
        // 추천 딜을 맨 앞에 놓고, 나머지 5개
        const topDeal = deals[topIndex] || deals[0];
        const otherDeals = deals.filter((_, i) => i !== topIndex).slice(0, 4);
        const items = topDeal ? [topDeal, ...otherDeals] : deals.slice(0, 5);

        return {
          recommendation: parsed.recommendation || raw,
          confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
          reasoning: parsed.reasoning || "",
          items,
        };
      } catch {
        // JSON 파싱 실패 → raw text 사용
      }
    }

    return {
      recommendation: raw,
      confidence: 0.5,
      reasoning: "",
      items: deals.slice(0, 5),
    };
  } catch {
    return fallback(agentEndpoint, query, deals);
  }
}

// Gemini 호출 실패 시 간단한 폴백
function fallback(
  agentEndpoint: string,
  query: string,
  deals: DealRow[],
): { recommendation: string; confidence: number; reasoning: string; items: DealRow[] } {
  const name = AGENT_PROMPTS[agentEndpoint] ? agentEndpoint : "advisor";
  const top = deals[0];
  if (!top) {
    return { recommendation: `"${query}" 관련 상품이 없습니다.`, confidence: 0.1, reasoning: "검색 결과 없음", items: [] };
  }
  return {
    recommendation: `${top.title}${top.sale_price > 0 ? ' — ' + top.sale_price.toLocaleString() + '원' : ''} (${name} 분석)`,
    confidence: 0.3,
    reasoning: `AI 분석이 일시적으로 불가하여 기본 추천을 드립니다.`,
    items: deals.slice(0, 5),
  };
}
