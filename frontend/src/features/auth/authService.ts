import { apiFetch } from "../../services/apiClient.js";
import type { LoginResponse } from "./types.js";

export function login(username: string, password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}
