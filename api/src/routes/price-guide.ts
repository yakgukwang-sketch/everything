import { Hono } from "hono";
import type { Bindings, PriceGuideRow } from "../types";

const app = new Hono<{ Bindings: Bindings }>();

// 가격 등급 판정
function rateDeal(guide: PriceGuideRow, price: number): string {
  if (price <= guide.price_godly) return "역대급 꿀딜";
  if (price <= guide.price_good) return "꿀딜";
  if (price <= guide.price_avg) return "괜찮음";
  if (price <= guide.price_normal) return "보통";
  if (price <= guide.price_expensive) return "비쌈";
  return "바가지";
}

// 상품 가격 가이드 조회
app.get("/api/price-guide", async (c) => {
  const q = c.req.query("q") || "";
  const category = c.req.query("category") || "";
  const limit = Math.min(Number(c.req.query("limit") || 50), 200);

  let sql = "SELECT * FROM price_guide WHERE 1=1";
  const params: (string | number)[] = [];

  if (q) {
    sql += " AND product LIKE ?";
    params.push(`%${q}%`);
  }
  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }

  sql += " ORDER BY deal_count DESC LIMIT ?";
  params.push(limit);

  const result = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ success: true, data: result.results });
});

// 가격 체크 - 이 상품 이 가격이면 어떤 등급?
app.get("/api/price-guide/check", async (c) => {
  const product = c.req.query("product") || "";
  const price = Number(c.req.query("price") || 0);

  if (!product || !price) {
    return c.json({ success: false, error: "product와 price 파라미터가 필요합니다" }, 400);
  }

  // 정확 매칭 → LIKE 매칭
  let guide = await c.env.DB.prepare(
    "SELECT * FROM price_guide WHERE product = ?"
  ).bind(product).first<PriceGuideRow>();

  if (!guide) {
    const result = await c.env.DB.prepare(
      "SELECT * FROM price_guide WHERE product LIKE ? ORDER BY deal_count DESC LIMIT 1"
    ).bind(`%${product}%`).first<PriceGuideRow>();
    guide = result;
  }

  if (!guide) {
    return c.json({ success: false, error: "해당 상품의 가격 가이드가 없습니다" }, 404);
  }

  const rating = rateDeal(guide, price);

  return c.json({
    success: true,
    product: guide.product,
    price,
    rating,
    tiers: {
      "역대급 꿀딜": `${guide.price_godly.toLocaleString()}원 이하`,
      "꿀딜": `~${guide.price_good.toLocaleString()}원`,
      "괜찮음": `~${guide.price_avg.toLocaleString()}원`,
      "보통": `~${guide.price_normal.toLocaleString()}원`,
      "비쌈": `~${guide.price_expensive.toLocaleString()}원`,
      "바가지": `${guide.price_expensive.toLocaleString()}원 이상`,
    },
    guide,
  });
});

// 가격 가이드 업로드 (크롤러용 - 인증 필요)
app.post("/api/price-guide", async (c) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token || token !== c.env.ADMIN_API_KEY) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const items = Array.isArray(body) ? body : [body];

  if (items.length > 500) {
    return c.json({ success: false, error: "Maximum 500 items per request" }, 400);
  }

  let inserted = 0;
  for (const item of items) {
    if (!item.product) continue;
    try {
      await c.env.DB.prepare(
        `INSERT OR REPLACE INTO price_guide
        (product, category, deal_count, price_avg, price_median, price_min, price_max,
         price_godly, price_good, price_normal, price_expensive,
         avg_rec, best_deal_title, best_deal_price, best_deal_rec, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(
        item.product,
        item.category || null,
        item.deal_count || 0,
        item.price_avg || 0,
        item.price_median || 0,
        item.price_min || 0,
        item.price_max || 0,
        item.price_godly || 0,
        item.price_good || 0,
        item.price_normal || 0,
        item.price_expensive || 0,
        item.avg_rec || 0,
        item.best_deal_title || null,
        item.best_deal_price || 0,
        item.best_deal_rec || 0,
      ).run();
      inserted++;
    } catch (e) {
      console.error("Price guide insert failed:", e);
    }
  }

  return c.json({ success: true, inserted });
});

export default app;
