import { Hono } from "hono";
import type { Bindings, DealRow } from "../types";

const app = new Hono<{ Bindings: Bindings }>();

// 핫딜 랭킹 — 인기도 점수 기반
app.get("/api/hot", async (c) => {
  const limit = Number(c.req.query("limit") || 20);
  const period = c.req.query("period") || "today";

  let timeFilter = "";
  if (period === "today") {
    timeFilter = "AND created_at >= datetime('now', '-1 day')";
  } else if (period === "week") {
    timeFilter = "AND created_at >= datetime('now', '-7 days')";
  }

  const deals = await c.env.DB.prepare(
    `SELECT * FROM deals WHERE 1=1 ${timeFilter} ORDER BY created_at DESC LIMIT 200`
  ).all();

  const scored = (deals.results as unknown as DealRow[]).map(d => {
    let hotScore = 0;

    const recMatch = (d.description || "").match(/추천\s*(\d+)/);
    const recs = recMatch ? parseInt(recMatch[1]) : 0;
    hotScore += recs * 10;

    if (d.sale_price && d.sale_price > 0) hotScore += 5;
    if (d.discount_rate && d.discount_rate > 0) hotScore += d.discount_rate * 0.5;

    const ageMs = Date.now() - new Date(d.created_at).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    if (ageHours < 1) hotScore += 20;
    else if (ageHours < 3) hotScore += 10;
    else if (ageHours < 6) hotScore += 5;

    if (/무료|공짜|0원|역대|최저/.test(d.title)) hotScore += 15;
    if (/특가|한정|선착순|품절임박/.test(d.title)) hotScore += 10;

    return { ...d, hotScore, recommendations: recs };
  });

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

// 핫딜 트렌드
app.get("/api/trends", async (c) => {
  const categoryStats = await c.env.DB.prepare(
    `SELECT category, COUNT(*) as count, AVG(sale_price) as avg_price
     FROM deals WHERE created_at >= datetime('now', '-1 day') AND category IS NOT NULL
     GROUP BY category ORDER BY count DESC LIMIT 10`
  ).all();

  const sourceStats = await c.env.DB.prepare(
    `SELECT source, COUNT(*) as count
     FROM deals WHERE created_at >= datetime('now', '-1 day')
     GROUP BY source ORDER BY count DESC`
  ).all();

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

// 이미지 없는 딜 목록 (백필용 — 인증 필요)
app.get("/api/backfill/no-image", async (c) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token || token !== c.env.ADMIN_API_KEY) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }
  const limit = Math.min(Number(c.req.query("limit") || 50), 200);
  const result = await c.env.DB.prepare(
    "SELECT id, title, url, source FROM deals WHERE (image_url IS NULL OR image_url = '') ORDER BY created_at DESC LIMIT ?"
  ).bind(limit).all();
  return c.json({ success: true, data: result.results });
});

// 딜 이미지 업데이트 (백필용 — 인증 필요)
app.patch("/api/backfill/:id/image", async (c) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token || token !== c.env.ADMIN_API_KEY) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }
  const id = c.req.param("id");
  const body = await c.req.json();
  if (!body.image_url || typeof body.image_url !== "string" || !body.image_url.startsWith("http")) {
    return c.json({ success: false, error: "Valid image_url required" }, 400);
  }
  await c.env.DB.prepare("UPDATE deals SET image_url = ? WHERE id = ?").bind(body.image_url, id).run();
  return c.json({ success: true });
});

export default app;
