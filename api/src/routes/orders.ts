import { Hono } from "hono";
import type { Bindings, OrderRow } from "../types";
import { sellerAuth } from "../auth";

const app = new Hono<{ Bindings: Bindings }>();

function generateOrderNumber(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORD-${date}-${rand}`;
}

// 주문 생성 (소비자가 호출 — 인증 불필요)
app.post("/api/orders", async (c) => {
  const body = await c.req.json();

  // 필수 필드 검증
  if (!body.product_id || !body.buyer_name || !body.buyer_phone) {
    return c.json({ success: false, error: "product_id, buyer_name, buyer_phone 필수" }, 400);
  }

  if (typeof body.buyer_name !== "string" || body.buyer_name.trim().length < 2) {
    return c.json({ success: false, error: "이름은 2자 이상이어야 합니다" }, 400);
  }

  const phoneRegex = /^01[0-9]-?\d{3,4}-?\d{4}$/;
  if (!phoneRegex.test(body.buyer_phone.replace(/\s/g, ""))) {
    return c.json({ success: false, error: "유효한 전화번호를 입력하세요" }, 400);
  }

  // 상품 조회
  const product = await c.env.DB.prepare(
    "SELECT sp.*, s.name as seller_name FROM seller_products sp JOIN sellers s ON sp.seller_id = s.id WHERE sp.id = ? AND sp.status = 'active'"
  ).bind(body.product_id).first<{ id: number; seller_id: number; price: number; stock: number; title: string; seller_name: string }>();

  if (!product) {
    return c.json({ success: false, error: "상품을 찾을 수 없거나 판매 중이 아닙니다" }, 404);
  }

  // 재고 확인
  if (product.stock === 0) {
    return c.json({ success: false, error: "품절된 상품입니다" }, 400);
  }

  // 에이전트 수수료 계산
  const agentFee = typeof body.agent_fee === "number" && body.agent_fee >= 0 ? body.agent_fee : 0;
  const totalPrice = product.price + agentFee;
  const orderNumber = generateOrderNumber();

  // 주문 생성
  const result = await c.env.DB.prepare(
    `INSERT INTO orders (order_number, product_id, seller_id, agent_id, buyer_name, buyer_phone, buyer_email, buyer_address, product_price, agent_fee, total_price, memo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    orderNumber,
    product.id,
    product.seller_id,
    body.agent_id || null,
    body.buyer_name.trim(),
    body.buyer_phone.trim(),
    body.buyer_email?.trim() || null,
    body.buyer_address?.trim() || null,
    product.price,
    agentFee,
    totalPrice,
    body.memo?.trim() || null,
  ).run();

  // 재고 차감 (무제한(-1)이 아닌 경우)
  if (product.stock > 0) {
    await c.env.DB.prepare(
      "UPDATE seller_products SET stock = stock - 1 WHERE id = ? AND stock > 0"
    ).bind(product.id).run();
  }

  return c.json({
    success: true,
    order: {
      order_number: orderNumber,
      product_title: product.title,
      seller_name: product.seller_name,
      product_price: product.price,
      agent_fee: agentFee,
      total_price: totalPrice,
      status: "pending",
    },
  });
});

// 주문 조회 (주문번호로 — 소비자용)
app.get("/api/orders/:orderNumber", async (c) => {
  const orderNumber = c.req.param("orderNumber");

  const order = await c.env.DB.prepare(
    `SELECT o.*, sp.title as product_title, sp.image_url as product_image, s.name as seller_name, s.business_name
     FROM orders o
     JOIN seller_products sp ON o.product_id = sp.id
     JOIN sellers s ON o.seller_id = s.id
     WHERE o.order_number = ?`
  ).bind(orderNumber).first();

  if (!order) {
    return c.json({ success: false, error: "주문을 찾을 수 없습니다" }, 404);
  }

  return c.json({ success: true, order });
});

// 셀러의 주문 목록 조회
app.get("/api/seller/orders", sellerAuth, async (c) => {
  const sellerId = c.get("seller_id" as never) as unknown as number;
  const status = c.req.query("status");

  let sql = `SELECT o.*, sp.title as product_title, sp.image_url as product_image
             FROM orders o JOIN seller_products sp ON o.product_id = sp.id
             WHERE o.seller_id = ?`;
  const params: (string | number)[] = [sellerId];

  if (status) {
    sql += " AND o.status = ?";
    params.push(status);
  }

  sql += " ORDER BY o.created_at DESC LIMIT 50";

  const result = await c.env.DB.prepare(sql).bind(...params).all();

  return c.json({ success: true, orders: result.results });
});

// 셀러가 주문 상태 업데이트
app.patch("/api/seller/orders/:id", sellerAuth, async (c) => {
  const sellerId = c.get("seller_id" as never) as unknown as number;
  const orderId = parseInt(c.req.param("id"));
  const body = await c.req.json();

  const validTransitions: Record<string, string[]> = {
    pending: ["confirmed", "cancelled"],
    paid: ["confirmed", "cancelled", "refunded"],
    confirmed: ["shipped", "cancelled"],
    shipped: ["delivered"],
    delivered: ["completed"],
  };

  const order = await c.env.DB.prepare(
    "SELECT id, status FROM orders WHERE id = ? AND seller_id = ?"
  ).bind(orderId, sellerId).first<{ id: number; status: string }>();

  if (!order) {
    return c.json({ success: false, error: "주문을 찾을 수 없습니다" }, 404);
  }

  const allowed = validTransitions[order.status];
  if (!allowed || !allowed.includes(body.status)) {
    return c.json({ success: false, error: `'${order.status}' → '${body.status}' 전환 불가` }, 400);
  }

  await c.env.DB.prepare(
    "UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(body.status, orderId).run();

  return c.json({ success: true, status: body.status });
});

export default app;
