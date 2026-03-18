import { Hono } from "hono";
import type { Bindings } from "../types";
import { sellerAuth } from "../auth";

const app = new Hono<{ Bindings: Bindings }>();

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// 이미지 업로드 (셀러 전용)
app.post("/api/images/upload", sellerAuth, async (c) => {
  const contentType = c.req.header("Content-Type") || "";

  if (!contentType.startsWith("multipart/form-data")) {
    return c.json({ success: false, error: "multipart/form-data 필요" }, 400);
  }

  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return c.json({ success: false, error: "파일이 없습니다" }, 400);
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return c.json({ success: false, error: "jpg, png, webp, gif만 가능합니다" }, 400);
  }

  if (file.size > MAX_SIZE) {
    return c.json({ success: false, error: "5MB 이하만 가능합니다" }, 400);
  }

  const sellerId = c.get("seller_id" as never) as unknown as number;
  const ext = file.name.split(".").pop() || "jpg";
  const key = `seller/${sellerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  await c.env.IMAGES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  const imageUrl = `${new URL(c.req.url).origin}/api/images/${key}`;

  return c.json({ success: true, url: imageUrl, key });
});

// 이미지 서빙 (공개)
app.get("/api/images/*", async (c) => {
  const key = c.req.path.replace("/api/images/", "");

  if (!key) {
    return c.json({ success: false, error: "이미지 키가 없습니다" }, 400);
  }

  const object = await c.env.IMAGES.get(key);

  if (!object) {
    return c.json({ success: false, error: "이미지를 찾을 수 없습니다" }, 404);
  }

  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType || "image/jpeg");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  return new Response(object.body, { headers });
});

export default app;
