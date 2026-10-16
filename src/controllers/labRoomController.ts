import { Request, Response } from "express";
import { supabase } from "../config/supabase";
import { HttpError, pick, unwrap } from "../lib/http";
import { uploadImage } from "../services/storage";

const FIELDS = ["labName", "labCode", "roomNumber", "floor", "status"];

async function load(req: Request) {
  const room = unwrap(await supabase.from("lab_rooms").select("*, department:departments(*)").eq("id", req.params.id).maybeSingle());
  if (!room) throw new HttpError(404, "Lab room not found");
  if (req.user!.role !== "admin" && room.departmentId !== req.user!.departmentId) {
    throw new HttpError(403, "Access denied for this department");
  }
  return room;
}

export const list = async (req: Request, res: Response) => {
  let q = supabase.from("lab_rooms").select("*, department:departments(*)").order("labName");
  if (req.user!.role !== "admin") q = q.eq("departmentId", req.user!.departmentId);
  res.json(unwrap(await q));
};

export const get = async (req: Request, res: Response) => res.json(await load(req));

export const create = async (req: Request, res: Response) => {
  const row: Record<string, unknown> = pick(req.body, FIELDS);
  row.departmentId = req.user!.role === "admin" ? req.body.departmentId : req.user!.departmentId;
  if (!row.departmentId) throw new HttpError(400, "departmentId is required");
  if (req.file) row.labImage = await uploadImage(req.file, "labs");
  res.status(201).json(unwrap(await supabase.from("lab_rooms").insert(row).select().single()));
};

export const update = async (req: Request, res: Response) => {
  await load(req);
  const patch: Record<string, unknown> = pick(req.body, FIELDS);
  if (req.file) patch.labImage = await uploadImage(req.file, "labs");
  res.json(unwrap(await supabase.from("lab_rooms").update(patch).eq("id", req.params.id).select().single()));
};

export const remove = async (req: Request, res: Response) => {
  await load(req);
  unwrap(await supabase.from("lab_rooms").delete().eq("id", req.params.id));
  res.json({ message: "Lab room deleted" });
};
