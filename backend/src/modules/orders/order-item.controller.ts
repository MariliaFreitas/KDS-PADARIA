import type { Request, Response } from "express";
import { createOrderItemSchema } from "./order-item.types.js";
import * as orderItemService from "./order-item.service.js";

export async function addOrderItemHandler(req: Request, res: Response) {
  const input = createOrderItemSchema.parse(req.body);
  const item = await orderItemService.addOrderItem(req.params.orderId, input);
  res.status(201).json(item);
}
