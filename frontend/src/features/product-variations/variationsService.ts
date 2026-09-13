import { apiFetch } from "../../services/apiClient.js";
import type { CreateVariationInput, ProductVariation, UpdateVariationInput } from "./types.js";

export function listVariations(token: string, productId: string): Promise<ProductVariation[]> {
  return apiFetch<ProductVariation[]>(`/api/products/${productId}/variations`, { token });
}

export function createVariation(
  token: string,
  productId: string,
  input: CreateVariationInput,
): Promise<ProductVariation> {
  return apiFetch<ProductVariation>(`/api/products/${productId}/variations`, {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export function updateVariation(
  token: string,
  productId: string,
  variationId: string,
  input: UpdateVariationInput,
): Promise<ProductVariation> {
  return apiFetch<ProductVariation>(
    `/api/products/${productId}/variations/${variationId}`,
    {
      method: "PATCH",
      token,
      body: JSON.stringify(input),
    },
  );
}
