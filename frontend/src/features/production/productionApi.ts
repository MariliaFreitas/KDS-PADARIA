import { apiFetch } from "../../services/apiClient.js";
import type { ProductionItem, ProductionStation } from "./production.types.js";

export function listProductionStations(token: string): Promise<ProductionStation[]> {
  return apiFetch<ProductionStation[]>("/api/production/stations", { token });
}

export function getStationQueue(token: string, stationId: string): Promise<ProductionItem[]> {
  return apiFetch<ProductionItem[]>(`/api/production/stations/${stationId}/items`, { token });
}

export function advanceItem(
  token: string,
  stationId: string,
  itemId: string,
): Promise<ProductionItem> {
  return apiFetch<ProductionItem>(
    `/api/production/stations/${stationId}/items/${itemId}/advance`,
    { method: "PATCH", token },
  );
}
