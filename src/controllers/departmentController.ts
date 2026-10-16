import { Request, Response } from "express";
import { supabase } from "../config/supabase";
import { HttpError, pick, unwrap } from "../lib/http";

const FIELDS = ["departmentName", "departmentCode", "hodName", "status"];

export const list = async (_req: Request, res: Response) =>
  res.json(unwrap(await supabase.from("departments").select("*").order("departmentName")));

export const get = async (req: Request, res: Response) => {
  const d = unwrap(await supabase.from("departments").select("*").eq("id", req.params.id).maybeSingle());
  if (!d) throw new HttpError(404, "Department not found");
  if (req.user!.role !== "admin" && d.id !== req.user!.departmentId) throw new HttpError(403, "Access denied");
  res.json(d);
};

export const create = async (req: Request, res: Response) =>
  res.status(201).json(unwrap(await supabase.from("departments").insert(pick(req.body, FIELDS)).select().single()));

export const update = async (req: Request, res: Response) => {
  const d = unwrap(await supabase.from("departments").update(pick(req.body, FIELDS)).eq("id", req.params.id).select().maybeSingle());
  if (!d) throw new HttpError(404, "Department not found");
  res.json(d);
};

export const remove = async (req: Request, res: Response) => {
  unwrap(await supabase.from("departments").update({ status: false }).eq("id", req.params.id));
  res.json({ message: "Department deactivated" });
};
