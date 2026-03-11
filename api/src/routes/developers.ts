import { Hono } from "hono";
import type { Bindings } from "../types";

const app = new Hono<{ Bindings: Bindings }>();

// 개발자 회원가입 → API key 발급
app.post("/api/developers/register", async (c) => {
  const body = await c.req.json();

  if (!body.name || typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 50) {
    return c.json({ success: false, error: "이름은 2~50자여야 합니다" }, 400);
  }
  if (!body.email || typeof body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return c.json({ success: false, error: "유효한 이메일을 입력하세요" }, 400);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM developers WHERE email = ?"
  ).bind(body.email.trim().toLowerCase()).first();

  if (existing) {
    return c.json({ success: false, error: "이미 가입된 이메일입니다" }, 409);
  }

  const apiKey = `ev_${crypto.randomUUID().replace(/-/g, "")}`;

  await c.env.DB.prepare(
    "INSERT INTO developers (name, email, api_key) VALUES (?, ?, ?)"
  ).bind(body.name.trim(), body.email.trim().toLowerCase(), apiKey).run();

  return c.json({
    success: true,
    api_key: apiKey,
    message: `${body.name.trim()}님, 가입 완료! API key를 안전하게 보관하세요.`,
  });
});

export default app;
