import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET, supabase } from "../config/supabase";
import { Role } from "../types/express";

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No authentication token provided" });
    }
    const decoded = jwt.verify(header.split(" ")[1], JWT_SECRET) as { id: number };

    const { data: user } = await supabase
      .from("users")
      .select("id, role, departmentId, assignedLabId, email, name, status")
      .eq("id", decoded.id)
      .maybeSingle();

    if (!user || !user.status) {
      return res.status(401).json({ message: "User not found or deactivated" });
    }
    req.user = {
      id: user.id, role: user.role, departmentId: user.departmentId ?? null,
      assignedLabId: user.assignedLabId ?? null, email: user.email, name: user.name,
    };
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

export const authorize =
  (...roles: Role[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions for this action" });
    }
    next();
  };
