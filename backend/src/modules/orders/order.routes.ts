import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { createOrderHandler, getOrderHandler } from "./order.controller.js";
import { getCatalogHandler } from "./catalog.controller.js";
import { addOrderItemHandler } from "./order-item.controller.js";

export const ordersRouter = Router();

// Etapas 8/9: cabeçalho do pedido, catálogo operacional e inclusão de
// itens. Só ATENDENTE e ADMIN têm acesso — PRODUCAO e CAIXA não entram em
// nenhuma rota deste módulo.
ordersRouter.use(authenticate, authorize("ATENDENTE", "ADMIN"));

ordersRouter.post("/", asyncHandler(createOrderHandler));

// Rota estática: precisa vir ANTES de "/:orderId" para "catalog" não ser
// interpretado como um orderId.
ordersRouter.get("/catalog", asyncHandler(getCatalogHandler));

ordersRouter.get("/:orderId", asyncHandler(getOrderHandler));
ordersRouter.post("/:orderId/items", asyncHandler(addOrderItemHandler));
