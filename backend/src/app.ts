import express from "express";
import cors from "cors";
import { authRouter } from "./modules/auth/auth.routes.js";
import { stationsRouter } from "./modules/stations/station.routes.js";
import { productsRouter } from "./modules/products/product.routes.js";
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

  // Os dois abaixo são sempre os últimos, nesta ordem.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
