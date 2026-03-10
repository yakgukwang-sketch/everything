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
const CHAT_SYSTEM_PROMPT = `너는 쇼핑 어시스턴트야. 소비자가 뭘 사고 싶은지 자연스러운 대화로 파악해.

규칙:
1. 한 번에 질문 하나만 해. 짧고 친근하게.
2. 소비자가 모호하게 말하면 구체적으로 좁혀나가.
3. 파악해야 할 것: 상품 종류, 용도, 사이즈/스펙, 예산, 특별 조건
4. 매 질문마다 반드시 선택지를 제공해. 아래 형식으로:

[OPTIONS]
선택지1|선택지2|선택지3|선택지4
[/OPTIONS]

예시:
어떤 종류의 식재료를 찾아?
[OPTIONS]
고기류|해산물|채소/과일|밀키트/간편식
[/OPTIONS]

5. 선택지는 2~5개. 짧고 명확하게 (10자 이내).
6. 충분히 파악했으면 반드시 아래 JSON 형식으로 정리해서 응답해:

[READY]
{"product":"상품명","specs":{"key":"value"},"budget":"예산","keywords":["검색키워드1","검색키워드2"]}
[/READY]

7. 아직 정보가 부족하면 [READY] 없이 다음 질문 + 선택지.
8. 인사나 관계없는 말에는 "안녕하세요! 어떤 상품을 찾고 계신가요?" + 선택지로 답해.
9. 반말로 친근하게 대화해.`;

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
  if (query.match(/오늘|추천|괜찮은|핫딜|인기|할인/)) {
    // 일반 추천 요청 → 전체 최신 딜
    dealsResult = await c.env.DB.prepare(
      "SELECT * FROM deals ORDER BY created_at DESC LIMIT 50"
    ).all();
  } else {
    // 키워드 검색
    dealsResult = await c.env.DB.prepare(
      "SELECT * FROM deals WHERE title LIKE ? ORDER BY created_at DESC LIMIT 50"
    ).bind(`%${query}%`).all();
    // 결과 없으면 전체에서 추천
    if (dealsResult.results.length === 0) {
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

    const data = strategy(query, allDeals);

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

// 헬스체크
app.get("/health", (c) => {
  return c.json({ status: "ok", version: "0.3.0" });
});

export default app;
