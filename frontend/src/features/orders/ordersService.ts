import { apiFetch } from "../../services/apiClient.js";
import type {
  AddOrderItemInput,
  Catalog,
  CreateOrderInput,
  Order,
  OrderItem,
  OrderWithItems,
} from "./types.js";

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

export function getCatalog(token: string): Promise<Catalog> {
  return apiFetch<Catalog>("/api/orders/catalog", { token });
}

export function addOrderItem(
  token: string,
  orderId: string,
  input: AddOrderItemInput,
): Promise<OrderItem> {
  return apiFetch<OrderItem>(`/api/orders/${orderId}/items`, {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}
