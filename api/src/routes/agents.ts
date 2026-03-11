import { Hono } from "hono";
import type { Bindings, DealRow, AgentRow } from "../types";
import { aiShoppingStrategy } from "../strategies/shopping";

const app = new Hono<{ Bindings: Bindings }>();

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

// 에이전트 랭킹 (리더보드)
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

// 에이전트 등록 (개발자 API key 인증)
app.post("/api/agents/register", async (c) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return c.json({ success: false, error: "API key가 필요합니다" }, 401);
  }

  // 개발자 API key로 인증
  const developer = await c.env.DB.prepare(
    "SELECT id, name, status FROM developers WHERE api_key = ?"
  ).bind(token).first<{ id: number; name: string; status: string }>();

  if (!developer) {
    return c.json({ success: false, error: "유효하지 않은 API key입니다. 먼저 개발자 등록을 해주세요." }, 401);
  }
  if (developer.status !== "active") {
    return c.json({ success: false, error: "비활성화된 개발자 계정입니다" }, 403);
  }

  const body = await c.req.json();

  if (!body.name || typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 50) {
    return c.json({ success: false, error: "name은 2~50자 문자열이어야 합니다" }, 400);
  }
  if (body.commission_rate !== undefined && (body.commission_rate < 0 || body.commission_rate > 100)) {
    return c.json({ success: false, error: "commission_rate는 0~100 사이여야 합니다" }, 400);
  }

  const agentApiKey = crypto.randomUUID();

  await c.env.DB.prepare(
    "INSERT INTO agents (name, description, commission_rate, endpoint, api_key, developer_id) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(
    body.name.trim(),
    (body.description || "").substring(0, 500),
    body.commission_rate || 0,
    body.endpoint || "",
    agentApiKey,
    developer.id
  ).run();

  return c.json({ success: true, api_key: agentApiKey, message: `에이전트가 등록되었습니다 (개발자: ${developer.name})` });
});

// 에이전트 쿼리 (소비자가 질문 → 모든 에이전트가 경쟁 응답)
app.post("/api/agents/query", async (c) => {
  const body = await c.req.json();
  const query = body.query;

  if (!query) return c.json({ success: false, error: "query is required" }, 400);

  const agents = await c.env.DB.prepare(
    "SELECT id, name, description, commission_rate, endpoint, rating FROM agents WHERE status = 'active' ORDER BY rating DESC"
  ).all();

  let dealsResult;
  let keywordMatched = false;
  if (query.match(/오늘|추천|괜찮은|핫딜|인기|할인/)) {
    dealsResult = await c.env.DB.prepare(
      "SELECT * FROM deals ORDER BY created_at DESC LIMIT 50"
    ).all();
    keywordMatched = true;
  } else {
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
      dealsResult = await c.env.DB.prepare(
        "SELECT * FROM deals ORDER BY created_at DESC LIMIT 50"
      ).all();
    }
  }
  const allDeals = dealsResult.results as unknown as DealRow[];

  const agentList = agents.results as unknown as AgentRow[];

  // 모든 에이전트를 Gemini 기반 AI로 병렬 호출
  const aiResults = await Promise.all(
    agentList.map(async (agent) => {
      const endpoint = agent.endpoint || "lowest_price";
      const result = await aiShoppingStrategy(endpoint, query, allDeals, c.env);
      return { agent, result };
    })
  );

  const responses = [];
  const batchStmts: D1PreparedStatement[] = [];

  for (const { agent, result } of aiResults) {
    let data = {
      recommendation: result.recommendation,
      confidence: result.confidence,
      reasoning: result.reasoning,
      deals: result.items,
    };

    if (!keywordMatched && data.confidence > 0.3) {
      data = {
        ...data,
        confidence: Math.min(data.confidence, 0.3),
        reasoning: `"${query}" 관련 상품이 현재 DB에 없어서 최신 인기 딜을 대신 보여드려요. ${data.reasoning}`,
      };
    }

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

// 에이전트의 입찰 내역 (대시보드)
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

// 딜 헌터 에이전트 분석
app.post("/api/agent/analyze", async (c) => {
  try {
    const { query, deals, hotDeals, trends } = await c.req.json() as {
      query: string;
      deals: { title: string; sale_price: number; source: string; url: string; discount_rate: number }[];
      hotDeals: { title: string; sale_price: number; source: string; recommendations: number }[];
      trends: { query?: string; keyword?: string; count: number; avgPrice?: number; avg_price?: number }[];
    };

    if (!query) {
      return c.json({ success: false, error: "query required" }, 400);
    }

    const systemPrompt = `너는 "딜 헌터"라는 AI 쇼핑 어드바이저야. 사용자가 찾는 상품에 대해 수집된 데이터를 기반으로 간결하고 실용적인 추천을 해줘.

규칙:
- 반말로, 친근하게 말해
- 3-4문장으로 핵심 추천 (너무 길지 않게)
- 지금 사야 할지, 기다려야 할지 판단해줘
- 가격 언급 시 구체적 숫자 포함
- 특정 딜을 추천할 때는 제목을 그대로 언급해

응답 형식 (JSON):
{"recommendation": "추천 멘트", "buyAdvice": "buy_now | wait | neutral", "topDealIds": [0, 1]}

topDealIds는 deals 배열의 인덱스 (0부터). 가장 추천하는 딜 최대 3개.`;

    const userContent = `검색어: "${query}"

검색 결과 (${deals.length}건):
${deals.slice(0, 10).map((d, i) => `[${i}] ${d.title} - ${d.sale_price?.toLocaleString() || '가격미정'}원 (${d.source}, 할인${d.discount_rate || 0}%)`).join("\n")}

핫딜 관련 (${hotDeals.length}건):
${hotDeals.slice(0, 5).map(d => `- ${d.title} (추천 ${d.recommendations || 0})`).join("\n") || "없음"}

트렌드:
${trends.slice(0, 5).map(t => `- ${t.keyword || t.query || "?"}: ${t.count}건, 평균 ${(t.avgPrice || t.avg_price)?.toLocaleString() || '?'}원`).join("\n") || "없음"}

위 데이터를 분석해서 추천해줘.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${c.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userContent }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 512,
          },
        }),
      }
    );

    if (!res.ok) {
      return c.json({ success: false, error: `Gemini API HTTP ${res.status}` }, 502);
    }

    interface GeminiResponse {
      error?: { message: string };
      candidates?: { content: { parts: { text: string }[] } }[];
    }
    const data: GeminiResponse = await res.json();

    if (data.error) {
      return c.json({ success: false, error: data.error.message }, 502);
    }

    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return c.json({
          success: true,
          recommendation: parsed.recommendation || raw,
          buyAdvice: parsed.buyAdvice || "neutral",
          topDealIds: parsed.topDealIds || [],
        });
      } catch {
        // JSON 파싱 실패 시 raw text 사용
      }
    }

    return c.json({
      success: true,
      recommendation: raw,
      buyAdvice: "neutral",
      topDealIds: [],
    });
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

export default app;
