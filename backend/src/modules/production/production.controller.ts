import type { Request, Response } from "express";
import * as productionService from "./production.service.js";

export async function listProductionStationsHandler(_req: Request, res: Response) {
  const stations = await productionService.listProductionStations();
  res.json(stations);
}

export async function getStationQueueHandler(req: Request, res: Response) {
  const items = await productionService.getStationQueue(req.params.stationId);
  res.json(items);
}

export async function advanceItemHandler(req: Request, res: Response) {
  // authenticate + authorize garantem req.user aqui.
  const userId = req.user!.id;
  const item = await productionService.advanceItem(req.params.stationId, req.params.itemId, userId);
  res.json(item);
}
