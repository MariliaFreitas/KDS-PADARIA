import express from "express";
import cors from "cors";
import { authRouter } from "./modules/auth/auth.routes.js";
import { stationsRouter } from "./modules/stations/station.routes.js";
import { productsRouter } from "./modules/products/product.routes.js";
import { productVariationsRouter } from "./modules/product-variations/product-variation.routes.js";
import { additionalsRouter } from "./modules/additionals/additional.routes.js";
import { ordersRouter } from "./modules/orders/order.routes.js";
import { productionRouter } from "./modules/production/production.routes.js";
import { cashierRouter } from "./modules/cashier/cashier.routes.js";
import { deliveryRouter } from "./modules/delivery/delivery.routes.js";
import { historyRouter } from "./modules/history/history.routes.js";
import { realtimeRouter } from "./modules/realtime/realtime.routes.js";
import { notFoundHandler } from "./middlewares/notFoundHandler.js";
import { errorHandler } from "./middlewares/errorHandler.js";

export function createApp(corsOrigin: string) {
  const app = express();

  app.use(cors({ origin: corsOrigin }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "kds-padaria-backend" });
  });

  // Rotas da aplicação. Toda rota nova entra ACIMA do notFoundHandler.
  app.use("/api/auth", authRouter);
  app.use("/api/stations", stationsRouter);
  app.use("/api/products", productsRouter);
  app.use("/api/products/:productId/variations", productVariationsRouter);
  app.use("/api/additionals", additionalsRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/production", productionRouter);
  app.use("/api/cashier", cashierRouter);
  app.use("/api/delivery", deliveryRouter);
  app.use("/api/history", historyRouter);
  app.use("/api/realtime", realtimeRouter);

  // Os dois abaixo são sempre os últimos, nesta ordem.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
