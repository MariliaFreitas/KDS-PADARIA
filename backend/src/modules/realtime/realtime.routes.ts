import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { streamEventsHandler } from "./realtime.controller.js";

export const realtimeRouter = Router();

// Qualquer usuário autenticado pode abrir o stream — a restrição por
// perfil acontece dentro do controller (filterEventForRole), não aqui.
realtimeRouter.use(authenticate);

realtimeRouter.get("/events", asyncHandler(streamEventsHandler));
