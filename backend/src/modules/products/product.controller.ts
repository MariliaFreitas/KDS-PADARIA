import type { Request, Response } from "express";
import { createProductSchema, updateProductSchema } from "./product.types.js";
import * as productService from "./product.service.js";

export async function listProductsHandler(_req: Request, res: Response) {
  const products = await productService.listProducts();
  res.json(products);
}

export async function createProductHandler(req: Request, res: Response) {
  const input = createProductSchema.parse(req.body);
  const product = await productService.createProduct(input);
  res.status(201).json(product);
}

export async function updateProductHandler(req: Request, res: Response) {
  const input = updateProductSchema.parse(req.body);
  const product = await productService.updateProduct(req.params.id, input);
  res.json(product);
}
