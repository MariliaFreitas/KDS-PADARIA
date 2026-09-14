import { apiFetch } from "../../services/apiClient.js";
import type { CashierOrder } from "./cashier.types.js";

export function listCashierOrders(token: string, search?: string): Promise<CashierOrder[]> {
  const trimmed = search?.trim();
  const query = trimmed ? `?search=${encodeURIComponent(trimmed)}` : "";
  return apiFetch<CashierOrder[]>(`/api/cashier/orders${query}`, { token });
}

export function confirmPayment(token: string, orderId: string): Promise<unknown> {
  return apiFetch(`/api/cashier/orders/${orderId}/confirm-payment`, { method: "PATCH", token });
}
