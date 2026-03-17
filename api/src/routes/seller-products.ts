import { Hono } from "hono";
import type { Bindings, SellerProductRow } from "../types";
import { sellerAuth } from "../auth";

const app = new Hono<{ Bindings: Bindings }>();

// ===== 셀러 전용 (JWT 인증) =====

// 상품 등록
app.post("/api/seller/products", sellerAuth, async (c) => {
  const sellerId = c.get("seller_id" as never) as unknown as number;
  const body = await c.req.json();

  if (!body.title || typeof body.title !== "string" || body.title.trim().length < 2) {
    return c.json({ success: false, error: "상품명은 2자 이상이어야 합니다" }, 400);
  }
  if (!body.price || typeof body.price !== "number" || body.price <= 0) {
    return c.json({ success: false, error: "유효한 가격을 입력하세요" }, 400);
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO seller_products (seller_id, title, description, price, original_price, image_url, category, stock)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    sellerId,
    body.title.trim(),
    body.description?.trim() || null,
    body.price,
    body.original_price || null,
    body.image_url?.trim() || null,
    body.category?.trim() || null,
    body.stock ?? -1,
  ).run();

  return c.json({
    success: true,
    product_id: result.meta.last_row_id,
  });
});

// 내 상품 목록
app.get("/api/seller/products", sellerAuth, async (c) => {
  const sellerId = c.get("seller_id" as never) as unknown as number;

  const products = await c.env.DB.prepare(
    "SELECT * FROM seller_products WHERE seller_id = ? ORDER BY created_at DESC"
  ).bind(sellerId).all<SellerProductRow>();

  return c.json({ success: true, products: products.results || [] });
});

// 상품 수정
app.patch("/api/seller/products/:id", sellerAuth, async (c) => {
  const sellerId = c.get("seller_id" as never) as unknown as number;
  const productId = parseInt(c.req.param("id"));
  const body = await c.req.json();

  // 소유권 확인
  const product = await c.env.DB.prepare(
    "SELECT id FROM seller_products WHERE id = ? AND seller_id = ?"
  ).bind(productId, sellerId).first();

  if (!product) {
    return c.json({ success: false, error: "상품을 찾을 수 없습니다" }, 404);
  }

  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  if (body.title !== undefined) {
    updates.push("title = ?");
    params.push(body.title.trim());
  }
  if (body.description !== undefined) {
    updates.push("description = ?");
    params.push(body.description?.trim() || null);
  }
  if (body.price !== undefined) {
    if (typeof body.price !== "number" || body.price <= 0) {
      return c.json({ success: false, error: "유효한 가격을 입력하세요" }, 400);
    }
    updates.push("price = ?");
    params.push(body.price);
  }
  if (body.original_price !== undefined) {
    updates.push("original_price = ?");
    params.push(body.original_price || null);
  }
  if (body.image_url !== undefined) {
    updates.push("image_url = ?");
    params.push(body.image_url?.trim() || null);
  }
  if (body.category !== undefined) {
    updates.push("category = ?");
    params.push(body.category?.trim() || null);
  }
  if (body.stock !== undefined) {
    updates.push("stock = ?");
    params.push(body.stock);
  }
  if (body.status !== undefined && ["active", "inactive"].includes(body.status)) {
    updates.push("status = ?");
    params.push(body.status);
  }

  if (updates.length === 0) {
    return c.json({ success: false, error: "수정할 항목이 없습니다" }, 400);
  }

  updates.push("updated_at = CURRENT_TIMESTAMP");
  params.push(productId, sellerId);

  await c.env.DB.prepare(
    `UPDATE seller_products SET ${updates.join(", ")} WHERE id = ? AND seller_id = ?`
  ).bind(...params).run();

  return c.json({ success: true });
});

// 상품 삭제 (soft delete)
app.delete("/api/seller/products/:id", sellerAuth, async (c) => {
  const sellerId = c.get("seller_id" as never) as unknown as number;
  const productId = parseInt(c.req.param("id"));

  const result = await c.env.DB.prepare(
    "UPDATE seller_products SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND seller_id = ?"
  ).bind(productId, sellerId).run();

  if (result.meta.changes === 0) {
    return c.json({ success: false, error: "상품을 찾을 수 없습니다" }, 404);
  }

  return c.json({ success: true });
});

// ===== 공개 API (에이전트/소비자용) =====

// 공개 상품 목록
app.get("/api/products", async (c) => {
  const category = c.req.query("category");
  const search = c.req.query("q");
  const limit = Math.min(parseInt(c.req.query("limit") || "20"), 100);
  const offset = parseInt(c.req.query("offset") || "0");

  const conditions: string[] = ["sp.status = 'active'"];
  const params: (string | number)[] = [];

  if (category) {
    conditions.push("sp.category = ?");
    params.push(category);
  }
  if (search) {
    conditions.push("sp.title LIKE ?");
    params.push(`%${search}%`);
  }

  const where = conditions.join(" AND ");
  params.push(limit, offset);

  const products = await c.env.DB.prepare(
    `SELECT sp.*, s.name as seller_name, s.business_name
     FROM seller_products sp
     JOIN sellers s ON s.id = sp.seller_id
     WHERE ${where}
     ORDER BY sp.created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(...params).all();

  return c.json({ success: true, products: products.results || [] });
});

// 공개 상품 상세
app.get("/api/products/:id", async (c) => {
  const productId = parseInt(c.req.param("id"));

  const product = await c.env.DB.prepare(
    `SELECT sp.*, s.name as seller_name, s.business_name
     FROM seller_products sp
     JOIN sellers s ON s.id = sp.seller_id
     WHERE sp.id = ? AND sp.status = 'active'`
  ).bind(productId).first();

  if (!product) {
    return c.json({ success: false, error: "상품을 찾을 수 없습니다" }, 404);
  }

  return c.json({ success: true, product });
});

export default app;
