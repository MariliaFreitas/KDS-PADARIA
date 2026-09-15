import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { deliverItemHandler, listDeliveryOrdersHandler } from "./delivery.controller.js";

export const deliveryRouter = Router();

// Retirada/Entrega — módulo operacional separado do Caixa (que continua
// exclusivamente financeiro). Só CAIXA tem acesso nesta etapa: ADMIN não é
// concedido automaticamente, ao contrário dos outros módulos — decisão
// explícita da Etapa 14, não uma omissão.
deliveryRouter.use(authenticate, authorize("CAIXA"));

deliveryRouter.get("/orders", asyncHandler(listDeliveryOrdersHandler));
deliveryRouter.patch(
  "/orders/:orderId/items/:itemId/deliver",
  asyncHandler(deliverItemHandler),
);
