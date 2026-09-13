import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import {
  createVariationHandler,
  listVariationsHandler,
  updateVariationHandler,
} from "./product-variation.controller.js";

// mergeParams: true é obrigatório aqui — este router é montado em
// /api/products/:productId/variations (ver app.ts) e precisa enxergar o
// :productId capturado pelo app.use pai em req.params.
export const productVariationsRouter = Router({ mergeParams: true });

// Etapa 6: cadastro de variações — mesma decisão de arquitetura das etapas
// anteriores: autenticação + perfil ADMIN, sem hierarquia implícita.
productVariationsRouter.use(authenticate, authorize("ADMIN"));

productVariationsRouter.get("/", asyncHandler(listVariationsHandler));
productVariationsRouter.post("/", asyncHandler(createVariationHandler));
productVariationsRouter.patch("/:variationId", asyncHandler(updateVariationHandler));
