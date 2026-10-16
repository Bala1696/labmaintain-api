import { Request, Response } from "express";
import { supabase } from "../config/supabase";
import { HttpError, pick, unwrap } from "../lib/http";
import { uploadImage } from "../services/storage";

const FIELDS = ["labRoomId", "assetNumber", "equipmentName", "equipmentType", "brand", "modelNumber", "serialNumber",
  "purchaseDate", "warrantyExpiry", "price", "supplierName", "currentStatus", "remarks"];
const CONFIG_FIELDS = ["processor", "ram", "storage", "os", "ipAddress", "macAddress"];
const SELECT = "*, configuration:equipment_configurations(*), images:equipment_images(*), labRoom:lab_rooms(id, labName, labCode)";

/** RBAC scope: admin = all, hod = own department, technician = assigned lab. */
function scope(q: any, req: Request): any {
  const u = req.user!;
  if (u.role === "hod") return q.eq("departmentId", u.departmentId);
  if (u.role === "technician") return q.eq("labRoomId", u.assignedLabId ?? -1);
  return q;
}

function assertAccess(req: Request, e: { departmentId: number; labRoomId: number }) {
  const u = req.user!;
  const ok = u.role === "admin" ||
    (u.role === "hod" && e.departmentId === u.departmentId) ||
    (u.role === "technician" && e.labRoomId === u.assignedLabId);
  if (!ok) throw new HttpError(403, "You do not have access to this equipment");
}

const parseConfig = (raw: unknown) => {
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return undefined; } }
  return raw as Record<string, unknown> | undefined;
};

export const stats = async (req: Request, res: Response) => {
  const rows = unwrap(await scope(supabase.from("equipment").select("currentStatus, equipmentType"), req)) as
    { currentStatus: string; equipmentType: string }[];
  const tally = (key: "currentStatus" | "equipmentType") => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r[key], (m.get(r[key]) ?? 0) + 1));
    return [...m].map(([k, count]) => ({ [key]: k, count }));
  };
  res.json({ total: rows.length, byStatus: tally("currentStatus"), byCategory: tally("equipmentType") });
};

export const list = async (req: Request, res: Response) => {
  const { search, status, labRoomId } = req.query as Record<string, string | undefined>;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);

  let q = scope(supabase.from("equipment").select(SELECT, { count: "exact" }), req);
  if (status) q = q.eq("currentStatus", status);
  if (labRoomId) q = q.eq("labRoomId", labRoomId);
  if (search) {
    const s = search.replace(/[,()%*]/g, " ").trim(); // keep PostgREST filter syntax intact
    q = q.or(`assetNumber.ilike.%${s}%,serialNumber.ilike.%${s}%,brand.ilike.%${s}%,equipmentName.ilike.%${s}%`);
  }
  const { data, error, count } = await q
    .order("createdAt", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (error) throw new HttpError(500, error.message);
  res.json({ items: data, total: count ?? 0, page, limit });
};

async function loadOne(req: Request, col: "id" | "assetNumber", val: string) {
  const e = unwrap(await supabase.from("equipment").select(SELECT).eq(col, val).maybeSingle());
  if (!e) throw new HttpError(404, "Equipment not found");
  assertAccess(req, e);
  return e;
}

export const getById = async (req: Request, res: Response) => res.json(await loadOne(req, "id", req.params.id));
export const getByAsset = async (req: Request, res: Response) => res.json(await loadOne(req, "assetNumber", req.params.assetNumber));

export const create = async (req: Request, res: Response) => {
  const u = req.user!;
  const row: Record<string, unknown> = pick(req.body, FIELDS);
  if (!row.labRoomId || !row.assetNumber || !row.equipmentName || !row.equipmentType) {
    throw new HttpError(400, "labRoomId, assetNumber, equipmentName and equipmentType are required");
  }
  const lab = unwrap(await supabase.from("lab_rooms").select("id, departmentId").eq("id", row.labRoomId).maybeSingle());
  if (!lab) throw new HttpError(404, "Lab room not found");
  assertAccess(req, { departmentId: lab.departmentId, labRoomId: lab.id });
  row.departmentId = lab.departmentId; // derived from the lab, never trusted from the client

  const eq = unwrap(await supabase.from("equipment").insert(row).select().single());

  const cfg = parseConfig(req.body.configuration);
  if (cfg) unwrap(await supabase.from("equipment_configurations").insert({ ...pick(cfg, CONFIG_FIELDS), equipmentId: eq.id }));
  if (req.file) {
    unwrap(await supabase.from("equipment_images").insert({ equipmentId: eq.id, imageUrl: await uploadImage(req.file, "equipment"), isPrimary: true }));
  }
  res.status(201).json(await loadOne(req, "id", String(eq.id)));
};

export const update = async (req: Request, res: Response) => {
  await loadOne(req, "id", req.params.id);
  const patch = pick(req.body, FIELDS.filter((f) => f !== "labRoomId"));
  if (Object.keys(patch).length) unwrap(await supabase.from("equipment").update(patch).eq("id", req.params.id));

  const cfg = parseConfig(req.body.configuration);
  if (cfg) {
    unwrap(await supabase.from("equipment_configurations")
      .upsert({ ...pick(cfg, CONFIG_FIELDS), equipmentId: Number(req.params.id) }, { onConflict: "equipmentId" }));
  }
  if (req.file) {
    unwrap(await supabase.from("equipment_images").insert({ equipmentId: Number(req.params.id), imageUrl: await uploadImage(req.file, "equipment"), isPrimary: false }));
  }
  res.json(await loadOne(req, "id", req.params.id));
};

export const remove = async (req: Request, res: Response) => {
  await loadOne(req, "id", req.params.id);
  unwrap(await supabase.from("equipment").delete().eq("id", req.params.id)); // FK cascade removes config/images/logs
  res.json({ message: "Equipment deleted" });
};
