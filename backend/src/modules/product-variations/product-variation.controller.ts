import type { Request, Response } from "express";
import { createVariationSchema, updateVariationSchema } from "./product-variation.types.js";
import * as variationService from "./product-variation.service.js";

export async function listVariationsHandler(req: Request, res: Response) {
  const variations = await variationService.listVariations(req.params.productId);
  res.json(variations);
}

export async function createVariationHandler(req: Request, res: Response) {
  const input = createVariationSchema.parse(req.body);
  const variation = await variationService.createVariation(req.params.productId, input);
  res.status(201).json(variation);
}

export async function updateVariationHandler(req: Request, res: Response) {
  const input = updateVariationSchema.parse(req.body);
  const variation = await variationService.updateVariation(
    req.params.productId,
    req.params.variationId,
    input,
  );
  res.json(variation);
}
