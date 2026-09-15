import { apiFetch } from "../../services/apiClient.js";
import type {
  HistoryOrderDetail,
  HistoryStatusFilter,
  ListHistoryOrdersResult,
} from "./history.types.js";

export interface ListHistoryOrdersParams {
  search?: string;
  status?: HistoryStatusFilter;
  page?: number;
  pageSize?: number;
}

export function listHistoryOrders(
  token: string,
  params: ListHistoryOrdersParams = {},
): Promise<ListHistoryOrdersResult> {
  const query = new URLSearchParams();

  const trimmedSearch = params.search?.trim();
  if (trimmedSearch) {
    query.set("search", trimmedSearch);
  }
  if (params.status) {
    query.set("status", params.status);
  }
  if (params.page) {
    query.set("page", String(params.page));
  }
  if (params.pageSize) {
    query.set("pageSize", String(params.pageSize));
  }

  const queryString = query.toString();
  return apiFetch<ListHistoryOrdersResult>(
    `/api/history/orders${queryString ? `?${queryString}` : ""}`,
    { token },
  );
}

export function getHistoryOrderDetail(token: string, orderId: string): Promise<HistoryOrderDetail> {
  return apiFetch<HistoryOrderDetail>(`/api/history/orders/${orderId}`, { token });
}
