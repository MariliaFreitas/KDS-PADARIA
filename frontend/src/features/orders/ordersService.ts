import { apiFetch } from "../../services/apiClient.js";
import type { CreateOrderInput, Order, OrderWithItems } from "./types.js";

export function createOrder(token: string, input: CreateOrderInput): Promise<Order> {
  return apiFetch<Order>("/api/orders", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export function getOrder(token: string, orderId: string): Promise<OrderWithItems> {
  return apiFetch<OrderWithItems>(`/api/orders/${orderId}`, { token });
}
