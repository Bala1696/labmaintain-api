import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { JWT_EXPIRE, JWT_SECRET, supabase } from "../config/supabase";
import { HttpError, stripPassword, unwrap } from "../lib/http";

const sign = (id: number) => jwt.sign({ id }, JWT_SECRET, { expiresIn: JWT_EXPIRE } as jwt.SignOptions);

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) throw new HttpError(400, "Email and password are required");

  const user = unwrap(await supabase.from("users").select("*").eq("email", String(email).toLowerCase().trim()).maybeSingle());
  if (!user || !(await bcrypt.compare(password, user.password))) throw new HttpError(401, "Invalid email or password");
  if (!user.status) throw new HttpError(403, "This account has been deactivated");

  res.json({ token: sign(user.id), user: stripPassword(user) });
};

/**
 * Direct registration. Mirrors the original, but is only allowed while NO admin exists
 * (bootstrap). Afterwards, accounts are created through invitations only.
 */
export const register = async (req: Request, res: Response) => {
  const { count } = await supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "admin");
  if ((count ?? 0) > 0) throw new HttpError(403, "Public registration is disabled. Use an invitation link.");

  const { name, email, password, mobile } = req.body;
  if (!name || !email || !password) throw new HttpError(400, "name, email and password are required");
  const user = unwrap(
    await supabase.from("users")
      .insert({ name, email: String(email).toLowerCase().trim(), mobile, password: await bcrypt.hash(password, 10), role: "admin" })
      .select().single()
  );
  res.status(201).json({ token: sign(user.id), user: stripPassword(user) });
};

export const me = async (req: Request, res: Response) => {
  const user = unwrap(await supabase.from("users").select("*").eq("id", req.user!.id).single());
  res.json(stripPassword(user));
};

export const updateProfile = async (req: Request, res: Response) => {
  const patch: Record<string, unknown> = {};
  if (req.body.name) patch.name = req.body.name;
  if (req.body.mobile !== undefined) patch.mobile = req.body.mobile;
  const user = unwrap(await supabase.from("users").update(patch).eq("id", req.user!.id).select().single());
  res.json(stripPassword(user));
};

export const logout = async (_req: Request, res: Response) => {
  res.json({ message: "Logged out successfully" }); // stateless JWT: client discards the token
};
