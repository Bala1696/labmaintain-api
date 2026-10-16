import { Request, Response } from "express";
import { supabase } from "../config/supabase";
import { HttpError, unwrap } from "../lib/http";

export const list = async (req: Request, res: Response) =>
  res.json(unwrap(await supabase.from("notifications").select("*").eq("recipientId", req.user!.id)
    .order("createdAt", { ascending: false }).limit(50)));

export const markRead = async (req: Request, res: Response) => {
  if (req.params.id === "all") {
    unwrap(await supabase.from("notifications").update({ isRead: true }).eq("recipientId", req.user!.id));
    return res.json({ message: "All notifications marked as read" });
  }
  // recipientId filter = users can only touch their own notifications
  const n = unwrap(await supabase.from("notifications").update({ isRead: true })
    .eq("id", req.params.id).eq("recipientId", req.user!.id).select().maybeSingle());
  if (!n) throw new HttpError(404, "Notification not found");
  res.json(n);
};
