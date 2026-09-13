import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import {
  createAdditionalHandler,
  listAdditionalsHandler,
  updateAdditionalHandler,
} from "./additional.controller.js";

export const additionalsRouter = Router();

// Etapa 7: cadastro de adicionais — mesma decisão de arquitetura das etapas
// anteriores: autenticação + perfil ADMIN, sem hierarquia implícita.
additionalsRouter.use(authenticate, authorize("ADMIN"));

additionalsRouter.get("/", asyncHandler(listAdditionalsHandler));
additionalsRouter.post("/", asyncHandler(createAdditionalHandler));
additionalsRouter.patch("/:additionalId", asyncHandler(updateAdditionalHandler));
