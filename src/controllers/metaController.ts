import { Request, Response } from "express";
import { supabase } from "../config/supabase";
import { unwrap } from "../lib/http";

export const departments = async (_req: Request, res: Response) =>
  res.json(unwrap(await supabase.from("departments").select("id, departmentName, departmentCode").eq("status", true).order("departmentName")));

export const labRooms = async (req: Request, res: Response) => {
  let q = supabase.from("lab_rooms").select("id, labName, labCode").eq("status", true).order("labName");
  if (req.user!.role !== "admin") q = q.eq("departmentId", req.user!.departmentId);
  res.json(unwrap(await q));
};

export const technicians = async (req: Request, res: Response) => {
  let q = supabase.from("users").select("id, name, email").eq("role", "technician").eq("status", true).order("name");
  if (req.user!.role !== "admin") q = q.eq("departmentId", req.user!.departmentId);
  res.json(unwrap(await q));
};
