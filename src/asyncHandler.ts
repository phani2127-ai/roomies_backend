import type { NextFunction, Request, RequestHandler, Response } from "express";

// Express 4 doesn't catch rejected promises from async handlers -- an
// unhandled rejection would otherwise hang the request instead of hitting
// the error middleware.
export function asyncHandler(handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}
