import { Hono } from "hono";
import type { Bindings } from "../types";

const app = new Hono<{ Bindings: Bindings }>();

function sanitizeUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return "";
}

// 할인 상품 목록
app.get("/api/deals", async (c) => {
  const query = c.req.query("q") || "";
  const source = c.req.query("source") || "";
  const category = c.req.query("category") || "";
  const sort = c.req.query("sort") || "latest";
  const limit = Math.min(Math.max(1, Number(c.req.query("limit") || 30)), 100);
  const offset = Math.max(0, Number(c.req.query("offset") || 0));

  let sql = "SELECT * FROM deals WHERE 1=1";
  const params: (string | number)[] = [];

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
  params.push(limit, offset);

  // 전체 건수 조회
  let countSql = "SELECT COUNT(*) as cnt FROM deals WHERE 1=1";
  const countParams: string[] = [];
  if (query) {
    countSql += " AND (title LIKE ? OR description LIKE ?)";
    countParams.push(`%${query}%`, `%${query}%`);
  }
  if (source) {
    countSql += " AND source = ?";
    countParams.push(source);
  }
  if (category) {
    countSql += " AND category = ?";
    countParams.push(category);
  }
  const countResult = await c.env.DB.prepare(countSql).bind(...countParams).first() as { cnt: number } | null;
  const total = countResult?.cnt || 0;

  const result = await c.env.DB.prepare(sql)
    .bind(...params)
    .all();

  return c.json({
    success: true,
    data: result.results,
    total,
    meta: { total, offset, limit },
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

app.post("/api/deals/submit", async (c) => {
  const body = await c.req.json();

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

export default app;
