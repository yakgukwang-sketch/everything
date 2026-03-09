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

// 헬스체크
app.get("/health", (c) => {
  return c.json({ status: "ok", version: "0.2.0" });
});

export default app;
