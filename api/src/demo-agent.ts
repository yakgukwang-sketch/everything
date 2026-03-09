/**
 * 데모 에이전트: 최저가봇
 *
 * everything API를 호출하여 최저가 상품을 찾고 추천하는 에이전트.
 * 실제 에이전트가 어떻게 동작하는지 보여주는 데모용.
 */

const API_URL = "https://everything-api.deri58.workers.dev";

interface DealResponse {
  success: boolean;
  data: Deal[];
}

interface Deal {
  id: number;
  title: string;
  description: string;
  original_price: number;
  sale_price: number;
  discount_rate: number;
  url: string;
  source: string;
  category: string;
  posted_at: string;
}

interface AgentRequest {
  query: string;
}

interface AgentResponse {
  recommendation: string;
  confidence: number;
  deals: Deal[];
  reasoning: string;
}

async function findBestDeals(query: string): Promise<Deal[]> {
  const resp = await fetch(`${API_URL}/api/deals?q=${encodeURIComponent(query)}&sort=price_low&limit=10`);
  const data = await resp.json() as DealResponse;
  return data.data || [];
}

function analyzePrices(deals: Deal[]): { cheapest: Deal | null; avgPrice: number; analysis: string } {
  if (deals.length === 0) {
    return { cheapest: null, avgPrice: 0, analysis: "관련 상품을 찾지 못했습니다." };
  }

  const withPrice = deals.filter(d => d.sale_price > 0);
  if (withPrice.length === 0) {
    return { cheapest: deals[0], avgPrice: 0, analysis: "가격 정보가 있는 상품이 없습니다." };
  }

  withPrice.sort((a, b) => a.sale_price - b.sale_price);
  const cheapest = withPrice[0];
  const avgPrice = Math.round(withPrice.reduce((sum, d) => sum + d.sale_price, 0) / withPrice.length);

  const savingsPercent = avgPrice > 0 ? Math.round((1 - cheapest.sale_price / avgPrice) * 100) : 0;

  let analysis = `${withPrice.length}개 상품 분석 완료. `;
  analysis += `평균가 ${avgPrice.toLocaleString()}원 대비 최저가 ${cheapest.sale_price.toLocaleString()}원`;
  if (savingsPercent > 0) {
    analysis += ` (${savingsPercent}% 저렴)`;
  }
  analysis += `. 출처: ${cheapest.source}`;

  if (cheapest.discount_rate && cheapest.discount_rate > 30) {
    analysis += `. 할인율 ${cheapest.discount_rate}%로 매우 좋은 딜입니다. 빠른 구매를 추천합니다.`;
  } else if (cheapest.discount_rate && cheapest.discount_rate > 15) {
    analysis += `. 적당한 할인율입니다.`;
  }

  return { cheapest, avgPrice, analysis };
}

function generateRecommendation(query: string, deals: Deal[], analysis: ReturnType<typeof analyzePrices>): AgentResponse {
  if (!analysis.cheapest) {
    return {
      recommendation: `"${query}"에 대한 할인 상품을 찾지 못했습니다. 다른 키워드로 검색해보세요.`,
      confidence: 0.1,
      deals: [],
      reasoning: "검색 결과 없음",
    };
  }

  const confidence = Math.min(0.95, 0.5 + (deals.length * 0.05));

  return {
    recommendation: `[최저가] ${analysis.cheapest.title} — ${analysis.cheapest.sale_price.toLocaleString()}원`,
    confidence,
    deals: deals.slice(0, 5),
    reasoning: analysis.analysis,
  };
}

export default {
  async fetch(request: Request): Promise<Response> {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // GET /info — 에이전트 정보
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/info") {
      return new Response(JSON.stringify({
        name: "최저가봇",
        description: "실시간 최저가 분석 및 구매 추천 에이전트. 여러 쇼핑 커뮤니티의 핫딜을 분석하여 가장 저렴한 상품을 찾아드립니다.",
        commission_rate: 2,
        version: "0.1.0",
      }), { headers: corsHeaders });
    }

    // POST / — 쿼리 처리
    if (request.method === "POST") {
      try {
        const body = await request.json() as AgentRequest;
        const query = body.query;

        if (!query) {
          return new Response(JSON.stringify({ error: "query is required" }), {
            status: 400,
            headers: corsHeaders,
          });
        }

        const deals = await findBestDeals(query);
        const analysis = analyzePrices(deals);
        const response = generateRecommendation(query, deals, analysis);

        return new Response(JSON.stringify(response), { headers: corsHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Internal error" }), {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: corsHeaders,
    });
  },
};
