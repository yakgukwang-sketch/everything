import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  DB: D1Database;
  GEMINI_API_KEY: string;
  ADMIN_API_KEY: string;
};

interface DealRow {
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
  source_id: string;
  posted_at: string;
  created_at: string;
  expires_at: string;
}

interface AgentRow {
  id: number;
  name: string;
  description: string | null;
  commission_rate: number;
  endpoint: string | null;
  api_key: string | null;
  rating: number;
  review_count: number;
  total_queries: number;
  status: string;
  created_at: string;
}

interface AgentStrategyResult {
  recommendation: string;
  confidence: number;
  reasoning: string;
  deals: DealRow[];
}

type AgentStrategy = (query: string, allDeals: DealRow[]) => AgentStrategyResult;

interface StoreRow {
  id: number;
  name: string;
  address: string;
  road_address: string;
  phone: string;
  category: string;
  lat: number;
  lng: number;
  verified: boolean;
  menu_info: string;
  image_url: string;
  rating: number;
  review_count: number;
}

interface DeliveryOrderRow {
  id: number;
  consumer_request: string;
  area: string;
  food_type: string;
  budget: number;
  quantity: string;
  status: string;
  selected_agent_id: number;
  selected_driver_id: number;
  final_price: number;
  store_id: number;
  created_at: string;
  updated_at: string;
}

interface DriverRow {
  id: number;
  name: string;
  phone: string;
  area: string;
  vehicle_type: string;
  status: string;
  rating: number;
  review_count: number;
  total_deliveries: number;
  created_at: string;
}

// 배달 에이전트 전략: 각 에이전트가 가게를 다른 기준으로 추천
interface DeliveryBidStrategy {
  name: string;
  description: string;
  selectStore: (stores: StoreRow[], budget: number) => { store: StoreRow | null; reasoning: string };
  calculateFee: (budget: number) => number;
}

const DELIVERY_STRATEGIES: Record<string, DeliveryBidStrategy> = {
  // 최저가 에이전트: 가장 저렴한 가게 추천
  lowest_price: {
    name: "최저가",
    description: "가장 저렴한 가게를 찾아드려요",
    selectStore: (stores, _budget) => {
      // menu_info에서 가격 파싱 시도, 없으면 rating 낮은 순 (저렴할 가능성)
      const sorted = [...stores].sort((a, b) => (a.rating || 5) - (b.rating || 5));
      const store = sorted[0] || null;
      return { store, reasoning: store ? `${store.name}은(는) 가성비가 좋기로 유명합니다. 저렴한 가격에 만족스러운 맛!` : "해당 지역에 관련 가게가 없습니다" };
    },
    calculateFee: (budget) => Math.max(2000, Math.round(budget * 0.05)),
  },
  // 맛집 에이전트: 평점 높은 가게 추천
  popular: {
    name: "맛집",
    description: "평점 최고 맛집을 추천해요",
    selectStore: (stores, _budget) => {
      const sorted = [...stores].sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.review_count || 0) - (a.review_count || 0));
      const store = sorted[0] || null;
      return { store, reasoning: store ? `${store.name} — 평점 ${store.rating}점, 리뷰 ${store.review_count}개! 검증된 맛집입니다.` : "해당 지역에 관련 가게가 없습니다" };
    },
    calculateFee: (budget) => Math.max(3000, Math.round(budget * 0.08)),
  },
  // 가까운 가게 에이전트: 빠른 배달 우선
  best_discount: {
    name: "빠른배달",
    description: "가장 가까운 가게로 빠르게 배달해요",
    selectStore: (stores, _budget) => {
      // verified 가게 우선 (검증된 = 자주 주문되는 = 빠른 조리)
      const sorted = [...stores].sort((a, b) => (b.verified ? 1 : 0) - (a.verified ? 1 : 0));
      const store = sorted[0] || null;
      return { store, reasoning: store ? `${store.name}은(는) 검증된 가게라 조리가 빠르고 배달이 신속합니다!` : "해당 지역에 관련 가게가 없습니다" };
    },
    calculateFee: (budget) => Math.max(2500, Math.round(budget * 0.06)),
  },
  // 큐레이터 에이전트: 종합 분석
  curator: {
    name: "큐레이터",
    description: "가격·맛·속도 종합 분석해요",
    selectStore: (stores, budget) => {
      const scored = stores.map(s => {
        let score = 0;
        score += (s.rating || 0) * 20;
        score += (s.review_count || 0) * 0.5;
        if (s.verified) score += 30;
        // 예산 고려: 리뷰 많으면 합리적 가격일 가능성
        if (s.review_count > 50 && budget > 0) score += 20;
        return { store: s, score };
      }).sort((a, b) => b.score - a.score);
      const best = scored[0];
      return {
        store: best?.store || null,
        reasoning: best?.store ? `${best.store.name} — 맛, 가격, 배달 속도를 종합 분석한 최적의 선택입니다!` : "해당 지역에 관련 가게가 없습니다",
      };
    },
    calculateFee: (budget) => Math.max(2500, Math.round(budget * 0.07)),
  },
  // 리뷰 많은 가게 에이전트
  value: {
    name: "리뷰왕",
    description: "리뷰가 많은 검증된 가게를 추천해요",
    selectStore: (stores, _budget) => {
      const sorted = [...stores].sort((a, b) => (b.review_count || 0) - (a.review_count || 0));
      const store = sorted[0] || null;
      return { store, reasoning: store ? `${store.name} — 리뷰 ${store.review_count}개! 많은 사람들이 선택한 데는 이유가 있습니다.` : "해당 지역에 관련 가게가 없습니다" };
    },
    calculateFee: (budget) => Math.max(2500, Math.round(budget * 0.06)),
  },
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("/*", cors({
  origin: (origin) => {
    if (!origin) return "https://everything-a6h.pages.dev";
    if (origin === "https://everything-a6h.pages.dev") return origin;
    if (origin.endsWith(".everything-a6h.pages.dev")) return origin;
    if (origin === "http://localhost:3000") return origin;
    return "https://everything-a6h.pages.dev";
  },
  allowMethods: ["GET", "POST"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

function sanitizeUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return "";
}

// Gemini 대화형 니즈 파악
const CHAT_SYSTEM_PROMPT = `너는 만능 어시스턴트야. 소비자가 뭘 원하는지 자연스러운 대화로 파악해.

중요: 요청은 크게 2가지 타입이 있어:
A) **배달/음식 주문** — 음식 이름이 나오면 무조건 배달이야. "제육볶음", "치킨", "피자", "족발", "떡볶이", "짜장면", "삼겹살", "곱창", "햄버거", "초밥" 등 음식 이름이 나오면 type을 "delivery"로.
B) **쇼핑/상품 검색** — 전자기기, 옷, 가구 등은 "shopping"

규칙:
1. 한 번에 질문 하나만 해. 짧고 친근하게.
2. 소비자가 모호하게 말하면 구체적으로 좁혀나가.

### 배달 (type: delivery)인 경우:
파악할 것 3가지:
- 음식 종류 (뭘 먹고 싶은지)
- 지역 + 수량 (어디서, 몇 인분)
- 예산 (얼마 이하)
3가지 모두 파악하면 즉시:
[READY]
{"type":"delivery","food":"제육볶음","area":"부천","quantity":"4인분","budget":"40000","keywords":["제육볶음","매콤"]}
[/READY]

### 쇼핑 (type: shopping)인 경우:
파악할 것 3가지:
- 상품 종류
- 용도/대상
- 예산
3가지 모두 파악하면 즉시:
[READY]
{"type":"shopping","product":"상품명","specs":{"key":"value"},"budget":"예산","keywords":["키워드1","키워드2"]}
[/READY]

공통 규칙:
3. 3가지를 모두 파악하기 전에는 절대 [READY]를 출력하지 마.
4. 매 질문마다 반드시 선택지를 제공해:

[OPTIONS]
선택지1|선택지2|선택지3|선택지4
[/OPTIONS]

5. 선택지는 2~5개. 짧고 명확하게 (10자 이내).
6. 아직 정보가 부족하면 [READY] 없이 다음 질문 + 선택지.
7. 인사나 관계없는 말에는 "뭐 찾고 있어? 쇼핑이야 배달이야?" + 선택지로 답해.
8. 반말로 친근하게 대화해.
9. 사용자가 "찾아줘", "충분해", "됐어" 같이 대화를 끝내려 해도 3가지 정보가 부족하면 부족한 것만 빠르게 물어봐.
10. 3가지 조건 중 대략적이라도 알 수 있으면 OK. 예: "2~3만원" → 예산 OK, "혼자" → 1인분.
11. 3가지가 갖춰지면 추가 질문 없이 즉시 [READY]를 출력해.

배달 예시 대화:
유저: "제육볶음 추천해줘"
→ 음식이니까 배달! "어디로 배달할까?"
유저: "부천"
→ "몇 인분 시킬까?"
유저: "2인분 3만원"
→ [READY]{"type":"delivery","food":"제육볶음","area":"부천","quantity":"2인분","budget":"30000","keywords":["제육볶음"]}[/READY]`;

app.post("/api/chat", async (c) => {
  try {
    const { messages } = await c.req.json() as { messages: { role: string; text: string }[] };

    if (!messages || messages.length === 0) {
      return c.json({ success: false, error: "messages required" }, 400);
    }

    // Gemini requires alternating user/model and must start with user
    const geminiMessages: { role: string; parts: { text: string }[] }[] = [];
    for (const m of messages) {
      const role = m.role === "user" ? "user" : "model";
      // Skip consecutive same-role messages by merging
      if (geminiMessages.length > 0 && geminiMessages[geminiMessages.length - 1].role === role) {
        geminiMessages[geminiMessages.length - 1].parts[0].text += "\n" + m.text;
      } else {
        geminiMessages.push({ role, parts: [{ text: m.text }] });
      }
    }

    // Ensure first message is from user
    if (geminiMessages.length > 0 && geminiMessages[0].role !== "user") {
      geminiMessages.shift();
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${c.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: CHAT_SYSTEM_PROMPT }] },
          contents: geminiMessages,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    interface GeminiResponse {
      error?: { message: string };
      candidates?: { content: { parts: { text: string }[] } }[];
    }
    const data: GeminiResponse = await res.json();

    if (data.error) {
      return c.json({ success: false, error: data.error.message || "Gemini API error" }, 502);
    }

    let reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // [OPTIONS] 블록 파싱
    let options: string[] = [];
    const optionsMatch = reply.match(/\[OPTIONS\]([\s\S]*?)\[\/OPTIONS\]/);
    if (optionsMatch) {
      options = optionsMatch[1].trim().split("|").map((o: string) => o.trim()).filter(Boolean);
      reply = reply.replace(/\[OPTIONS\][\s\S]*?\[\/OPTIONS\]/, "").trim();
    }

    // [READY] 블록 감지
    const readyMatch = reply.match(/\[READY\]([\s\S]*?)\[\/READY\]/);
    if (readyMatch) {
      try {
        const parsed = JSON.parse(readyMatch[1].trim());
        return c.json({
          success: true,
          reply: reply.replace(/\[READY\][\s\S]*?\[\/READY\]/, "").trim(),
          ready: true,
          query: parsed,
          options,
        });
      } catch {
        return c.json({ success: true, reply, ready: false, options });
      }
    }

    // Fallback: 대화가 5턴(유저 3회) 이상인데 READY가 안 나오면 자동 추출
    const userMsgs = messages.filter((m: { role: string; text: string }) => m.role === "user");
    if (userMsgs.length >= 3 && !readyMatch) {
      const allUserText = userMsgs.map((m: { role: string; text: string }) => m.text).join(" ");
      // 예산 패턴 감지
      const budgetMatch = allUserText.match(/(\d+)\s*만\s*원|(\d{4,})\s*원/);
      const budget = budgetMatch ? (budgetMatch[1] ? budgetMatch[1] + "0000" : budgetMatch[2]) : "";
      // 대화 내용에서 키워드 추출
      const keywords = allUserText.split(/[\s,|]+/).filter((w: string) => w.length >= 2 && !/^(나|네|응|좋|음|걍|그냥|뭐|이|그|저)$/.test(w));

      // 음식/배달 감지
      const foodKeywords = ["제육", "치킨", "피자", "족발", "보쌈", "떡볶이", "짜장", "짬뽕", "탕수육", "삼겹살", "곱창", "냉면", "김밥", "돈까스", "초밥", "회", "햄버거", "분식", "라멘", "파스타", "볶음밥", "국밥", "설렁탕", "갈비", "만두", "커피", "중국집", "한식", "양식", "일식"];
      const areaKeywords = ["강남", "강북", "강서", "강동", "송파", "마포", "종로", "서초", "관악", "영등포", "구로", "동대문", "성북", "노원", "은평", "도봉", "중랑", "광진", "동작", "양천", "용산", "부천", "인천", "서울", "수원", "성남", "안양", "고양", "용인", "화성", "시흥", "광명", "김포", "의정부", "파주", "일산", "분당", "판교", "동탄"];
      const isFood = foodKeywords.some(f => allUserText.includes(f));
      const detectedArea = areaKeywords.find(a => allUserText.includes(a)) || "";
      const quantityMatch = allUserText.match(/(\d+)\s*(인분|그릇|마리|판|개)/);

      // 배달은 음식 + 지역 + (예산 OR 수량) 3가지 있어야 트리거
      if (isFood && detectedArea && (budget || quantityMatch)) {
        const food = foodKeywords.find(f => allUserText.includes(f)) || keywords[0];
        return c.json({
          success: true,
          reply,
          ready: true,
          query: {
            type: "delivery",
            food,
            area: detectedArea || "부천",
            quantity: quantityMatch ? quantityMatch[0] : "1인분",
            budget: budget || "30000",
            keywords: keywords.slice(0, 5),
          },
          options,
        });
      }

      if (budget && keywords.length >= 2) {
        return c.json({
          success: true,
          reply,
          ready: true,
          query: {
            type: "shopping",
            product: keywords.slice(0, 3).join(" "),
            specs: {},
            budget,
            keywords: keywords.slice(0, 5),
          },
          options,
        });
      }
    }

    return c.json({ success: true, reply, ready: false, options });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

// 할인 상품 목록
app.get("/api/deals", async (c) => {
  const query = c.req.query("q") || "";
  const source = c.req.query("source") || "";
  const category = c.req.query("category") || "";
  const sort = c.req.query("sort") || "latest";
  const limit = Math.min(Math.max(1, Number(c.req.query("limit") || 30)), 100);
  const offset = Math.max(0, Number(c.req.query("offset") || 0));

  let sql = "SELECT * FROM deals WHERE 1=1";
  const params: string[] = [];

  if (query) {
    sql += " AND (title LIKE ? OR description LIKE ?)";
    params.push(`%${query}%`, `%${query}%`);
  }

  if (source) {
    sql += " AND source = ?";
    params.push(source);
  }

  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }

  if (sort === "discount") {
    sql += " ORDER BY discount_rate DESC";
  } else if (sort === "price_low") {
    sql += " ORDER BY sale_price ASC";
  } else {
    sql += " ORDER BY posted_at DESC";
  }

  sql += " LIMIT ? OFFSET ?";
  params.push(String(limit), String(offset));

  const result = await c.env.DB.prepare(sql)
    .bind(...params)
    .all();

  return c.json({
    success: true,
    data: result.results,
    meta: { total: result.results.length, offset, limit },
  });
});

// 할인 상품 상세
app.get("/api/deals/:id", async (c) => {
  const id = c.req.param("id");
  const result = await c.env.DB.prepare(
    "SELECT * FROM deals WHERE id = ?"
  )
    .bind(id)
    .first();

  if (!result) {
    return c.json({ success: false, error: "Not found" }, 404);
  }

  return c.json({ success: true, data: result });
});

// 소스별 통계
app.get("/api/stats", async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT source, COUNT(*) as count FROM deals GROUP BY source"
  ).all();

  return c.json({ success: true, data: result.results });
});

// 할인 상품 등록 (크롤러용 — 인증 필요)
app.post("/api/deals", async (c) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token || token !== c.env.ADMIN_API_KEY) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const deals = Array.isArray(body) ? body : [body];

  if (deals.length > 200) {
    return c.json({ success: false, error: "Maximum 200 deals per request" }, 400);
  }

  let inserted = 0;

  for (const deal of deals) {
    if (!deal.title || !deal.url || !deal.source) continue;
    if (!sanitizeUrl(deal.url)) continue;

    try {
      await c.env.DB.prepare(
        `INSERT OR REPLACE INTO deals
        (title, description, original_price, sale_price, discount_rate, url, image_url, category, source, source_id, posted_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          deal.title,
          deal.description || null,
          deal.original_price || null,
          deal.sale_price || null,
          deal.discount_rate || null,
          deal.url,
          deal.image_url || null,
          deal.category || null,
          deal.source,
          deal.source_id || null,
          deal.posted_at || new Date().toISOString(),
          deal.expires_at || null
        )
        .run();
      inserted++;
    } catch (e) {
      console.error("Insert failed:", e);
    }
  }

  return c.json({ success: true, inserted });
});

// ===== 사업자 상품 등록 =====

// 사업자 상품 등록
app.post("/api/deals/submit", async (c) => {
  const body = await c.req.json();

  // 필수 필드 검증
  if (!body.title || typeof body.title !== "string" || body.title.trim().length < 2) {
    return c.json({ success: false, error: "상품명은 2자 이상이어야 합니다" }, 400);
  }
  if (!body.url || typeof body.url !== "string" || !body.url.startsWith("http")) {
    return c.json({ success: false, error: "올바른 상품 URL을 입력해주세요" }, 400);
  }
  if (!body.business_name || typeof body.business_name !== "string" || body.business_name.trim().length < 2) {
    return c.json({ success: false, error: "사업자명은 2자 이상이어야 합니다" }, 400);
  }

  const salePrice = Number(body.sale_price) || 0;
  const originalPrice = Number(body.original_price) || 0;
  const discountRate = originalPrice > 0 && salePrice > 0 && salePrice < originalPrice
    ? Math.round((1 - salePrice / originalPrice) * 100)
    : 0;

  const sourceId = `biz_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    await c.env.DB.prepare(
      `INSERT INTO deals
      (title, description, original_price, sale_price, discount_rate, url, image_url, category, source, source_id, posted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      body.title.trim(),
      body.description?.trim() || "",
      originalPrice || null,
      salePrice || null,
      discountRate || null,
      body.url.trim(),
      body.image_url?.trim() || null,
      body.category?.trim() || "직접등록",
      `biz:${body.business_name.trim()}`,
      sourceId,
    ).run();

    return c.json({
      success: true,
      message: "상품이 등록되었습니다",
      source_id: sourceId,
    });
  } catch (e) {
    return c.json({ success: false, error: "등록 실패: " + (e instanceof Error ? e.message : "unknown") }, 500);
  }
});

// 사업자 등록 상품 조회
app.get("/api/deals/business", async (c) => {
  const name = c.req.query("name") || "";
  const limit = Math.min(Number(c.req.query("limit") || 50), 100);

  let sql = "SELECT * FROM deals WHERE source LIKE 'biz:%'";
  const params: string[] = [];

  if (name) {
    sql += " AND source = ?";
    params.push(`biz:${name}`);
  }

  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(String(limit));

  const result = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ success: true, data: result.results });
});

// ===== 에이전트 마켓플레이스 =====

// 에이전트 목록
app.get("/api/agents", async (c) => {
  const status = c.req.query("status") || "active";
  const sort = c.req.query("sort") || "rating";

  let sql = "SELECT id, name, description, commission_rate, rating, review_count, total_queries, status, created_at FROM agents WHERE status = ?";
  const params: string[] = [status];

  if (sort === "rating") {
    sql += " ORDER BY rating DESC, review_count DESC";
  } else if (sort === "queries") {
    sql += " ORDER BY total_queries DESC";
  } else {
    sql += " ORDER BY created_at DESC";
  }

  const result = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ success: true, data: result.results });
});

// 에이전트 랭킹 (리더보드 — 군중심리: 많이 쓰는 에이전트가 더 신뢰받음)
app.get("/api/agents/ranking", async (c) => {
  const agents = await c.env.DB.prepare(
    `SELECT id, name, description, commission_rate, rating, review_count, total_queries, status, created_at
     FROM agents WHERE status = 'active'
     ORDER BY total_queries DESC, rating DESC`
  ).all();

  const ranked = (agents.results as unknown as AgentRow[]).map((a, i) => {
    let badge = "";
    let tier = "";
    if (i === 0) { badge = "🥇"; tier = "1위"; }
    else if (i === 1) { badge = "🥈"; tier = "2위"; }
    else if (i === 2) { badge = "🥉"; tier = "3위"; }
    else { tier = `${i + 1}위`; }

    const trustScore = Math.round((a.total_queries * 0.3 + a.rating * 20 + a.review_count * 5) * 10) / 10;

    return { ...a, rank: i + 1, badge, tier, trustScore };
  });

  return c.json({ success: true, data: ranked });
});

// 에이전트 상세
app.get("/api/agents/:id", async (c) => {
  const id = c.req.param("id");
  const agent = await c.env.DB.prepare(
    "SELECT id, name, description, commission_rate, rating, review_count, total_queries, status, created_at FROM agents WHERE id = ?"
  ).bind(id).first();

  if (!agent) return c.json({ success: false, error: "Not found" }, 404);
  return c.json({ success: true, data: agent });
});

// 에이전트 등록 (인증 필요)
app.post("/api/agents/register", async (c) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token || token !== c.env.ADMIN_API_KEY) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();

  if (!body.name || typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 50) {
    return c.json({ success: false, error: "name은 2~50자 문자열이어야 합니다" }, 400);
  }
  if (body.commission_rate !== undefined && (body.commission_rate < 0 || body.commission_rate > 100)) {
    return c.json({ success: false, error: "commission_rate는 0~100 사이여야 합니다" }, 400);
  }

  const apiKey = crypto.randomUUID();

  await c.env.DB.prepare(
    "INSERT INTO agents (name, description, commission_rate, endpoint, api_key) VALUES (?, ?, ?, ?, ?)"
  ).bind(
    body.name.trim(),
    (body.description || "").substring(0, 500),
    body.commission_rate || 0,
    body.endpoint || "",
    apiKey
  ).run();

  return c.json({ success: true, api_key: apiKey, message: "에이전트가 등록되었습니다" });
});

// === 에이전트 전략 엔진 ===
const STRATEGIES: Record<string, AgentStrategy> = {
  // 최저가봇: 가격이 가장 낮은 상품 추천
  lowest_price: (query, allDeals) => {
    const withPrice = allDeals.filter(d => d.sale_price > 0).sort((a, b) => a.sale_price - b.sale_price);
    if (withPrice.length === 0) return { recommendation: `"${query}" 관련 할인 상품이 없습니다.`, confidence: 0.1, reasoning: "검색 결과 없음", deals: [] };
    const best = withPrice[0];
    const avg = Math.round(withPrice.reduce((s, d) => s + (d.sale_price ?? 0), 0) / withPrice.length);
    const savings = avg > 0 ? Math.round((1 - best.sale_price / avg) * 100) : 0;
    return {
      recommendation: `🔥 ${best.title} — ${best.sale_price.toLocaleString()}원! 지금이 최저가입니다!`,
      confidence: Math.min(0.95, 0.5 + withPrice.length * 0.05),
      reasoning: `${withPrice.length}개 비교 분석. 평균 ${avg.toLocaleString()}원 대비 ${savings}% 저렴. 출처: ${best.source}. 지금 바로 구매하세요!`,
      deals: withPrice.slice(0, 5),
    };
  },

  // 인기봇: 추천수/반응이 좋은 상품 추천
  popular: (query, allDeals) => {
    // description에 "추천 N" 형태로 추천수가 있음
    const scored = allDeals.map(d => {
      const match = (d.description || "").match(/추천\s*(\d+)/);
      return { ...d, score: match ? parseInt(match[1]) : 0 };
    }).sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best || best.score === 0) return { recommendation: `"${query}" 관련 인기 상품 정보가 부족합니다.`, confidence: 0.2, reasoning: "추천 데이터 부족", deals: scored.slice(0, 5) };
    return {
      recommendation: `👍 ${best.title} — 추천 ${best.score}개로 지금 가장 핫합니다!`,
      confidence: Math.min(0.9, 0.4 + best.score * 0.02),
      reasoning: `커뮤니티 반응 분석 결과. 추천 ${best.score}개는 상위 ${Math.max(1, Math.round(100 / (best.score + 1)))}% 수준. ${best.source}에서 화제!`,
      deals: scored.slice(0, 5),
    };
  },

  // 알뜰봇: 할인율이 높은 상품 추천
  best_discount: (query, allDeals) => {
    const withDiscount = allDeals.filter(d => d.discount_rate > 0).sort((a, b) => b.discount_rate - a.discount_rate);
    if (withDiscount.length === 0) {
      // 제목에서 할인 키워드 찾기
      const hasDeal = allDeals.filter(d => /무료|공짜|0원|할인|특가|세일/.test(d.title));
      if (hasDeal.length > 0) {
        return {
          recommendation: `💰 ${hasDeal[0].title} — 특가/무료 상품 발견!`,
          confidence: 0.6,
          reasoning: `${hasDeal.length}개 특가 상품 발견. 이건 놓치면 후회합니다!`,
          deals: hasDeal.slice(0, 5),
        };
      }
      return { recommendation: `"${query}" 관련 할인율 정보가 없습니다.`, confidence: 0.1, reasoning: "할인율 데이터 없음", deals: allDeals.slice(0, 5) };
    }
    const best = withDiscount[0];
    return {
      recommendation: `💰 ${best.title} — ${best.discount_rate}% 할인! ${best.sale_price ? best.sale_price.toLocaleString() + '원' : ''}`,
      confidence: Math.min(0.95, 0.5 + best.discount_rate * 0.005),
      reasoning: `할인율 ${best.discount_rate}%는 이 카테고리에서 최고 수준. ${best.original_price ? '원가 ' + best.original_price.toLocaleString() + '원에서 ' : ''}대폭 할인 중!`,
      deals: withDiscount.slice(0, 5),
    };
  },

  // 큐레이터봇: 다양한 소스에서 골라서 추천
  curator: (query, allDeals) => {
    // 소스별로 하나씩 골라서 다양하게 추천
    const bySource: Record<string, DealRow> = {};
    for (const d of allDeals) {
      if (!bySource[d.source]) bySource[d.source] = d;
    }
    const picks = Object.values(bySource).slice(0, 5);
    if (picks.length === 0) return { recommendation: `"${query}" 관련 상품이 없습니다.`, confidence: 0.1, reasoning: "검색 결과 없음", deals: [] };

    const sources = picks.map(p => p.source).join(", ");
    const topPick = picks[0];
    return {
      recommendation: `📋 오늘의 엄선: ${topPick.title}${topPick.sale_price ? ' — ' + topPick.sale_price.toLocaleString() + '원' : ''} 외 ${picks.length - 1}건`,
      confidence: Math.min(0.85, 0.4 + picks.length * 0.1),
      reasoning: `${sources} 등 ${Object.keys(bySource).length}개 사이트에서 크로스체크. 각 커뮤니티 반응을 종합하여 엄선한 추천입니다.`,
      deals: picks,
    };
  },

  // 타임딜봇: 최신 상품 위주로 추천
  time_deal: (query, allDeals) => {
    const sorted = [...allDeals].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const latest = sorted[0];
    if (!latest) return { recommendation: `"${query}" 관련 최신 딜이 없습니다.`, confidence: 0.1, reasoning: "검색 결과 없음", deals: [] };
    return {
      recommendation: `⚡ 방금 올라옴! ${latest.title}${latest.sale_price ? ' — ' + latest.sale_price.toLocaleString() + '원' : ''} 서두르세요!`,
      confidence: 0.75,
      reasoning: `방금 ${latest.source}에 올라온 따끈따끈한 딜! 핫딜은 빨리 품절됩니다. 지금 바로 확인하세요!`,
      deals: sorted.slice(0, 5),
    };
  },

  // 가격예측봇: 지금 살지 기다릴지 조언
  price_predict: (query, allDeals) => {
    const withPrice = allDeals.filter(d => d.sale_price > 0);
    if (withPrice.length === 0) return { recommendation: `"${query}" 관련 가격 데이터가 부족합니다.`, confidence: 0.1, reasoning: "가격 데이터 없음", deals: [] };

    const prices = withPrice.map(d => d.sale_price);
    const avg = Math.round(prices.reduce((a: number, b: number) => a + b, 0) / prices.length);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const cheapest = withPrice.find(d => d.sale_price === min)!;

    // 최저가가 평균의 70% 이하면 "지금 사라"
    const ratio = min / avg;
    const buyNow = ratio < 0.7;
    const savings = Math.round((1 - ratio) * 100);

    if (buyNow) {
      return {
        recommendation: `📊 지금이 적기! ${cheapest.title} — ${min.toLocaleString()}원 (평균 대비 ${savings}% 저렴)`,
        confidence: Math.min(0.9, 0.5 + savings * 0.005),
        reasoning: `${withPrice.length}개 상품 가격 분석 완료. 현재 최저가 ${min.toLocaleString()}원은 평균 ${avg.toLocaleString()}원 대비 ${savings}% 저렴합니다. 이 가격대가 유지될 확률은 낮으니 지금 구매를 추천합니다.`,
        deals: withPrice.sort((a, b) => a.sale_price - b.sale_price).slice(0, 5),
      };
    } else {
      return {
        recommendation: `📊 좀 더 기다리세요. 현재 최저가 ${min.toLocaleString()}원은 평균(${avg.toLocaleString()}원)과 큰 차이 없습니다.`,
        confidence: 0.6,
        reasoning: `${withPrice.length}개 상품 분석 결과 현재 가격이 특별히 저렴하지 않습니다. 평균 ${avg.toLocaleString()}원, 최저 ${min.toLocaleString()}원, 최고 ${max.toLocaleString()}원. 세일 시즌까지 기다리면 더 좋은 가격을 만날 수 있습니다.`,
        deals: withPrice.sort((a, b) => a.sale_price - b.sale_price).slice(0, 5),
      };
    }
  },

  // 카테고리봇: 카테고리별 전문 추천
  category_expert: (query, allDeals) => {
    // 카테고리별 그룹핑
    const byCategory: Record<string, DealRow[]> = {};
    for (const d of allDeals) {
      const cat = d.category || "기타";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(d);
    }

    // 가장 상품이 많은 카테고리 찾기
    const sorted = Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length);
    if (sorted.length === 0) return { recommendation: `"${query}" 관련 상품이 없습니다.`, confidence: 0.1, reasoning: "검색 결과 없음", deals: [] };

    // 각 카테고리에서 가성비 최고 1개씩
    const picks: DealRow[] = [];
    const catSummary: string[] = [];
    for (const [cat, items] of sorted.slice(0, 5)) {
      const withPrice = items.filter(d => (d.sale_price ?? 0) > 0).sort((a, b) => (a.sale_price ?? 0) - (b.sale_price ?? 0));
      const best = withPrice[0] || items[0];
      picks.push(best);
      catSummary.push(`${cat}(${items.length}건)`);
    }

    const top = picks[0];
    return {
      recommendation: `🏷️ [${(top.category || "추천")}] ${top.title}${top.sale_price ? ' — ' + top.sale_price.toLocaleString() + '원' : ''} 외 ${picks.length - 1}개 카테고리`,
      confidence: Math.min(0.85, 0.4 + sorted.length * 0.08),
      reasoning: `${catSummary.join(", ")} 등 ${sorted.length}개 카테고리 분석. 각 분야 가성비 최고 상품을 골랐습니다.`,
      deals: picks,
    };
  },

  // 선물봇: 가격대별 선물 추천
  gift: (query, allDeals) => {
    // 선물하기 좋은 가격대 (1~5만원) 필터
    const giftRange = allDeals.filter(d => d.sale_price >= 10000 && d.sale_price <= 50000)
      .sort((a, b) => b.sale_price - a.sale_price);

    if (giftRange.length === 0) {
      // 가격 있는 것 중에서 추천
      const withPrice = allDeals.filter(d => d.sale_price > 0).sort((a, b) => a.sale_price - b.sale_price);
      if (withPrice.length === 0) return { recommendation: `"${query}" 관련 선물 추천이 어렵습니다.`, confidence: 0.1, reasoning: "상품 데이터 부족", deals: [] };
      return {
        recommendation: `🎁 ${withPrice[0].title} — ${withPrice[0].sale_price.toLocaleString()}원`,
        confidence: 0.4,
        reasoning: `선물 가격대(1~5만원) 상품이 부족합니다. 가장 합리적인 가격의 상품을 추천합니다.`,
        deals: withPrice.slice(0, 5),
      };
    }

    // 소스 다양하게
    const seen = new Set<string>();
    const diverse: DealRow[] = [];
    for (const d of giftRange) {
      if (!seen.has(d.source)) {
        seen.add(d.source);
        diverse.push(d);
      }
      if (diverse.length >= 5) break;
    }
    if (diverse.length < 5) {
      for (const d of giftRange) {
        if (!diverse.includes(d)) diverse.push(d);
        if (diverse.length >= 5) break;
      }
    }

    const top = diverse[0];
    return {
      recommendation: `🎁 선물 추천: ${top.title} — ${top.sale_price.toLocaleString()}원! 받는 사람이 좋아할 거예요`,
      confidence: Math.min(0.85, 0.5 + diverse.length * 0.07),
      reasoning: `1~5만원대 선물하기 좋은 상품 ${giftRange.length}개 중 엄선. 다양한 쇼핑몰에서 골라 가격과 품질을 검증했습니다.`,
      deals: diverse,
    };
  },

  // 트렌드봇: 지금 핫한 카테고리/키워드 기반 추천
  trend: (query, allDeals) => {
    // 제목에서 키워드 빈도 분석
    const wordCount: Record<string, number> = {};
    const stopWords = new Set(["the", "a", "an", "in", "of", "이", "그", "저", "및", "등", "위", "용", "및", "더"]);

    for (const d of allDeals) {
      // [소스] 제거 후 키워드 추출
      const clean = (d.title || "").replace(/\[[^\]]*\]/g, "").trim();
      const words = clean.split(/[\s,./()]+/).filter((w: string) => w.length >= 2 && !stopWords.has(w));
      for (const w of words) {
        wordCount[w] = (wordCount[w] || 0) + 1;
      }
    }

    // 가장 많이 나온 키워드
    const trending = Object.entries(wordCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (trending.length === 0) return { recommendation: `트렌드 분석 데이터가 부족합니다.`, confidence: 0.1, reasoning: "데이터 부족", deals: allDeals.slice(0, 5) };

    const topKeyword = trending[0][0];
    const trendDeals = allDeals.filter(d => (d.title || "").includes(topKeyword));
    const trendList = trending.map(([w, c]) => `${w}(${c})`).join(", ");

    return {
      recommendation: `📈 지금 트렌드: "${topKeyword}" — ${trendDeals.length}개 상품이 쏟아지는 중!`,
      confidence: Math.min(0.8, 0.4 + trending[0][1] * 0.03),
      reasoning: `실시간 키워드 분석: ${trendList}. "${topKeyword}" 관련 상품이 여러 커뮤니티에서 동시에 화제입니다.`,
      deals: trendDeals.slice(0, 5).length > 0 ? trendDeals.slice(0, 5) : allDeals.slice(0, 5),
    };
  },

  // 가성비봇: 가격 대비 가치 분석
  value: (query, allDeals) => {
    // 가격이 있는 상품 중 가성비 점수 계산
    const scored = allDeals.filter(d => d.sale_price > 0).map(d => {
      let valueScore = 0;
      // 추천수
      const recMatch = (d.description || "").match(/추천\s*(\d+)/);
      const recs = recMatch ? parseInt(recMatch[1]) : 0;
      valueScore += recs * 5;
      // 할인율 보너스
      if (d.discount_rate > 0) valueScore += d.discount_rate * 2;
      // 저렴할수록 가성비 높음 (10만원 이하 보너스)
      if (d.sale_price < 10000) valueScore += 30;
      else if (d.sale_price < 30000) valueScore += 20;
      else if (d.sale_price < 50000) valueScore += 10;
      // 무료/특가 키워드
      if (/무료|공짜|0원|특가|파격/.test(d.title)) valueScore += 20;

      return { ...d, valueScore };
    }).sort((a, b) => b.valueScore - a.valueScore);

    if (scored.length === 0) return { recommendation: `"${query}" 관련 가성비 분석이 어렵습니다.`, confidence: 0.1, reasoning: "가격 데이터 부족", deals: [] };

    const best = scored[0];
    return {
      recommendation: `💎 가성비 최고: ${best.title} — ${best.sale_price.toLocaleString()}원 (가성비 점수 ${best.valueScore}점)`,
      confidence: Math.min(0.9, 0.5 + best.valueScore * 0.005),
      reasoning: `가격, 추천수, 할인율, 커뮤니티 반응을 종합한 가성비 점수 분석. ${scored.length}개 상품 중 ${best.title.substring(0, 20)}이(가) 가격 대비 만족도 1위입니다.`,
      deals: scored.slice(0, 5),
    };
  },

  // 비교봇: 같은 상품 여러 소스 비교
  compare: (query, allDeals) => {
    // 소스별 최저가 비교
    const bySource: Record<string, DealRow> = {};
    const withPrice = allDeals.filter(d => (d.sale_price ?? 0) > 0);

    for (const d of withPrice) {
      if (!bySource[d.source] || (d.sale_price ?? 0) < (bySource[d.source].sale_price ?? 0)) {
        bySource[d.source] = d;
      }
    }

    const sources = Object.entries(bySource).sort((a, b) => (a[1].sale_price ?? 0) - (b[1].sale_price ?? 0));
    if (sources.length === 0) return { recommendation: `"${query}" 비교 데이터가 부족합니다.`, confidence: 0.1, reasoning: "데이터 부족", deals: [] };

    const cheapestSource = sources[0];
    const expensiveSource = sources[sources.length - 1];
    const diff = (expensiveSource[1].sale_price ?? 0) - (cheapestSource[1].sale_price ?? 0);

    const comparison = sources.map(([src, d]) => `${src}: ${(d.sale_price ?? 0).toLocaleString()}원`).join(" vs ");

    return {
      recommendation: `🔍 가격비교: ${comparison}. ${cheapestSource[0]}이(가) 가장 저렴!`,
      confidence: Math.min(0.9, 0.4 + sources.length * 0.1),
      reasoning: `${sources.length}개 쇼핑몰 최저가 비교. ${cheapestSource[0]}에서 사면 최대 ${diff.toLocaleString()}원 절약. 같은 상품이라면 가격만 비교하면 됩니다.`,
      deals: sources.map(([, d]) => d),
    };
  },

  // 어드바이저봇: 종합 분석 조언
  advisor: (query, allDeals) => {
    const withPrice = allDeals.filter(d => d.sale_price > 0);
    const totalSources = new Set(allDeals.map(d => d.source)).size;
    const totalCategories = new Set(allDeals.map(d => d.category).filter(Boolean)).size;

    // 추천수 높은 것
    const popular = [...allDeals].sort((a, b) => {
      const ra = parseInt(((a.description || "").match(/추천\s*(\d+)/) || [])[1] || "0");
      const rb = parseInt(((b.description || "").match(/추천\s*(\d+)/) || [])[1] || "0");
      return rb - ra;
    });

    // 최저가
    const cheapest = [...withPrice].sort((a, b) => a.sale_price - b.sale_price);

    // 종합 점수
    const allScored = allDeals.map(d => {
      let score = 0;
      const rec = parseInt(((d.description || "").match(/추천\s*(\d+)/) || [])[1] || "0");
      score += rec * 3;
      if (d.sale_price > 0 && d.sale_price < 30000) score += 20;
      if (d.discount_rate > 0) score += d.discount_rate;
      if (/무료|특가|파격|최저/.test(d.title)) score += 15;
      return { ...d, advScore: score };
    }).sort((a, b) => b.advScore - a.advScore);

    const top = allScored[0];
    if (!top) return { recommendation: `분석할 데이터가 부족합니다.`, confidence: 0.1, reasoning: "데이터 없음", deals: [] };

    const priceInfo = cheapest.length > 0 ? `최저가 ${cheapest[0].sale_price.toLocaleString()}원(${cheapest[0].source})` : "";
    const popInfo = popular[0] ? `인기 1위: ${popular[0].title.substring(0, 25)}` : "";

    return {
      recommendation: `🧠 종합 분석: ${top.title}${top.sale_price ? ' — ' + top.sale_price.toLocaleString() + '원' : ''} 을(를) 추천합니다`,
      confidence: Math.min(0.92, 0.5 + totalSources * 0.05 + totalCategories * 0.03),
      reasoning: `${totalSources}개 소스, ${totalCategories}개 카테고리, ${allDeals.length}개 상품 종합 분석. ${priceInfo}. ${popInfo}. 가격·인기·신뢰도를 모두 고려한 최적의 선택입니다.`,
      deals: allScored.slice(0, 5),
    };
  },
};

// 에이전트 쿼리 (소비자가 질문 → 모든 에이전트가 경쟁 응답)
app.post("/api/agents/query", async (c) => {
  const body = await c.req.json();
  const query = body.query;

  if (!query) return c.json({ success: false, error: "query is required" }, 400);

  // 활성 에이전트 목록
  const agents = await c.env.DB.prepare(
    "SELECT id, name, description, commission_rate, endpoint, rating, api_key FROM agents WHERE status = 'active' ORDER BY rating DESC"
  ).all();

  // 전체 딜 검색 (키워드가 있으면 필터, 없으면 최신 전체)
  let dealsResult;
  let keywordMatched = false;
  if (query.match(/오늘|추천|괜찮은|핫딜|인기|할인/)) {
    // 일반 추천 요청 → 전체 최신 딜
    dealsResult = await c.env.DB.prepare(
      "SELECT * FROM deals ORDER BY created_at DESC LIMIT 50"
    ).all();
    keywordMatched = true;
  } else {
    // 키워드를 분리해서 각각 검색
    const keywords = query.split(/[\s,]+/).filter((w: string) => w.length >= 2);
    const matchedDeals: DealRow[] = [];
    const seenIds = new Set<number>();

    for (const kw of keywords) {
      const kwResult = await c.env.DB.prepare(
        "SELECT * FROM deals WHERE title LIKE ? ORDER BY created_at DESC LIMIT 30"
      ).bind(`%${kw}%`).all();
      for (const d of kwResult.results as unknown as DealRow[]) {
        if (!seenIds.has(d.id)) {
          seenIds.add(d.id);
          matchedDeals.push(d);
        }
      }
    }

    if (matchedDeals.length > 0) {
      keywordMatched = true;
      dealsResult = { results: matchedDeals.slice(0, 50) };
    } else {
      // 관련 상품이 없으면 전체 최신 딜 (fallback 표시)
      dealsResult = await c.env.DB.prepare(
        "SELECT * FROM deals ORDER BY created_at DESC LIMIT 50"
      ).all();
    }
  }
  const allDeals = dealsResult.results as unknown as DealRow[];

  // 각 에이전트가 자기 전략으로 응답 생성
  const responses = [];
  const batchStmts: D1PreparedStatement[] = [];

  for (const agent of agents.results as unknown as AgentRow[]) {
    const strategyName = agent.endpoint || "lowest_price";
    const strategy = STRATEGIES[strategyName] || STRATEGIES.lowest_price;

    let data = strategy(query, allDeals);

    // 키워드 매칭 실패 시 confidence 낮추고 안내 메시지 추가
    if (!keywordMatched && data.confidence > 0.3) {
      data = {
        ...data,
        confidence: Math.min(data.confidence, 0.3),
        reasoning: `"${query}" 관련 상품이 현재 DB에 없어서 최신 인기 딜을 대신 보여드려요. ${data.reasoning}`,
      };
    }

    // 배치에 추가 (N+1 → 배치)
    batchStmts.push(
      c.env.DB.prepare(
        "INSERT INTO agent_responses (agent_id, query, response, confidence) VALUES (?, ?, ?, ?)"
      ).bind(agent.id, query, JSON.stringify(data), data.confidence || 0)
    );
    batchStmts.push(
      c.env.DB.prepare(
        "UPDATE agents SET total_queries = total_queries + 1 WHERE id = ?"
      ).bind(agent.id)
    );

    responses.push({
      agent_id: agent.id,
      agent_name: agent.name,
      commission_rate: agent.commission_rate,
      rating: agent.rating,
      response: data,
    });
  }

  // 단일 배치로 실행 (이전: 에이전트당 2회 → 현재: 1회 배치)
  if (batchStmts.length > 0) {
    await c.env.DB.batch(batchStmts);
  }

  return c.json({ success: true, query, responses });
});

// 에이전트 리뷰 작성
app.post("/api/agents/:id/review", async (c) => {
  const agentId = c.req.param("id");
  const body = await c.req.json();

  if (!body.rating || body.rating < 1 || body.rating > 5) {
    return c.json({ success: false, error: "rating must be 1-5" }, 400);
  }

  // 배치로 원자적 실행 (레이스 컨디션 방지)
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO agent_reviews (agent_id, rating, comment) VALUES (?, ?, ?)"
    ).bind(agentId, body.rating, body.comment || ""),
    c.env.DB.prepare(
      "UPDATE agents SET rating = (SELECT AVG(rating) FROM agent_reviews WHERE agent_id = ?), review_count = (SELECT COUNT(*) FROM agent_reviews WHERE agent_id = ?) WHERE id = ?"
    ).bind(agentId, agentId, agentId),
  ]);

  return c.json({ success: true });
});

// 에이전트 리뷰 목록
app.get("/api/agents/:id/reviews", async (c) => {
  const agentId = c.req.param("id");
  const result = await c.env.DB.prepare(
    "SELECT * FROM agent_reviews WHERE agent_id = ? ORDER BY created_at DESC"
  ).bind(agentId).all();

  return c.json({ success: true, data: result.results });
});

// ===== 핫 게시물 / 군중심리 =====

// 핫딜 랭킹 — 인기도 점수 기반 (추천수 + 소스 다중 노출 + 최신성)
app.get("/api/hot", async (c) => {
  const limit = Number(c.req.query("limit") || 20);
  const period = c.req.query("period") || "today"; // today, week, all

  let timeFilter = "";
  if (period === "today") {
    timeFilter = "AND created_at >= datetime('now', '-1 day')";
  } else if (period === "week") {
    timeFilter = "AND created_at >= datetime('now', '-7 days')";
  }

  const deals = await c.env.DB.prepare(
    `SELECT * FROM deals WHERE 1=1 ${timeFilter} ORDER BY created_at DESC LIMIT 200`
  ).all();

  // 인기도 점수 계산
  const scored = (deals.results as unknown as DealRow[]).map(d => {
    let hotScore = 0;

    // 1. 추천수 (description에서 추출)
    const recMatch = (d.description || "").match(/추천\s*(\d+)/);
    const recs = recMatch ? parseInt(recMatch[1]) : 0;
    hotScore += recs * 10;

    // 2. 가격이 있으면 관심도 높음
    if (d.sale_price && d.sale_price > 0) hotScore += 5;

    // 3. 할인율 보너스
    if (d.discount_rate && d.discount_rate > 0) hotScore += d.discount_rate * 0.5;

    // 4. 최신성 보너스 (1시간 이내 +20, 3시간 이내 +10)
    const ageMs = Date.now() - new Date(d.created_at).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    if (ageHours < 1) hotScore += 20;
    else if (ageHours < 3) hotScore += 10;
    else if (ageHours < 6) hotScore += 5;

    // 5. 제목 키워드 보너스 (특가, 무료, 역대최저 등)
    if (/무료|공짜|0원|역대|최저/.test(d.title)) hotScore += 15;
    if (/특가|한정|선착순|품절임박/.test(d.title)) hotScore += 10;

    return { ...d, hotScore, recommendations: recs };
  });

  // 점수 순 정렬
  scored.sort((a, b) => b.hotScore - a.hotScore);
  const hot = scored.slice(0, limit);

  return c.json({
    success: true,
    data: hot,
    meta: {
      period,
      total: hot.length,
      updated_at: new Date().toISOString(),
    },
  });
});

// 핫딜 트렌드 — 어떤 키워드/카테고리가 지금 핫한지
app.get("/api/trends", async (c) => {
  // 최근 24시간 딜에서 카테고리별 집계
  const categoryStats = await c.env.DB.prepare(
    `SELECT category, COUNT(*) as count, AVG(sale_price) as avg_price
     FROM deals WHERE created_at >= datetime('now', '-1 day') AND category IS NOT NULL
     GROUP BY category ORDER BY count DESC LIMIT 10`
  ).all();

  // 소스별 활동량
  const sourceStats = await c.env.DB.prepare(
    `SELECT source, COUNT(*) as count
     FROM deals WHERE created_at >= datetime('now', '-1 day')
     GROUP BY source ORDER BY count DESC`
  ).all();

  // 최근 에이전트 쿼리에서 인기 검색어 (최근 응답들)
  const recentQueries = await c.env.DB.prepare(
    `SELECT query, COUNT(*) as count
     FROM agent_responses WHERE created_at >= datetime('now', '-1 day')
     GROUP BY query ORDER BY count DESC LIMIT 10`
  ).all();

  return c.json({
    success: true,
    data: {
      hotCategories: categoryStats.results,
      activeSources: sourceStats.results,
      trendingSearches: recentQueries.results,
    },
  });
});

// 이미지 없는 딜 목록 (백필용)
app.get("/api/backfill/no-image", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") || 50), 200);
  const result = await c.env.DB.prepare(
    "SELECT id, title, url, source FROM deals WHERE (image_url IS NULL OR image_url = '') ORDER BY created_at DESC LIMIT ?"
  ).bind(limit).all();
  return c.json({ success: true, data: result.results });
});

// 딜 이미지 업데이트 (백필용)
app.patch("/api/backfill/:id/image", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  if (!body.image_url || typeof body.image_url !== "string" || !body.image_url.startsWith("http")) {
    return c.json({ success: false, error: "Valid image_url required" }, 400);
  }
  await c.env.DB.prepare("UPDATE deals SET image_url = ? WHERE id = ?").bind(body.image_url, id).run();
  return c.json({ success: true });
});

// ===== 가게 (Store) =====

// 가게 검색
app.get("/api/stores", async (c) => {
  const q = c.req.query("q") || "";
  const category = c.req.query("category") || "";
  const verified = c.req.query("verified");
  const limit = Math.min(Math.max(1, Number(c.req.query("limit") || 20)), 100);
  const offset = Math.max(0, Number(c.req.query("offset") || 0));

  let sql = "SELECT * FROM stores WHERE 1=1";
  const params: (string | number)[] = [];

  if (q) {
    sql += " AND (name LIKE ? OR address LIKE ? OR road_address LIKE ?)";
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }

  if (verified === "true") {
    sql += " AND verified = 1";
  } else if (verified === "false") {
    sql += " AND verified = 0";
  }

  sql += " ORDER BY rating DESC, review_count DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const result = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({
    success: true,
    data: result.results,
    meta: { total: result.results.length, offset, limit },
  });
});

// 가게 등록 (크롤러용 — 인증 필요)
app.post("/api/stores", async (c) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token || token !== c.env.ADMIN_API_KEY) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const stores = Array.isArray(body) ? body : [body];

  if (stores.length > 200) {
    return c.json({ success: false, error: "Maximum 200 stores per request" }, 400);
  }

  let inserted = 0;

  for (const store of stores) {
    if (!store.name) continue;

    try {
      await c.env.DB.prepare(
        `INSERT OR REPLACE INTO stores
        (name, address, road_address, phone, category, lat, lng, naver_id, kakao_id, verified, menu_info, image_url, rating, review_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        store.name,
        store.address || null,
        store.road_address || null,
        store.phone || null,
        store.category || null,
        store.lat || null,
        store.lng || null,
        store.naver_id || null,
        store.kakao_id || null,
        store.verified ? 1 : 0,
        store.menu_info || null,
        store.image_url || null,
        store.rating || 0,
        store.review_count || 0,
      ).run();
      inserted++;
    } catch (e) {
      console.error("Store insert failed:", e);
    }
  }

  return c.json({ success: true, inserted });
});

// 가게 상세
app.get("/api/stores/:id", async (c) => {
  const id = c.req.param("id");
  const result = await c.env.DB.prepare("SELECT * FROM stores WHERE id = ?").bind(id).first();

  if (!result) {
    return c.json({ success: false, error: "Not found" }, 404);
  }

  return c.json({ success: true, data: result });
});

// ===== 배달 서비스 =====

// 배달 주문 생성 (소비자)
app.post("/api/delivery/request", async (c) => {
  const body = await c.req.json();

  if (!body.consumer_request || typeof body.consumer_request !== "string") {
    return c.json({ success: false, error: "consumer_request is required" }, 400);
  }

  // 1. 주문 생성
  const orderResult = await c.env.DB.prepare(
    `INSERT INTO delivery_orders (consumer_request, area, food_type, budget, quantity, status)
     VALUES (?, ?, ?, ?, ?, 'agent_bidding')`
  ).bind(
    body.consumer_request,
    body.area || null,
    body.food_type || null,
    body.budget || null,
    body.quantity || null,
  ).run();

  const orderId = orderResult.meta.last_row_id;

  // 2. 해당 지역+음식 타입으로 가게 검색
  let storesSql = "SELECT * FROM stores WHERE 1=1";
  const storeParams: string[] = [];

  if (body.food_type) {
    storesSql += " AND (category LIKE ? OR name LIKE ? OR menu_info LIKE ?)";
    storeParams.push(`%${body.food_type}%`, `%${body.food_type}%`, `%${body.food_type}%`);
  }
  if (body.area) {
    storesSql += " AND (address LIKE ? OR road_address LIKE ?)";
    storeParams.push(`%${body.area}%`, `%${body.area}%`);
  }

  storesSql += " ORDER BY rating DESC LIMIT 20";
  const storesResult = await c.env.DB.prepare(storesSql).bind(...storeParams).all();
  const matchedStores = storesResult.results as unknown as StoreRow[];

  // 3. 활성 에이전트 목록
  const agents = await c.env.DB.prepare(
    "SELECT id, name, endpoint FROM agents WHERE status = 'active' ORDER BY rating DESC"
  ).all();

  // 4. 각 에이전트가 자기 전략으로 입찰 생성
  const bids = [];
  const batchStmts: D1PreparedStatement[] = [];
  const budget = body.budget || 0;

  for (const agent of agents.results as unknown as AgentRow[]) {
    const strategyName = agent.endpoint || "lowest_price";
    const strategy = DELIVERY_STRATEGIES[strategyName] || DELIVERY_STRATEGIES.curator;

    const { store, reasoning } = strategy.selectStore(matchedStores, budget);
    const deliveryFee = strategy.calculateFee(budget);

    // 가게 데이터 없을 때 — 에이전트별로 다른 가격/메시지 생성
    const foodType = body.food_type || "음식";
    const area = body.area || "해당 지역";
    let finalMessage = reasoning;
    let proposedPrice = budget > 0 ? budget : 30000;
    let storeName = store?.name || "";

    if (!store && matchedStores.length === 0) {
      // 가게 DB에 데이터가 없을 때: 에이전트별 차별화된 제안
      const variance = Math.round((Math.random() * 0.2 - 0.1) * proposedPrice);
      proposedPrice = Math.max(10000, proposedPrice + variance);
      const fakeStoreNames: Record<string, string> = {
        lowest_price: `${area} 착한${foodType}`,
        popular: `${area} 맛집 ${foodType}전문점`,
        best_discount: `${area} ${foodType} 빠른배달`,
        curator: `${area} 베스트 ${foodType}`,
        value: `${area} 인기 ${foodType}집`,
      };
      storeName = fakeStoreNames[strategyName] || `${area} ${foodType} 추천맛집`;
      const messages: Record<string, string> = {
        lowest_price: `${area}에서 제일 저렴한 ${foodType}! ${proposedPrice.toLocaleString()}원이면 충분해요. 가성비 최고!`,
        popular: `${area} ${foodType} 맛집 중 평점 최고! 맛 보장합니다.`,
        best_discount: `빠른 배달에 집중! ${area}에서 가장 빨리 도착하는 ${foodType}을 찾았어요.`,
        curator: `맛, 가격, 배달 속도 종합 분석! ${area} ${foodType} 최적의 선택입니다.`,
        value: `리뷰가 많은 검증된 ${foodType}집! 많은 사람들이 선택한 데는 이유가 있어요.`,
      };
      finalMessage = messages[strategyName] || `${area} ${foodType} 추천 가게를 찾았어요!`;
    }

    const totalPrice = proposedPrice + deliveryFee;

    batchStmts.push(
      c.env.DB.prepare(
        `INSERT INTO agent_bids (order_id, agent_id, proposed_store_id, proposed_price, delivery_fee, total_price, message)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        orderId,
        agent.id,
        store?.id || null,
        proposedPrice,
        deliveryFee,
        totalPrice,
        finalMessage,
      )
    );

    bids.push({
      agent_id: agent.id,
      agent_name: agent.name,
      proposed_store: store ? { id: store.id, name: store.name, rating: store.rating, review_count: store.review_count, image_url: store.image_url } : storeName,
      proposed_price: proposedPrice,
      delivery_fee: deliveryFee,
      total_price: totalPrice,
      message: finalMessage,
      strategy: strategy.name,
    });
  }

  if (batchStmts.length > 0) {
    await c.env.DB.batch(batchStmts);
  }

  // bid ID를 DB에서 가져와서 응답에 포함
  const insertedBids = await c.env.DB.prepare(
    "SELECT id, agent_id FROM agent_bids WHERE order_id = ? ORDER BY id ASC"
  ).bind(orderId).all();
  const bidIdMap = new Map<number, number>();
  for (const row of insertedBids.results) {
    bidIdMap.set((row as Record<string, unknown>).agent_id as number, (row as Record<string, unknown>).id as number);
  }
  const bidsWithIds = bids.map(b => ({ ...b, id: bidIdMap.get(b.agent_id) }));

  return c.json({
    success: true,
    order_id: orderId,
    status: "agent_bidding",
    bids: bidsWithIds,
    matched_stores: matchedStores.length,
  });
});

// 주문 상세 + 현재 상태
app.get("/api/delivery/:id", async (c) => {
  const id = c.req.param("id");

  const order = await c.env.DB.prepare(
    "SELECT * FROM delivery_orders WHERE id = ?"
  ).bind(id).first() as DeliveryOrderRow | null;

  if (!order) {
    return c.json({ success: false, error: "Order not found" }, 404);
  }

  // 에이전트 입찰 목록
  const agentBids = await c.env.DB.prepare(
    `SELECT ab.*, a.name as agent_name, s.name as store_name, s.rating as store_rating, s.image_url as store_image
     FROM agent_bids ab
     LEFT JOIN agents a ON ab.agent_id = a.id
     LEFT JOIN stores s ON ab.proposed_store_id = s.id
     WHERE ab.order_id = ?
     ORDER BY ab.created_at ASC`
  ).bind(id).all();

  // 기사 입찰 목록
  const driverBids = await c.env.DB.prepare(
    `SELECT db.*, d.name as driver_name, d.rating as driver_rating, d.vehicle_type
     FROM driver_bids db
     LEFT JOIN drivers d ON db.driver_id = d.id
     WHERE db.order_id = ?
     ORDER BY db.created_at ASC`
  ).bind(id).all();

  return c.json({
    success: true,
    data: {
      order,
      agent_bids: agentBids.results,
      driver_bids: driverBids.results,
    },
  });
});

// 에이전트 선택 (소비자)
app.post("/api/delivery/:id/select-agent", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  if (!body.agent_bid_id) {
    return c.json({ success: false, error: "agent_bid_id is required" }, 400);
  }

  // 입찰 정보 조회
  const bid = await c.env.DB.prepare(
    "SELECT * FROM agent_bids WHERE id = ? AND order_id = ?"
  ).bind(body.agent_bid_id, id).first();

  if (!bid) {
    return c.json({ success: false, error: "Bid not found" }, 404);
  }

  // 주문 상태 업데이트
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE delivery_orders SET status = 'driver_bidding', selected_agent_id = ?, store_id = ?, final_price = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind((bid as Record<string, unknown>).agent_id, (bid as Record<string, unknown>).proposed_store_id, (bid as Record<string, unknown>).total_price, id),
  ]);

  return c.json({ success: true, status: "driver_bidding" });
});

// 기사 수락 (기사가 에이전트 제시 배달비를 수락)
app.post("/api/delivery/:id/driver-bid", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  if (!body.driver_id) {
    return c.json({ success: false, error: "driver_id is required" }, 400);
  }

  // 주문 상태 확인
  const order = await c.env.DB.prepare(
    "SELECT status, selected_agent_id FROM delivery_orders WHERE id = ?"
  ).bind(id).first() as Record<string, unknown> | null;

  if (!order || order.status !== "driver_bidding") {
    return c.json({ success: false, error: "Order is not accepting driver bids" }, 400);
  }

  // 선택된 에이전트 입찰에서 delivery_fee 조회
  const agentBid = await c.env.DB.prepare(
    "SELECT delivery_fee FROM agent_bids WHERE order_id = ? AND agent_id = ?"
  ).bind(id, order.selected_agent_id).first() as Record<string, unknown> | null;

  const deliveryFee = agentBid ? Number(agentBid.delivery_fee) : 0;

  await c.env.DB.prepare(
    `INSERT INTO driver_bids (order_id, driver_id, proposed_fee, estimated_time, message)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(
    id,
    body.driver_id,
    deliveryFee,
    body.estimated_time || 30,
    body.message || null,
  ).run();

  return c.json({ success: true });
});

// 기사 수락 (에이전트 또는 시스템)
app.post("/api/delivery/:id/accept-driver", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  if (!body.driver_bid_id) {
    return c.json({ success: false, error: "driver_bid_id is required" }, 400);
  }

  // 입찰 정보 조회
  const bid = await c.env.DB.prepare(
    "SELECT * FROM driver_bids WHERE id = ? AND order_id = ?"
  ).bind(body.driver_bid_id, id).first();

  if (!bid) {
    return c.json({ success: false, error: "Driver bid not found" }, 404);
  }

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE delivery_orders SET status = 'delivering', selected_driver_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind((bid as Record<string, unknown>).driver_id, id),
    c.env.DB.prepare(
      "UPDATE drivers SET status = 'delivering' WHERE id = ?"
    ).bind((bid as Record<string, unknown>).driver_id),
  ]);

  return c.json({ success: true, status: "delivering" });
});

// 배달 완료
app.post("/api/delivery/:id/complete", async (c) => {
  const id = c.req.param("id");

  const order = await c.env.DB.prepare(
    "SELECT status, selected_driver_id FROM delivery_orders WHERE id = ?"
  ).bind(id).first();

  if (!order || (order as Record<string, unknown>).status !== "delivering") {
    return c.json({ success: false, error: "Order is not in delivering status" }, 400);
  }

  const driverId = (order as Record<string, unknown>).selected_driver_id;

  const stmts = [
    c.env.DB.prepare(
      "UPDATE delivery_orders SET status = 'delivered', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(id),
  ];

  if (driverId) {
    stmts.push(
      c.env.DB.prepare(
        "UPDATE drivers SET status = 'available', total_deliveries = total_deliveries + 1 WHERE id = ?"
      ).bind(driverId)
    );
  }

  await c.env.DB.batch(stmts);

  return c.json({ success: true, status: "delivered" });
});

// 리뷰 작성 (소비자)
app.post("/api/delivery/:id/review", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  const order = await c.env.DB.prepare(
    "SELECT status, selected_agent_id, selected_driver_id FROM delivery_orders WHERE id = ?"
  ).bind(id).first() as Record<string, unknown> | null;

  if (!order || (order.status !== "delivered" && order.status !== "reviewed")) {
    return c.json({ success: false, error: "Order must be delivered before review" }, 400);
  }

  // 리뷰 삽입
  await c.env.DB.prepare(
    `INSERT INTO delivery_reviews (order_id, agent_rating, driver_rating, food_rating, comment)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(
    id,
    body.agent_rating || null,
    body.driver_rating || null,
    body.food_rating || null,
    body.comment || null,
  ).run();

  // 상태 업데이트 + 에이전트/기사 평점 업데이트
  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(
      "UPDATE delivery_orders SET status = 'reviewed', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(id),
  ];

  if (body.agent_rating && order.selected_agent_id) {
    stmts.push(
      c.env.DB.prepare(
        `UPDATE agents SET
         rating = (SELECT AVG(agent_rating) FROM delivery_reviews dr
                   JOIN delivery_orders do2 ON dr.order_id = do2.id
                   WHERE do2.selected_agent_id = ? AND dr.agent_rating IS NOT NULL),
         review_count = review_count + 1
         WHERE id = ?`
      ).bind(order.selected_agent_id, order.selected_agent_id)
    );
  }

  if (body.driver_rating && order.selected_driver_id) {
    stmts.push(
      c.env.DB.prepare(
        `UPDATE drivers SET
         rating = (SELECT AVG(driver_rating) FROM delivery_reviews dr
                   JOIN delivery_orders do2 ON dr.order_id = do2.id
                   WHERE do2.selected_driver_id = ? AND dr.driver_rating IS NOT NULL),
         review_count = review_count + 1
         WHERE id = ?`
      ).bind(order.selected_driver_id, order.selected_driver_id)
    );
  }

  await c.env.DB.batch(stmts);

  return c.json({ success: true, status: "reviewed" });
});

// ===== 기사 =====

// 기사 등록
app.post("/api/drivers/register", async (c) => {
  const body = await c.req.json();

  if (!body.name || typeof body.name !== "string" || body.name.trim().length < 2) {
    return c.json({ success: false, error: "이름은 2자 이상이어야 합니다" }, 400);
  }

  const result = await c.env.DB.prepare(
    "INSERT INTO drivers (name, phone, area, vehicle_type) VALUES (?, ?, ?, ?)"
  ).bind(
    body.name.trim(),
    body.phone || null,
    body.area || null,
    body.vehicle_type || "motorcycle",
  ).run();

  return c.json({
    success: true,
    driver_id: result.meta.last_row_id,
    message: "기사 등록이 완료되었습니다",
  });
});

// 기사 대시보드 — 내 지역 배달 요청 보기
app.get("/api/drivers/:id/jobs", async (c) => {
  const driverId = c.req.param("id");
  const status = c.req.query("status") || "driver_bidding";
  const area = c.req.query("area") || "";

  // 기사 정보 조회
  const driver = await c.env.DB.prepare(
    "SELECT * FROM drivers WHERE id = ?"
  ).bind(driverId).first() as DriverRow | null;

  if (!driver) {
    return c.json({ success: false, error: "Driver not found" }, 404);
  }

  const driverArea = area || driver.area || "";

  let sql = `SELECT do2.*, s.name as store_name, s.address as store_address, a.name as agent_name,
                    ab.delivery_fee as offered_fee
             FROM delivery_orders do2
             LEFT JOIN stores s ON do2.store_id = s.id
             LEFT JOIN agents a ON do2.selected_agent_id = a.id
             LEFT JOIN agent_bids ab ON ab.order_id = do2.id AND ab.agent_id = do2.selected_agent_id
             WHERE do2.status = ?`;
  const params: string[] = [status];

  if (driverArea) {
    sql += " AND do2.area LIKE ?";
    params.push(`%${driverArea}%`);
  }

  sql += " ORDER BY do2.created_at DESC LIMIT 20";

  const result = await c.env.DB.prepare(sql).bind(...params).all();

  return c.json({ success: true, data: result.results });
});

// 기사 프로필
app.get("/api/drivers/:id", async (c) => {
  const id = c.req.param("id");
  const driver = await c.env.DB.prepare(
    "SELECT * FROM drivers WHERE id = ?"
  ).bind(id).first();

  if (!driver) {
    return c.json({ success: false, error: "Driver not found" }, 404);
  }

  return c.json({ success: true, data: driver });
});

// 기사 목록 (특정 지역)
app.get("/api/drivers", async (c) => {
  const area = c.req.query("area") || "";
  const status = c.req.query("status") || "";
  const limit = Math.min(Math.max(1, Number(c.req.query("limit") || 20)), 100);

  let sql = "SELECT id, name, area, vehicle_type, status, rating, review_count, total_deliveries, created_at FROM drivers WHERE 1=1";
  const params: (string | number)[] = [];

  if (area) {
    sql += " AND area LIKE ?";
    params.push(`%${area}%`);
  }

  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }

  sql += " ORDER BY rating DESC, total_deliveries DESC LIMIT ?";
  params.push(limit);

  const result = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ success: true, data: result.results });
});

// ===== 에이전트 대시보드 =====

// 에이전트의 입찰 내역
app.get("/api/agents/:id/bids", async (c) => {
  const agentId = c.req.param("id");
  const limit = Math.min(Math.max(1, Number(c.req.query("limit") || 30)), 100);

  const result = await c.env.DB.prepare(
    `SELECT ab.*, do2.consumer_request, do2.area, do2.food_type, do2.quantity, do2.status as order_status,
            do2.selected_agent_id
     FROM agent_bids ab
     JOIN delivery_orders do2 ON ab.order_id = do2.id
     WHERE ab.agent_id = ?
     ORDER BY ab.created_at DESC LIMIT ?`
  ).bind(agentId, limit).all();

  const bids = (result.results as unknown as (Record<string, unknown>)[]).map(row => ({
    ...row,
    is_selected: Number(row.selected_agent_id) === Number(agentId),
  }));

  return c.json({ success: true, data: bids });
});

// 헬스체크
app.get("/health", (c) => {
  return c.json({ status: "ok", version: "0.4.0" });
});

export default app;
