import { Hono } from "hono";
import type { Bindings } from "../types";

const app = new Hono<{ Bindings: Bindings }>();

// 댓글 목록 조회
app.get("/api/comments", async (c) => {
  const source = c.req.query("source") || "";
  const postId = c.req.query("post_id") || "";
  const q = c.req.query("q") || "";
  const limit = Math.min(Math.max(1, Number(c.req.query("limit") || 50)), 200);
  const offset = Math.max(0, Number(c.req.query("offset") || 0));

  let sql = "SELECT * FROM comments WHERE 1=1";
  const params: (string | number)[] = [];

  if (source) {
    sql += " AND source = ?";
    params.push(source);
  }

  if (postId) {
    sql += " AND post_id = ?";
    params.push(postId);
  }

  if (q) {
    sql += " AND content LIKE ?";
    params.push(`%${q}%`);
  }

  sql += " ORDER BY crawled_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const result = await c.env.DB.prepare(sql).bind(...params).all();

  return c.json({
    success: true,
    data: result.results,
    meta: { limit, offset },
  });
});

// 댓글 업로드 (크롤러용 — 인증 필요)
app.post("/api/comments", async (c) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token || token !== c.env.ADMIN_API_KEY) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const comments = Array.isArray(body) ? body : [body];

  if (comments.length > 500) {
    return c.json({ success: false, error: "Maximum 500 comments per request" }, 400);
  }

  let inserted = 0;

  for (const cmt of comments) {
    if (!cmt.source || !cmt.post_id || !cmt.content) continue;

    try {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO comments
        (source, post_id, author, content, recommendations, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(
          cmt.source,
          cmt.post_id,
          cmt.author || null,
          cmt.content,
          cmt.recommendations || 0,
          cmt.created_at || null
        )
        .run();
      inserted++;
    } catch (e) {
      // UNIQUE 충돌은 무시
    }
  }

  return c.json({ success: true, inserted });
});

export default app;
