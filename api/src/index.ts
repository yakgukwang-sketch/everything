import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Bindings } from "./types";
import chatRoutes from "./routes/chat";
import dealRoutes from "./routes/deals";
import agentRoutes from "./routes/agents";
import discoveryRoutes from "./routes/discovery";
import storeRoutes from "./routes/stores";
import deliveryRoutes from "./routes/delivery";
import driverRoutes from "./routes/drivers";
import developerRoutes from "./routes/developers";

const app = new Hono<{ Bindings: Bindings }>();

app.use("/*", cors({
  origin: (origin) => {
    if (!origin) return "https://everything-a6h.pages.dev";
    if (origin === "https://everything-a6h.pages.dev") return origin;
    if (origin.endsWith(".everything-a6h.pages.dev")) return origin;
    if (origin === "http://localhost:3000") return origin;
    return "https://everything-a6h.pages.dev";
  },
  allowMethods: ["GET", "POST", "PATCH"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Mount route modules
app.route("/", chatRoutes);
app.route("/", dealRoutes);
app.route("/", agentRoutes);
app.route("/", discoveryRoutes);
app.route("/", storeRoutes);
app.route("/", deliveryRoutes);
app.route("/", driverRoutes);
app.route("/", developerRoutes);

// 헬스체크
app.get("/health", (c) => {
  return c.json({ status: "ok", version: "0.5.0" });
});

export default app;
