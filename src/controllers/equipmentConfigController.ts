import { Request, Response } from "express";
import { supabase } from "../config/supabase";
import { HttpError, pick, unwrap } from "../lib/http";

const CONFIG_FIELDS = ["processor", "ram", "storage", "os", "ipAddress", "macAddress"];

/** Bulk provisioning runs inside the bulk_generate_systems() Postgres function = one transaction. */
export const bulkGenerate = async (req: Request, res: Response) => {
  const { labRoomId, systemCount, baseAssetTag, startIndex = 1, baseIpAddress, hardware = {},
    equipmentName = "Desktop Computer", equipmentType = "Computer", brand = null, modelNumber = null } = req.body;

  if (!labRoomId || !systemCount || !baseAssetTag || !baseIpAddress) {
    throw new HttpError(400, "labRoomId, systemCount, baseAssetTag, and baseIpAddress are required");
  }
  const count = Number(systemCount);
  if (!Number.isInteger(count) || count < 1 || count > 32) throw new HttpError(400, "systemCount must be between 1 and 32");
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(String(baseIpAddress))) throw new HttpError(400, "baseIpAddress must be a valid IPv4 address");

  const lab = unwrap(await supabase.from("lab_rooms").select("id, departmentId").eq("id", labRoomId).maybeSingle());
  if (!lab) throw new HttpError(404, "Lab room not found");
  const u = req.user!;
  const allowed = u.role === "admin" ||
    (u.role === "hod" && lab.departmentId === u.departmentId) ||
    (u.role === "technician" && lab.id === u.assignedLabId);
  if (!allowed) throw new HttpError(403, "You can only provision systems in labs you manage");

  const systems = unwrap(await supabase.rpc("bulk_generate_systems", {
    p_lab_room_id: lab.id, p_count: count, p_base_tag: baseAssetTag, p_start_index: Number(startIndex),
    p_base_ip: baseIpAddress, p_name: equipmentName, p_type: equipmentType, p_brand: brand, p_model: modelNumber,
    p_processor: hardware.processor ?? null, p_ram: hardware.ram ?? null,
    p_storage: hardware.storage ?? null, p_os: hardware.os ?? null,
  }));
  res.status(201).json({ message: `Successfully provisioned ${count} systems`, labRoomId: lab.id, systems });
};

export const getByEquipmentId = async (req: Request, res: Response) => {
  const c = unwrap(await supabase.from("equipment_configurations").select("*").eq("equipmentId", req.params.id).maybeSingle());
  if (!c) throw new HttpError(404, "Configuration not found");
  res.json(c);
};

export const create = async (req: Request, res: Response) => {
  if (!req.body.equipmentId) throw new HttpError(400, "equipmentId is required");
  res.status(201).json(unwrap(await supabase.from("equipment_configurations")
    .insert({ ...pick(req.body, CONFIG_FIELDS), equipmentId: req.body.equipmentId }).select().single()));
};

export const update = async (req: Request, res: Response) => {
  const c = unwrap(await supabase.from("equipment_configurations").update(pick(req.body, CONFIG_FIELDS)).eq("id", req.params.id).select().maybeSingle());
  if (!c) throw new HttpError(404, "Configuration not found");
  res.json(c);
};
