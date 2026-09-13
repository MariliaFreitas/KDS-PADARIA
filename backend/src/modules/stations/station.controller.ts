import type { Request, Response } from "express";
import { createStationSchema, updateStationSchema } from "./station.types.js";
import * as stationService from "./station.service.js";

export async function listStationsHandler(_req: Request, res: Response) {
  const stations = await stationService.listStations();
  res.json(stations);
}

export async function createStationHandler(req: Request, res: Response) {
  const input = createStationSchema.parse(req.body);
  const station = await stationService.createStation(input);
  res.status(201).json(station);
}

export async function updateStationHandler(req: Request, res: Response) {
  const input = updateStationSchema.parse(req.body);
  const station = await stationService.updateStation(req.params.id, input);
  res.json(station);
}
