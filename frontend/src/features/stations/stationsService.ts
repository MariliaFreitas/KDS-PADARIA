import { apiFetch } from "../../services/apiClient.js";
import type { CreateStationInput, Station, UpdateStationInput } from "./types.js";

export function listStations(token: string): Promise<Station[]> {
  return apiFetch<Station[]>("/api/stations", { token });
}

export function createStation(token: string, input: CreateStationInput): Promise<Station> {
  return apiFetch<Station>("/api/stations", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export function updateStation(
  token: string,
  id: string,
  input: UpdateStationInput,
): Promise<Station> {
  return apiFetch<Station>(`/api/stations/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(input),
  });
}
