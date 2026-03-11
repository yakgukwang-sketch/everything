import { Hono } from "hono";
import type { Bindings, AgentRow, StoreRow, DeliveryOrderRow, DriverRow } from "../types";
import { DELIVERY_STRATEGIES } from "../strategies/delivery";

const app = new Hono<{ Bindings: Bindings }>();

// 배달 주문 생성 (소비자)
app.post("/api/delivery/request", async (c) => {
  const body = await c.req.json();

  if (!body.consumer_request || typeof body.consumer_request !== "string") {
    return c.json({ success: false, error: "consumer_request is required" }, 400);
  }

  // 1. 주문 생성
  const orderResult = await c.env.DB.prepare(
    `INSERT INTO delivery_orders (consumer_request, area, food_type, budget, quantity, status)
     VALUES (?, ?, ?, ?, ?, 'agent_bidding')`
  ).bind(
    body.consumer_request,
    body.area || null,
    body.food_type || null,
    body.budget || null,
    body.quantity || null,
  ).run();

  const orderId = orderResult.meta.last_row_id;

  // 2. 해당 지역+음식 타입으로 가게 검색
  let storesSql = "SELECT * FROM stores WHERE 1=1";
  const storeParams: string[] = [];

  if (body.food_type) {
    storesSql += " AND (category LIKE ? OR name LIKE ? OR menu_info LIKE ?)";
    storeParams.push(`%${body.food_type}%`, `%${body.food_type}%`, `%${body.food_type}%`);
  }
  if (body.area) {
    storesSql += " AND (address LIKE ? OR road_address LIKE ?)";
    storeParams.push(`%${body.area}%`, `%${body.area}%`);
  }

  storesSql += " ORDER BY rating DESC LIMIT 20";
  const storesResult = await c.env.DB.prepare(storesSql).bind(...storeParams).all();
  const matchedStores = storesResult.results as unknown as StoreRow[];

  // 3. 활성 에이전트 목록
  const agents = await c.env.DB.prepare(
    "SELECT id, name, endpoint FROM agents WHERE status = 'active' ORDER BY rating DESC"
  ).all();

  // 4. 각 에이전트가 자기 전략으로 입찰 생성
  const bids = [];
  const batchStmts: D1PreparedStatement[] = [];
  const budget = body.budget || 0;

  for (const agent of agents.results as unknown as AgentRow[]) {
    const strategyName = agent.endpoint || "lowest_price";
    const strategy = DELIVERY_STRATEGIES[strategyName] || DELIVERY_STRATEGIES.curator;

    const result = strategy.evaluate(matchedStores, { budget, area: body.area || "", foodType: body.food_type || "" });
    const store = result.topPick;
    const deliveryFee = (result.meta?.deliveryFee as number) || 0;

    const finalMessage = result.recommendation;
    const proposedPrice = store ? (budget > 0 ? budget : 30000) : 0;

    // 가게를 찾지 못한 에이전트는 입찰하지 않음
    if (!store) {
      continue;
    }

    const totalPrice = proposedPrice + deliveryFee;

    batchStmts.push(
      c.env.DB.prepare(
        `INSERT INTO agent_bids (order_id, agent_id, proposed_store_id, proposed_price, delivery_fee, total_price, message)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        orderId,
        agent.id,
        store?.id || null,
        proposedPrice,
        deliveryFee,
        totalPrice,
        finalMessage,
      )
    );

    bids.push({
      agent_id: agent.id,
      agent_name: agent.name,
      proposed_store: { id: store.id, name: store.name, rating: store.rating, review_count: store.review_count, image_url: store.image_url },
      store_name: store.name,
      proposed_price: proposedPrice,
      delivery_fee: deliveryFee,
      total_price: totalPrice,
      message: finalMessage,
      strategy: strategy.name,
    });
  }

  if (batchStmts.length > 0) {
    await c.env.DB.batch(batchStmts);
  }

  // 입찰한 에이전트가 없는 경우
  if (bids.length === 0) {
    return c.json({
      success: true,
      order_id: orderId,
      status: "agent_bidding",
      bids: [],
      matched_stores: 0,
      message: `${body.area || "해당 지역"}에서 "${body.food_type || "음식"}" 관련 가게를 찾지 못했습니다. 다른 지역이나 음식으로 시도해보세요.`,
    });
  }

  // bid ID를 DB에서 가져와서 응답에 포함
  const insertedBids = await c.env.DB.prepare(
    "SELECT id, agent_id FROM agent_bids WHERE order_id = ? ORDER BY id ASC"
  ).bind(orderId).all();
  const bidIdMap = new Map<number, number>();
  for (const row of insertedBids.results) {
    bidIdMap.set((row as Record<string, unknown>).agent_id as number, (row as Record<string, unknown>).id as number);
  }
  const bidsWithIds = bids.map(b => ({ ...b, id: bidIdMap.get(b.agent_id) }));

  return c.json({
    success: true,
    order_id: orderId,
    status: "agent_bidding",
    bids: bidsWithIds,
    matched_stores: matchedStores.length,
  });
});

// 주문 상세 + 현재 상태
app.get("/api/delivery/:id", async (c) => {
  const id = c.req.param("id");

  const order = await c.env.DB.prepare(
    "SELECT * FROM delivery_orders WHERE id = ?"
  ).bind(id).first() as DeliveryOrderRow | null;

  if (!order) {
    return c.json({ success: false, error: "Order not found" }, 404);
  }

  const agentBids = await c.env.DB.prepare(
    `SELECT ab.*, a.name as agent_name, s.name as store_name, s.rating as store_rating, s.image_url as store_image
     FROM agent_bids ab
     LEFT JOIN agents a ON ab.agent_id = a.id
     LEFT JOIN stores s ON ab.proposed_store_id = s.id
     WHERE ab.order_id = ?
     ORDER BY ab.created_at ASC`
  ).bind(id).all();

  const driverBids = await c.env.DB.prepare(
    `SELECT db.*, d.name as driver_name, d.rating as driver_rating, d.vehicle_type
     FROM driver_bids db
     LEFT JOIN drivers d ON db.driver_id = d.id
     WHERE db.order_id = ?
     ORDER BY db.created_at ASC`
  ).bind(id).all();

  return c.json({
    success: true,
    data: {
      order,
      agent_bids: agentBids.results,
      driver_bids: driverBids.results,
    },
  });
});

// 에이전트 선택 (소비자)
app.post("/api/delivery/:id/select-agent", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  if (!body.agent_bid_id) {
    return c.json({ success: false, error: "agent_bid_id is required" }, 400);
  }

  const order = await c.env.DB.prepare(
    "SELECT status FROM delivery_orders WHERE id = ?"
  ).bind(id).first() as Record<string, unknown> | null;

  if (!order) {
    return c.json({ success: false, error: "Order not found" }, 404);
  }
  if (order.status !== "agent_bidding") {
    return c.json({ success: false, error: "이미 에이전트가 선택된 주문입니다" }, 400);
  }

  const bid = await c.env.DB.prepare(
    "SELECT * FROM agent_bids WHERE id = ? AND order_id = ?"
  ).bind(body.agent_bid_id, id).first();

  if (!bid) {
    return c.json({ success: false, error: "Bid not found" }, 404);
  }

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE delivery_orders SET status = 'driver_bidding', selected_agent_id = ?, store_id = ?, final_price = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind((bid as Record<string, unknown>).agent_id, (bid as Record<string, unknown>).proposed_store_id, (bid as Record<string, unknown>).total_price, id),
  ]);

  return c.json({ success: true, status: "driver_bidding" });
});

// 기사 수락 (기사가 에이전트 제시 배달비를 수락)
app.post("/api/delivery/:id/driver-bid", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  if (!body.driver_id) {
    return c.json({ success: false, error: "driver_id is required" }, 400);
  }

  const order = await c.env.DB.prepare(
    "SELECT status, selected_agent_id FROM delivery_orders WHERE id = ?"
  ).bind(id).first() as Record<string, unknown> | null;

  if (!order || order.status !== "driver_bidding") {
    return c.json({ success: false, error: "Order is not accepting driver bids" }, 400);
  }

  const agentBid = await c.env.DB.prepare(
    "SELECT delivery_fee FROM agent_bids WHERE order_id = ? AND agent_id = ?"
  ).bind(id, order.selected_agent_id).first() as Record<string, unknown> | null;

  const deliveryFee = agentBid ? Number(agentBid.delivery_fee) : 0;

  await c.env.DB.prepare(
    `INSERT INTO driver_bids (order_id, driver_id, proposed_fee, estimated_time, message)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(
    id,
    body.driver_id,
    deliveryFee,
    body.estimated_time || 30,
    body.message || null,
  ).run();

  return c.json({ success: true });
});

// 기사 수락 (에이전트 또는 시스템)
app.post("/api/delivery/:id/accept-driver", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  if (!body.driver_bid_id) {
    return c.json({ success: false, error: "driver_bid_id is required" }, 400);
  }

  // 주문 상태 확인
  const order = await c.env.DB.prepare(
    "SELECT status FROM delivery_orders WHERE id = ?"
  ).bind(id).first() as Record<string, unknown> | null;

  if (!order || order.status !== "driver_bidding") {
    return c.json({ success: false, error: "Order is not in driver_bidding status" }, 400);
  }

  const bid = await c.env.DB.prepare(
    "SELECT * FROM driver_bids WHERE id = ? AND order_id = ?"
  ).bind(body.driver_bid_id, id).first();

  if (!bid) {
    return c.json({ success: false, error: "Driver bid not found" }, 404);
  }

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE delivery_orders SET status = 'delivering', selected_driver_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind((bid as Record<string, unknown>).driver_id, id),
    c.env.DB.prepare(
      "UPDATE drivers SET status = 'delivering' WHERE id = ?"
    ).bind((bid as Record<string, unknown>).driver_id),
  ]);

  return c.json({ success: true, status: "delivering" });
});

// 배달 완료
app.post("/api/delivery/:id/complete", async (c) => {
  const id = c.req.param("id");

  const order = await c.env.DB.prepare(
    "SELECT status, selected_driver_id FROM delivery_orders WHERE id = ?"
  ).bind(id).first();

  if (!order || (order as Record<string, unknown>).status !== "delivering") {
    return c.json({ success: false, error: "Order is not in delivering status" }, 400);
  }

  const driverId = (order as Record<string, unknown>).selected_driver_id;

  const stmts = [
    c.env.DB.prepare(
      "UPDATE delivery_orders SET status = 'delivered', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(id),
  ];

  if (driverId) {
    stmts.push(
      c.env.DB.prepare(
        "UPDATE drivers SET status = 'available', total_deliveries = total_deliveries + 1 WHERE id = ?"
      ).bind(driverId)
    );
  }

  await c.env.DB.batch(stmts);

  return c.json({ success: true, status: "delivered" });
});

// 리뷰 작성 (소비자)
app.post("/api/delivery/:id/review", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  const order = await c.env.DB.prepare(
    "SELECT status, selected_agent_id, selected_driver_id FROM delivery_orders WHERE id = ?"
  ).bind(id).first() as Record<string, unknown> | null;

  if (!order || order.status !== "delivered") {
    return c.json({ success: false, error: order?.status === "reviewed" ? "이미 리뷰가 작성된 주문입니다" : "배달 완료 후 리뷰를 작성할 수 있습니다" }, 400);
  }

  await c.env.DB.prepare(
    `INSERT INTO delivery_reviews (order_id, agent_rating, driver_rating, food_rating, comment)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(
    id,
    body.agent_rating || null,
    body.driver_rating || null,
    body.food_rating || null,
    body.comment || null,
  ).run();

  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(
      "UPDATE delivery_orders SET status = 'reviewed', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(id),
  ];

  if (body.agent_rating && order.selected_agent_id) {
    stmts.push(
      c.env.DB.prepare(
        `UPDATE agents SET
         rating = (SELECT AVG(agent_rating) FROM delivery_reviews dr
                   JOIN delivery_orders do2 ON dr.order_id = do2.id
                   WHERE do2.selected_agent_id = ? AND dr.agent_rating IS NOT NULL),
         review_count = review_count + 1
         WHERE id = ?`
      ).bind(order.selected_agent_id, order.selected_agent_id)
    );
  }

  if (body.driver_rating && order.selected_driver_id) {
    stmts.push(
      c.env.DB.prepare(
        `UPDATE drivers SET
         rating = (SELECT AVG(driver_rating) FROM delivery_reviews dr
                   JOIN delivery_orders do2 ON dr.order_id = do2.id
                   WHERE do2.selected_driver_id = ? AND dr.driver_rating IS NOT NULL),
         review_count = review_count + 1
         WHERE id = ?`
      ).bind(order.selected_driver_id, order.selected_driver_id)
    );
  }

  await c.env.DB.batch(stmts);

  return c.json({ success: true, status: "reviewed" });
});

export default app;
