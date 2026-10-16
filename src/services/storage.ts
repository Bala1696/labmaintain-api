import path from "path";
import { v4 as uuid } from "uuid";
import { STORAGE_BUCKET, supabase } from "../config/supabase";
import { HttpError } from "../lib/http";

/** Uploads a multer memory file to Supabase Storage and returns its public URL. */
export async function uploadImage(file: Express.Multer.File, folder: string): Promise<string> {
  const key = `${folder}/${uuid()}${path.extname(file.originalname).toLowerCase()}`;
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(key, file.buffer, { contentType: file.mimetype, upsert: false });
  if (error) throw new HttpError(500, `Image upload failed: ${error.message}`);
  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(key).data.publicUrl;
}
