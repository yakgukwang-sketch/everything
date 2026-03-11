import { Hono } from "hono";
import type { Bindings, DriverRow } from "../types";

const app = new Hono<{ Bindings: Bindings }>();

// 기사 등록
app.post("/api/drivers/register", async (c) => {
  const body = await c.req.json();

  if (!body.name || typeof body.name !== "string" || body.name.trim().length < 2) {
    return c.json({ success: false, error: "이름은 2자 이상이어야 합니다" }, 400);
  }

  const result = await c.env.DB.prepare(
    "INSERT INTO drivers (name, phone, area, vehicle_type) VALUES (?, ?, ?, ?)"
  ).bind(
    body.name.trim(),
    body.phone || null,
    body.area || null,
    body.vehicle_type || "motorcycle",
  ).run();

  return c.json({
    success: true,
    driver_id: result.meta.last_row_id,
    message: "기사 등록이 완료되었습니다",
  });
});

// 기사 대시보드 — 내 지역 배달 요청 보기
app.get("/api/drivers/:id/jobs", async (c) => {
  const driverId = c.req.param("id");
  const status = c.req.query("status") || "driver_bidding";
  const area = c.req.query("area") || "";

  const driver = await c.env.DB.prepare(
    "SELECT * FROM drivers WHERE id = ?"
  ).bind(driverId).first() as DriverRow | null;

  if (!driver) {
    return c.json({ success: false, error: "Driver not found" }, 404);
  }

  const driverArea = area || driver.area || "";

  let sql = `SELECT do2.*, s.name as store_name, s.address as store_address, a.name as agent_name,
                    ab.delivery_fee as offered_fee
             FROM delivery_orders do2
             LEFT JOIN stores s ON do2.store_id = s.id
             LEFT JOIN agents a ON do2.selected_agent_id = a.id
             LEFT JOIN agent_bids ab ON ab.order_id = do2.id AND ab.agent_id = do2.selected_agent_id
             WHERE do2.status = ?`;
  const params: string[] = [status];

  if (driverArea) {
    sql += " AND do2.area LIKE ?";
    params.push(`%${driverArea}%`);
  }

  sql += " ORDER BY do2.created_at DESC LIMIT 20";

  const result = await c.env.DB.prepare(sql).bind(...params).all();

  return c.json({ success: true, data: result.results });
});

// 기사 프로필
app.get("/api/drivers/:id", async (c) => {
  const id = c.req.param("id");
  const driver = await c.env.DB.prepare(
    "SELECT * FROM drivers WHERE id = ?"
  ).bind(id).first();

  if (!driver) {
    return c.json({ success: false, error: "Driver not found" }, 404);
  }

  return c.json({ success: true, data: driver });
});

// 기사 목록 (특정 지역)
app.get("/api/drivers", async (c) => {
  const area = c.req.query("area") || "";
  const status = c.req.query("status") || "";
  const limit = Math.min(Math.max(1, Number(c.req.query("limit") || 20)), 100);

  let sql = "SELECT id, name, area, vehicle_type, status, rating, review_count, total_deliveries, created_at FROM drivers WHERE 1=1";
  const params: (string | number)[] = [];

  if (area) {
    sql += " AND area LIKE ?";
    params.push(`%${area}%`);
  }

  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }

  sql += " ORDER BY rating DESC, total_deliveries DESC LIMIT ?";
  params.push(limit);

  const result = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ success: true, data: result.results });
});

export default app;
