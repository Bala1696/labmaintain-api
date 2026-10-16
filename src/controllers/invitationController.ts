import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { supabase } from "../config/supabase";
import { HttpError, stripPassword, unwrap } from "../lib/http";
import { sendInvitationEmail } from "../services/emailService";

const EXPIRY_MS = 48 * 60 * 60 * 1000;

async function pendingInvite(token: string) {
  const inv = unwrap(await supabase.from("invitations").select("*, department:departments(departmentName)").eq("token", token).maybeSingle());
  if (!inv) throw new HttpError(404, "Invitation not found");
  if (inv.status !== "pending") throw new HttpError(410, `Invitation already ${inv.status}`);
  if (new Date() > new Date(inv.expiresAt)) {
    unwrap(await supabase.from("invitations").update({ status: "expired" }).eq("id", inv.id));
    throw new HttpError(410, "Invitation has expired");
  }
  return inv;
}

export const validate = async (req: Request, res: Response) => {
  const inv = await pendingInvite(req.params.token);
  res.json({ email: inv.email, role: inv.role, department: inv.department?.departmentName ?? null });
};

export const completeRegistration = async (req: Request, res: Response) => {
  const inv = await pendingInvite(req.params.token);
  const { name, mobile, password } = req.body;
  if (!name || !password || String(password).length < 6) throw new HttpError(400, "Name and a password of at least 6 characters are required");

  // Role + department come ONLY from the invitation row, never from the request body.
  const user = unwrap(await supabase.from("users").insert({
    name, mobile, email: inv.email.toLowerCase(), password: await bcrypt.hash(password, 10),
    role: inv.role, departmentId: inv.departmentId,
  }).select().single());

  // Conditional update guards against two simultaneous redemptions of the same token.
  unwrap(await supabase.from("invitations").update({ status: "accepted" }).eq("id", inv.id).eq("status", "pending"));
  res.status(201).json({ message: "Account created successfully", user: stripPassword(user) });
};

export const create = async (req: Request, res: Response) => {
  const u = req.user!;
  const { email, role } = req.body;
  if (!email || !["hod", "technician"].includes(role)) throw new HttpError(400, "email and role (hod|technician) are required");
  if (u.role === "hod" && role !== "technician") throw new HttpError(403, "HODs can only invite technicians");

  const departmentId = u.role === "admin" ? req.body.departmentId : u.departmentId;
  if (!departmentId) throw new HttpError(400, "departmentId is required");

  const token = uuid();
  const inv = unwrap(await supabase.from("invitations").insert({
    email: String(email).toLowerCase().trim(), role, departmentId, token,
    expiresAt: new Date(Date.now() + EXPIRY_MS).toISOString(), invitedBy: u.id,
  }).select("*, department:departments(departmentName)").single());

  await sendInvitationEmail({ to: inv.email, role, departmentName: inv.department?.departmentName, token });
  res.status(201).json(inv);
};

export const list = async (req: Request, res: Response) => {
  let q = supabase.from("invitations").select("*, department:departments(departmentName)").order("createdAt", { ascending: false });
  if (req.user!.role !== "admin") q = q.eq("departmentId", req.user!.departmentId);
  const rows = unwrap(await q) as any[];
  // Tokens are bearer secrets; the list view never needs them.
  res.json(rows.map(({ token, ...rest }) => rest));
};

export const resend = async (req: Request, res: Response) => {
  const inv = unwrap(await supabase.from("invitations").select("*, department:departments(departmentName)").eq("id", req.params.id).maybeSingle());
  if (!inv) throw new HttpError(404, "Invitation not found");
  if (req.user!.role !== "admin" && inv.departmentId !== req.user!.departmentId) throw new HttpError(403, "Access denied");
  if (inv.status === "accepted") throw new HttpError(409, "Invitation was already accepted");

  const updated = unwrap(await supabase.from("invitations")
    .update({ status: "pending", expiresAt: new Date(Date.now() + EXPIRY_MS).toISOString() })
    .eq("id", inv.id).select().single());
  await sendInvitationEmail({ to: inv.email, role: inv.role, departmentName: inv.department?.departmentName, token: inv.token });
  const { token, ...safe } = updated;
  res.json({ message: "Invitation resent", invite: safe });
};
