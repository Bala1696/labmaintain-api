import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../config/supabase";
import { HttpError, pick, stripPassword, unwrap } from "../lib/http";

const SELECT = "*, department:departments(id, departmentName), assignedLab:lab_rooms(id, labName)";

async function load(req: Request) {
  const user = unwrap(await supabase.from("users").select(SELECT).eq("id", req.params.id).maybeSingle());
  if (!user) throw new HttpError(404, "User not found");
  const me = req.user!;
  if (me.role !== "admin" && (user.departmentId !== me.departmentId || user.role === "admin")) throw new HttpError(403, "Access denied");
  return user;
}

export const list = async (req: Request, res: Response) => {
  let q = supabase.from("users").select(SELECT).order("name");
  if (req.user!.role !== "admin") q = q.eq("departmentId", req.user!.departmentId).neq("role", "admin");
  res.json((unwrap(await q) as any[]).map(stripPassword));
};

export const get = async (req: Request, res: Response) => res.json(stripPassword(await load(req)));

export const create = async (req: Request, res: Response) => {
  const me = req.user!;
  const { name, email, password, mobile, role } = req.body;
  if (!name || !email || !password || !role) throw new HttpError(400, "name, email, password and role are required");
  if (me.role === "hod" && role !== "technician") throw new HttpError(403, "HODs can only create technicians");
  if (!["admin", "hod", "technician"].includes(role)) throw new HttpError(400, "Invalid role");

  const user = unwrap(await supabase.from("users").insert({
    name, mobile, role, email: String(email).toLowerCase().trim(), password: await bcrypt.hash(password, 10),
    departmentId: me.role === "admin" ? req.body.departmentId ?? null : me.departmentId,
  }).select().single());
  res.status(201).json(stripPassword(user));
};

export const update = async (req: Request, res: Response) => {
  await load(req);
  const me = req.user!;
  const allowed = me.role === "admin" ? ["name", "mobile", "role", "status", "departmentId"] : ["name", "mobile", "status"];
  const user = unwrap(await supabase.from("users").update(pick(req.body, allowed)).eq("id", req.params.id).select().single());
  res.json(stripPassword(user));
};

export const deactivate = async (req: Request, res: Response) => {
  if (Number(req.params.id) === req.user!.id) throw new HttpError(400, "You cannot deactivate your own account");
  await load(req);
  unwrap(await supabase.from("users").update({ status: false }).eq("id", req.params.id));
  res.json({ message: "User deactivated" });
};

export const assignLab = async (req: Request, res: Response) => {
  const user = await load(req);
  const lab = unwrap(await supabase.from("lab_rooms").select("id, departmentId").eq("id", req.body.labRoomId).maybeSingle());
  if (!lab) throw new HttpError(404, "Lab room not found");
  if (lab.departmentId !== user.departmentId) throw new HttpError(400, "Lab belongs to a different department than this user");
  res.json(stripPassword(unwrap(await supabase.from("users").update({ assignedLabId: lab.id }).eq("id", user.id).select().single())));
};

export const resetPassword = async (req: Request, res: Response) => {
  if (!req.body.newPassword || String(req.body.newPassword).length < 6) throw new HttpError(400, "newPassword must be at least 6 characters");
  unwrap(await supabase.from("users").update({ password: await bcrypt.hash(req.body.newPassword, 10) }).eq("id", req.params.id));
  res.json({ message: "Password reset successfully" });
};
