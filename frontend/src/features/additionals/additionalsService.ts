import { apiFetch } from "../../services/apiClient.js";
import type { Additional, CreateAdditionalInput, UpdateAdditionalInput } from "./types.js";

export function listAdditionals(token: string): Promise<Additional[]> {
  return apiFetch<Additional[]>("/api/additionals", { token });
}

export function createAdditional(
  token: string,
  input: CreateAdditionalInput,
): Promise<Additional> {
  return apiFetch<Additional>("/api/additionals", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export function updateAdditional(
  token: string,
  id: string,
  input: UpdateAdditionalInput,
): Promise<Additional> {
  return apiFetch<Additional>(`/api/additionals/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(input),
  });
}
