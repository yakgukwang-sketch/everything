import { Hono } from "hono";
import type { Bindings } from "../types";

const app = new Hono<{ Bindings: Bindings }>();

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

  // 전체 건수 조회
  let countSql = "SELECT COUNT(*) as cnt FROM stores WHERE 1=1";
  const countParams: (string | number)[] = [];
  if (q) {
    countSql += " AND (name LIKE ? OR address LIKE ? OR road_address LIKE ?)";
    countParams.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (category) {
    countSql += " AND category = ?";
    countParams.push(category);
  }
  if (verified === "true") {
    countSql += " AND verified = 1";
  } else if (verified === "false") {
    countSql += " AND verified = 0";
  }
  const countResult = await c.env.DB.prepare(countSql).bind(...countParams).first() as { cnt: number } | null;
  const total = countResult?.cnt || 0;

  sql += " ORDER BY rating DESC, review_count DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const result = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({
    success: true,
    data: result.results,
    meta: { total, offset, limit },
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

export default app;
