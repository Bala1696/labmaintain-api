import { NextFunction, Request, RequestHandler, Response } from "express";
import { PostgrestError } from "@supabase/supabase-js";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Express 4 does not catch rejected promises; this forwards them to the error handler. */
export const h =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

/** Unwrap a supabase-js result, mapping common Postgres errors to HTTP statuses. */
// Rows are untyped (no generated Database types), so results are `any` by design.
// For stricter typing, generate types with `supabase gen types typescript` and pass them to createClient<Database>().
export function unwrap(r: { data: any; error: PostgrestError | null }): any {
  if (r.error) throw mapPgError(r.error);
  return r.data;
}

export function mapPgError(e: { code?: string; message: string; details?: string }): HttpError {
  switch (e.code) {
    case "23505": return new HttpError(409, "A record with that unique value already exists");
    case "23503": return new HttpError(400, "Referenced record does not exist or is still in use");
    case "23502": return new HttpError(400, `Missing required field: ${e.message}`);
    case "22023": return new HttpError(400, e.message);
    case "P0002": return new HttpError(404, e.message);
    case "22P02": return new HttpError(400, "Invalid value supplied");
    default:      return new HttpError(500, e.message);
  }
}

export function pick<T extends object>(src: any, keys: string[]): Partial<T> {
  const out: any = {};
  for (const k of keys) if (src && src[k] !== undefined) out[k] = src[k];
  return out;
}

export const stripPassword = (u: any) => {
  const { password, ...rest } = u;
  return rest;
};
