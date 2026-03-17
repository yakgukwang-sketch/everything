import { Hono } from "hono";
import type { Bindings, SellerRow } from "../types";
import { hashPassword, verifyPassword, createJWT, sellerAuth } from "../auth";

const app = new Hono<{ Bindings: Bindings }>();

// 셀러 회원가입
app.post("/api/sellers/register", async (c) => {
  const body = await c.req.json();

  // Validation
  if (!body.email || typeof body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return c.json({ success: false, error: "유효한 이메일을 입력하세요" }, 400);
  }
  if (!body.password || typeof body.password !== "string" || body.password.length < 8) {
    return c.json({ success: false, error: "비밀번호는 8자 이상이어야 합니다" }, 400);
  }
  if (!body.name || typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 50) {
    return c.json({ success: false, error: "이름은 2~50자여야 합니다" }, 400);
  }

  const email = body.email.trim().toLowerCase();

  const existing = await c.env.DB.prepare(
    "SELECT id FROM sellers WHERE email = ?"
  ).bind(email).first();

  if (existing) {
    return c.json({ success: false, error: "이미 가입된 이메일입니다" }, 409);
  }

  const passwordHash = await hashPassword(body.password);

  const result = await c.env.DB.prepare(
    "INSERT INTO sellers (email, password_hash, name, business_name, phone) VALUES (?, ?, ?, ?, ?)"
  ).bind(
    email,
    passwordHash,
    body.name.trim(),
    body.business_name?.trim() || null,
    body.phone?.trim() || null,
  ).run();

  const sellerId = result.meta.last_row_id as number;
  const token = await createJWT({ seller_id: sellerId, email }, c.env.JWT_SECRET);

  return c.json({
    success: true,
    token,
    seller: { id: sellerId, email, name: body.name.trim() },
  });
});

// 셀러 로그인
app.post("/api/sellers/login", async (c) => {
  const body = await c.req.json();

  if (!body.email || !body.password) {
    return c.json({ success: false, error: "이메일과 비밀번호를 입력하세요" }, 400);
  }

  const email = body.email.trim().toLowerCase();
  const seller = await c.env.DB.prepare(
    "SELECT * FROM sellers WHERE email = ?"
  ).bind(email).first<SellerRow>();

  if (!seller) {
    return c.json({ success: false, error: "이메일 또는 비밀번호가 일치하지 않습니다" }, 401);
  }

  const valid = await verifyPassword(body.password, seller.password_hash);
  if (!valid) {
    return c.json({ success: false, error: "이메일 또는 비밀번호가 일치하지 않습니다" }, 401);
  }

  if (seller.status !== "active") {
    return c.json({ success: false, error: "비활성화된 계정입니다" }, 403);
  }

  const token = await createJWT({ seller_id: seller.id, email }, c.env.JWT_SECRET);

  return c.json({
    success: true,
    token,
    seller: {
      id: seller.id,
      email: seller.email,
      name: seller.name,
      business_name: seller.business_name,
    },
  });
});

// 내 프로필 조회
app.get("/api/sellers/me", sellerAuth, async (c) => {
  const sellerId = c.get("seller_id" as never) as unknown as number;

  const seller = await c.env.DB.prepare(
    "SELECT id, email, name, business_name, phone, status, verified, created_at FROM sellers WHERE id = ?"
  ).bind(sellerId).first();

  if (!seller) {
    return c.json({ success: false, error: "셀러를 찾을 수 없습니다" }, 404);
  }

  return c.json({ success: true, seller });
});

// 프로필 수정
app.patch("/api/sellers/me", sellerAuth, async (c) => {
  const sellerId = c.get("seller_id" as never) as unknown as number;
  const body = await c.req.json();

  const updates: string[] = [];
  const params: (string | null)[] = [];

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length < 2) {
      return c.json({ success: false, error: "이름은 2자 이상이어야 합니다" }, 400);
    }
    updates.push("name = ?");
    params.push(body.name.trim());
  }
  if (body.business_name !== undefined) {
    updates.push("business_name = ?");
    params.push(body.business_name?.trim() || null);
  }
  if (body.phone !== undefined) {
    updates.push("phone = ?");
    params.push(body.phone?.trim() || null);
  }

  if (updates.length === 0) {
    return c.json({ success: false, error: "수정할 항목이 없습니다" }, 400);
  }

  params.push(sellerId as unknown as string);
  await c.env.DB.prepare(
    `UPDATE sellers SET ${updates.join(", ")} WHERE id = ?`
  ).bind(...params).run();

  return c.json({ success: true });
});

export default app;
