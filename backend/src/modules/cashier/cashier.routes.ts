import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { confirmPaymentHandler, listCashierOrdersHandler } from "./cashier.controller.js";

export const cashierRouter = Router();

// Caixa — só CAIXA e ADMIN têm acesso.
cashierRouter.use(authenticate, authorize("CAIXA", "ADMIN"));

cashierRouter.get("/orders", asyncHandler(listCashierOrdersHandler));
cashierRouter.patch("/orders/:orderId/confirm-payment", asyncHandler(confirmPaymentHandler));
