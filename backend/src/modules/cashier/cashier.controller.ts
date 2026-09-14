import type { Request, Response } from "express";
import { listCashierOrdersQuerySchema } from "./cashier.types.js";
import * as cashierService from "./cashier.service.js";

export async function listCashierOrdersHandler(req: Request, res: Response) {
  const { search } = listCashierOrdersQuerySchema.parse(req.query);
  const orders = await cashierService.listOpenOrders(search);
  res.json(orders);
}

export async function confirmPaymentHandler(req: Request, res: Response) {
  // authenticate + authorize garantem req.user aqui.
  const userId = req.user!.id;
  const order = await cashierService.confirmPayment(req.params.orderId, userId);
  res.json(order);
}
