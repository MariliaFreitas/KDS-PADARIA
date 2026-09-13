import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { loginHandler } from "./auth.controller.js";

export const authRouter = Router();

authRouter.post("/login", asyncHandler(loginHandler));
