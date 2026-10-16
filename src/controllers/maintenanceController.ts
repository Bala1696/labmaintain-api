import { Request, Response } from "express";
import { supabase } from "../config/supabase";
import { HttpError, pick, unwrap } from "../lib/http";

const SELECT = "*, equipment:equipment(id, assetNumber, equipmentName, departmentId, labRoomId), " +
  "reporter:users!fk_logs_reporter(id, name), technician:users!fk_logs_technician(id, name)";

/** Technicians see tickets for their lab; HODs for their department; admins everything. */
function canSee(req: Request, e: { departmentId: number; labRoomId: number } | null) {
  const u = req.user!;
  if (!e) return false;
  return u.role === "admin" || (u.role === "hod" && e.departmentId === u.departmentId) ||
    (u.role === "technician" && e.labRoomId === u.assignedLabId);
}

async function allowedLogs(req: Request, filters: { status?: string; assignedTo?: string } = {}) {
  let q = supabase.from("maintenance_logs").select(SELECT).order("reportedDate", { ascending: false });
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.assignedTo) q = q.eq("assignedTo", filters.assignedTo);
  const rows = unwrap(await q) as any[];
  return rows.filter((r) => canSee(req, r.equipment));
}

export const stats = async (req: Request, res: Response) => {
  const rows = await allowedLogs(req);
  const m = new Map<string, number>();
  rows.forEach((r) => m.set(r.status, (m.get(r.status) ?? 0) + 1));
  res.json([...m].map(([status, count]) => ({ status, count })));
};

export const list = async (req: Request, res: Response) => {
  const { status, assignedTo } = req.query as Record<string, string | undefined>;
  res.json(await allowedLogs(req, { status, assignedTo }));
};

export const get = async (req: Request, res: Response) => {
  const log = unwrap(await supabase.from("maintenance_logs").select(SELECT).eq("id", req.params.id).maybeSingle());
  if (!log || !canSee(req, log.equipment)) throw new HttpError(404, "Maintenance log not found");
  res.json(log);
};

export const create = async (req: Request, res: Response) => {
  const { equipmentId, issueDescription, assignedTo } = req.body;
  if (!equipmentId || !issueDescription) throw new HttpError(400, "equipmentId and issueDescription are required");

  const eq = unwrap(await supabase.from("equipment").select("id, departmentId, labRoomId").eq("id", equipmentId).maybeSingle());
  if (!canSee(req, eq)) throw new HttpError(404, "Equipment not found");

  const log = unwrap(await supabase.from("maintenance_logs")
    .insert({ equipmentId, issueDescription, assignedTo: assignedTo || null, reportedBy: req.user!.id, status: "Open" })
    .select().single());
  unwrap(await supabase.from("equipment").update({ currentStatus: "Under Maintenance" }).eq("id", equipmentId));

  if (assignedTo) {
    unwrap(await supabase.from("notifications").insert({
      recipientId: assignedTo, senderId: req.user!.id, type: "MAINTENANCE",
      title: "New maintenance ticket assigned", message: `You've been assigned a ticket: ${String(issueDescription).slice(0, 80)}`,
    }));
  }
  res.status(201).json(log);
};

export const update = async (req: Request, res: Response) => {
  const existing = unwrap(await supabase.from("maintenance_logs").select(SELECT).eq("id", req.params.id).maybeSingle());
  if (!existing || !canSee(req, existing.equipment)) throw new HttpError(404, "Maintenance log not found");

  const patch: Record<string, unknown> = pick(req.body, ["status", "resolutionDetails", "costIncurred", "assignedTo"]);
  const status = req.body.status as string | undefined;

  if (status === "Resolved" || status === "Unrepairable") {
    patch.resolvedDate = new Date().toISOString();
    unwrap(await supabase.from("equipment")
      .update({ currentStatus: status === "Resolved" ? "Repair Completed" : "Scrap" }).eq("id", existing.equipmentId));
  } else if (status === "Open" || status === "In Progress") {
    patch.resolvedDate = null;
    unwrap(await supabase.from("equipment").update({ currentStatus: "Under Maintenance" }).eq("id", existing.equipmentId));
  }

  const log = unwrap(await supabase.from("maintenance_logs").update(patch).eq("id", req.params.id).select().single());

  if (req.body.assignedTo && req.body.assignedTo !== existing.assignedTo) {
    unwrap(await supabase.from("notifications").insert({
      recipientId: req.body.assignedTo, senderId: req.user!.id, type: "MAINTENANCE",
      title: "Maintenance ticket assigned", message: `Ticket #${existing.id} (${existing.equipment.assetNumber}) was assigned to you`,
    }));
  }
  res.json(log);
};

export const remove = async (req: Request, res: Response) => {
  unwrap(await supabase.from("maintenance_logs").delete().eq("id", req.params.id));
  res.json({ message: "Maintenance log deleted" });
};
