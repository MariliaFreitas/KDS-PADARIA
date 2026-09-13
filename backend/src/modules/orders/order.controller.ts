import type { Request, Response } from "express";
import { createOrderSchema } from "./order.types.js";
import * as orderService from "./order.service.js";

export async function createOrderHandler(req: Request, res: Response) {
  const input = createOrderSchema.parse(req.body);
  // authenticate + authorize garantem req.user aqui.
  const createdByUserId = req.user!.id;
  const order = await orderService.createOrder(input, createdByUserId);
  res.status(201).json(order);
}

export async function getOrderHandler(req: Request, res: Response) {
  const order = await orderService.getOrderById(req.params.orderId);
  res.json(order);
}
