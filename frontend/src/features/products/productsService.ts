import { apiFetch } from "../../services/apiClient.js";
import type { Product, ProductInput, UpdateProductInput } from "./types.js";

export function listProducts(token: string): Promise<Product[]> {
  return apiFetch<Product[]>("/api/products", { token });
}

export function createProduct(token: string, input: ProductInput): Promise<Product> {
  return apiFetch<Product>("/api/products", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export function updateProduct(
  token: string,
  id: string,
  input: UpdateProductInput,
): Promise<Product> {
  return apiFetch<Product>(`/api/products/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(input),
  });
}
