import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Envolve um handler async para capturar rejeições de Promise
 * e repassá-las ao middleware de erro (Express 4 não faz isso sozinho).
 */
export function asyncHandler(
  handler: (req: Request, res: Response) => Promise<unknown>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}
