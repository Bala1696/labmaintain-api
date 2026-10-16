import multer from "multer";

const allowed = ["image/jpeg", "image/png", "image/webp"];

// Memory storage: the file is streamed to Supabase Storage by services/storage.ts
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error("Only JPEG, PNG, and WEBP images are allowed")),
});
