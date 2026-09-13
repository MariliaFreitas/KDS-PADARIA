import type { Request, Response } from "express";
import { loginSchema } from "./auth.types.js";
import * as authService from "./auth.service.js";

export async function loginHandler(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input);
  res.json(result);
}
