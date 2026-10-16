import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
}

// Service-role client: bypasses RLS. Server-side only.
export const supabase = createClient(url, key, { auth: { persistSession: false } });

export const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
export const JWT_EXPIRE = process.env.JWT_EXPIRE || "7d";
export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "labmaintain";
