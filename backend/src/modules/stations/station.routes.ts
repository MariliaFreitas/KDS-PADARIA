import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import {
  createStationHandler,
  listStationsHandler,
  updateStationHandler,
} from "./station.controller.js";

export const stationsRouter = Router();

// Etapa 4: cadastro de estações — todas as rotas exigem autenticação e
// perfil ADMIN (sem hierarquia implícita, conforme decisão de arquitetura).
stationsRouter.use(authenticate, authorize("ADMIN"));

stationsRouter.get("/", asyncHandler(listStationsHandler));
stationsRouter.post("/", asyncHandler(createStationHandler));
stationsRouter.patch("/:id", asyncHandler(updateStationHandler));
