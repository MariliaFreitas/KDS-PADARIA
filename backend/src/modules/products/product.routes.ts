import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import {
  createProductHandler,
  listProductsHandler,
  updateProductHandler,
} from "./product.controller.js";

export const productsRouter = Router();

// Etapa 5: cadastro de produtos — mesma decisão de arquitetura da Etapa 4:
// todas as rotas exigem autenticação e perfil ADMIN, sem hierarquia
// implícita entre perfis.
productsRouter.use(authenticate, authorize("ADMIN"));

productsRouter.get("/", asyncHandler(listProductsHandler));
productsRouter.post("/", asyncHandler(createProductHandler));
productsRouter.patch("/:id", asyncHandler(updateProductHandler));
