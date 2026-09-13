import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { createOrderHandler, getOrderHandler } from "./order.controller.js";

export const ordersRouter = Router();

// Etapa 8: criação do cabeçalho do pedido. Só ATENDENTE e ADMIN podem criar
// ou abrir um pedido nesta etapa — PRODUCAO e CAIXA não têm acesso ainda.
ordersRouter.use(authenticate, authorize("ATENDENTE", "ADMIN"));

ordersRouter.post("/", asyncHandler(createOrderHandler));
ordersRouter.get("/:orderId", asyncHandler(getOrderHandler));
