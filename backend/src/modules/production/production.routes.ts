import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import {
  advanceItemHandler,
  getStationQueueHandler,
  listProductionStationsHandler,
} from "./production.controller.js";

export const productionRouter = Router();

// Fila de preparo por estação — só PRODUCAO e ADMIN têm acesso.
productionRouter.use(authenticate, authorize("PRODUCAO", "ADMIN"));

productionRouter.get("/stations", asyncHandler(listProductionStationsHandler));
productionRouter.get("/stations/:stationId/items", asyncHandler(getStationQueueHandler));
productionRouter.patch(
  "/stations/:stationId/items/:itemId/advance",
  asyncHandler(advanceItemHandler),
);
