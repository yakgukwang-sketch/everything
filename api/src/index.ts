import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("/*", cors());

// 할인 상품 목록
app.get("/api/deals", async (c) => {
  const query = c.req.query("q") || "";
  const source = c.req.query("source") || "";
  const category = c.req.query("category") || "";
  const sort = c.req.query("sort") || "latest";
  const limit = Number(c.req.query("limit") || 30);
  const offset = Number(c.req.query("offset") || 0);

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

// 할인 상품 등록 (크롤러용)
app.post("/api/deals", async (c) => {
  const body = await c.req.json();
  const deals = Array.isArray(body) ? body : [body];
  let inserted = 0;

  for (const deal of deals) {
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

// 에이전트 상세
app.get("/api/agents/:id", async (c) => {
  const id = c.req.param("id");
  const agent = await c.env.DB.prepare(
    "SELECT id, name, description, commission_rate, rating, review_count, total_queries, status, created_at FROM agents WHERE id = ?"
  ).bind(id).first();

  if (!agent) return c.json({ success: false, error: "Not found" }, 404);
  return c.json({ success: true, data: agent });
});

// 에이전트 등록
app.post("/api/agents/register", async (c) => {
  const body = await c.req.json();
  const apiKey = crypto.randomUUID();

  await c.env.DB.prepare(
    "INSERT INTO agents (name, description, commission_rate, endpoint, api_key) VALUES (?, ?, ?, ?, ?)"
  ).bind(
    body.name,
    body.description || "",
    body.commission_rate || 0,
    body.endpoint || "",
    apiKey
  ).run();

  return c.json({ success: true, api_key: apiKey, message: "에이전트가 등록되었습니다" });
});

// 에이전트 쿼리 (소비자가 질문 → 모든 에이전트에게 전달)
app.post("/api/agents/query", async (c) => {
  const body = await c.req.json();
  const query = body.query;

  if (!query) return c.json({ success: false, error: "query is required" }, 400);

  // 활성 에이전트 목록
  const agents = await c.env.DB.prepare(
    "SELECT id, name, description, commission_rate, endpoint, rating FROM agents WHERE status = 'active' ORDER BY rating DESC"
  ).all();

  // 내장 최저가 분석 (모든 에이전트의 기본 폴백)
  const dealsResult = await c.env.DB.prepare(
    "SELECT * FROM deals WHERE title LIKE ? ORDER BY sale_price ASC LIMIT 10"
  ).bind(`%${query}%`).all();
  const deals = dealsResult.results as any[];

  const withPrice = deals.filter((d: any) => d.sale_price > 0);
  const cheapest = withPrice.length > 0 ? withPrice[0] : null;
  const avgPrice = withPrice.length > 0
    ? Math.round(withPrice.reduce((s: number, d: any) => s + d.sale_price, 0) / withPrice.length)
    : 0;

  // 각 에이전트에게 쿼리 전달 시도
  const responses = [];
  for (const agent of agents.results as any[]) {
    let data: any = null;

    if (agent.endpoint) {
      try {
        const resp = await fetch(agent.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });
        data = await resp.json() as any;
      } catch (e) {
        // 외부 호출 실패 — 내장 로직 사용
      }
    }

    // 외부 호출 실패 시 내장 최저가 분석 사용
    if (!data) {
      const reasoning = cheapest
        ? `${withPrice.length}개 상품 분석. 평균가 ${avgPrice.toLocaleString()}원 대비 최저가 ${cheapest.sale_price.toLocaleString()}원 (${cheapest.source})`
        : "관련 상품을 찾지 못했습니다.";

      data = {
        recommendation: cheapest
          ? `[최저가] ${cheapest.title} — ${cheapest.sale_price.toLocaleString()}원`
          : `"${query}"에 대한 할인 상품을 찾지 못했습니다.`,
        confidence: cheapest ? Math.min(0.95, 0.5 + withPrice.length * 0.05) : 0.1,
        reasoning,
        deals: deals.slice(0, 5),
      };
    }

    // 응답 기록
    await c.env.DB.prepare(
      "INSERT INTO agent_responses (agent_id, query, response, confidence) VALUES (?, ?, ?, ?)"
    ).bind(agent.id, query, JSON.stringify(data), data.confidence || 0).run();

    // 쿼리 수 증가
    await c.env.DB.prepare(
      "UPDATE agents SET total_queries = total_queries + 1 WHERE id = ?"
    ).bind(agent.id).run();

    responses.push({
      agent_id: agent.id,
      agent_name: agent.name,
      commission_rate: agent.commission_rate,
      rating: agent.rating,
      response: data,
    });
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

  await c.env.DB.prepare(
    "INSERT INTO agent_reviews (agent_id, rating, comment) VALUES (?, ?, ?)"
  ).bind(agentId, body.rating, body.comment || "").run();

  // 평균 평점 업데이트
  const stats = await c.env.DB.prepare(
    "SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM agent_reviews WHERE agent_id = ?"
  ).bind(agentId).first() as any;

  await c.env.DB.prepare(
    "UPDATE agents SET rating = ?, review_count = ? WHERE id = ?"
  ).bind(stats.avg_rating, stats.count, agentId).run();

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

// 헬스체크
app.get("/health", (c) => {
  return c.json({ status: "ok", version: "0.2.0" });
});

export default app;
