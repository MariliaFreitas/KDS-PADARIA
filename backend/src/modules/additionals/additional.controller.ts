import type { Request, Response } from "express";
import { createAdditionalSchema, updateAdditionalSchema } from "./additional.types.js";
import * as additionalService from "./additional.service.js";

export async function listAdditionalsHandler(_req: Request, res: Response) {
  const additionals = await additionalService.listAdditionals();
  res.json(additionals);
}

export async function createAdditionalHandler(req: Request, res: Response) {
  const input = createAdditionalSchema.parse(req.body);
  const additional = await additionalService.createAdditional(input);
  res.status(201).json(additional);
}

export async function updateAdditionalHandler(req: Request, res: Response) {
  const input = updateAdditionalSchema.parse(req.body);
  const additional = await additionalService.updateAdditional(req.params.additionalId, input);
  res.json(additional);
}
