import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { getHistoryOrderDetailHandler, listHistoryOrdersHandler } from "./history.controller.js";

export const historyRouter = Router();

// Histórico — só CAIXA e ADMIN têm acesso (Etapa 15). ATENDENTE e PRODUCAO
// continuam sem acesso, igual aos demais módulos financeiros/operacionais
// que não são deles.
historyRouter.use(authenticate, authorize("CAIXA", "ADMIN"));

historyRouter.get("/orders", asyncHandler(listHistoryOrdersHandler));
historyRouter.get("/orders/:orderId", asyncHandler(getHistoryOrderDetailHandler));
