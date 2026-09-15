import { apiFetch } from "../../services/apiClient.js";
import type { DeliveryOrder } from "./delivery.types.js";

export function listDeliveryOrders(token: string, search?: string): Promise<DeliveryOrder[]> {
  const trimmed = search?.trim();
  const query = trimmed ? `?search=${encodeURIComponent(trimmed)}` : "";
  return apiFetch<DeliveryOrder[]>(`/api/delivery/orders${query}`, { token });
}

export function deliverItem(token: string, orderId: string, itemId: string): Promise<unknown> {
  return apiFetch(`/api/delivery/orders/${orderId}/items/${itemId}/deliver`, {
    method: "PATCH",
    token,
  });
}
