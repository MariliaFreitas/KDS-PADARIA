import type { Request, Response } from "express";
import { listDeliveryOrdersQuerySchema } from "./delivery.types.js";
import * as deliveryService from "./delivery.service.js";

export async function listDeliveryOrdersHandler(req: Request, res: Response) {
  const { search } = listDeliveryOrdersQuerySchema.parse(req.query);
  const orders = await deliveryService.listPendingDeliveryOrders(search);
  res.json(orders);
}

export async function deliverItemHandler(req: Request, res: Response) {
  // authenticate + authorize garantem req.user aqui.
  const userId = req.user!.id;
  const item = await deliveryService.deliverItem(req.params.orderId, req.params.itemId, userId);
  res.json(item);
}
