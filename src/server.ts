import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
dotenv.config();

import { supabase } from "./config/supabase";
import routes from "./routes";
import { errorHandler, notFound } from "./middleware/errorHandler";

const app = express();
app.use(helmet());
app.use(cors()); // native mobile clients send no Origin header; restrict origins here if you add a web client
app.use(morgan(process.env.NODE_ENV === "development" ? "dev" : "combined"));
app.use(express.json());
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api", routes);
app.use(notFound);
app.use(errorHandler);

async function seedIfEmpty() {
  // 1. Checks if any user exists in the "users" table
  const { count, error } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true });

  if (error) throw new Error(`Cannot read "users" - did you run supabase/schema.sql? (${error.message})`);

  // If users already exist, do nothing and return
  if ((count ?? 0) > 0) return;

  // 2. Insert or update default department "CSE"
  const { data: dept } = await supabase.from("departments")
    .upsert(
      {
        departmentName: "Computer Science & Engineering",
        departmentCode: "CSE",
        hodName: "Unassigned"
      },
      { onConflict: "departmentCode" }
    )
    .select()
    .single();

  // 3. Hash "admin123" with bcrypt and insert initial System Administrator
  await supabase.from("users").insert({
    name: "System Administrator",
    email: "admin@lab.com",
    password: await bcrypt.hash("admin123", 10),
    role: "admin",
  });

  console.log(`Seeded department ${dept?.departmentCode} and admin@lab.com / admin123 (change this password!)`);
}


const PORT = Number(process.env.PORT) || 5000;
// The server starts ONLY after seedIfEmpty() finishes:
seedIfEmpty()
  .then(() => app.listen(PORT, () => console.log(`LabMaintain API listening on :${PORT}`)))
  .catch((e) => { console.error(e.message); process.exit(1); });
