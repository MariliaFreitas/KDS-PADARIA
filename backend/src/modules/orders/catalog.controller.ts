import type { Request, Response } from "express";
import * as catalogService from "./catalog.service.js";

export async function getCatalogHandler(_req: Request, res: Response) {
  const catalog = await catalogService.getCatalog();
  res.json(catalog);
}
