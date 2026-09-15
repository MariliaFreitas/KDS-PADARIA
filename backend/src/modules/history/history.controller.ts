import type { Request, Response } from "express";
import { listHistoryOrdersQuerySchema } from "./history.types.js";
import * as historyService from "./history.service.js";

export async function listHistoryOrdersHandler(req: Request, res: Response) {
  const query = listHistoryOrdersQuerySchema.parse(req.query);
  const result = await historyService.listHistoryOrders({
    search: query.search,
    status: query.status,
    from: query.from,
    to: query.to,
    page: query.page,
    pageSize: query.pageSize,
  });
  res.json(result);
}

export async function getHistoryOrderDetailHandler(req: Request, res: Response) {
  const order = await historyService.getHistoryOrderDetail(req.params.orderId);
  res.json(order);
}
