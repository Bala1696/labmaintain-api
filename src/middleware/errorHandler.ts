import { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http";

export const notFound = (req: Request, res: Response) =>
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });

export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof HttpError ? err.status : err.status || (err.name === "MulterError" ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ message: err.message || "Internal server error" });
};
