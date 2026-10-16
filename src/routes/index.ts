import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { h } from "../lib/http";
import * as auth from "../controllers/authController";
import * as dept from "../controllers/departmentController";
import * as lab from "../controllers/labRoomController";
import * as eq from "../controllers/equipmentController";
import * as cfg from "../controllers/equipmentConfigController";
import * as mnt from "../controllers/maintenanceController";
import * as inv from "../controllers/invitationController";
import * as usr from "../controllers/userController";
import * as meta from "../controllers/metaController";
import * as ntf from "../controllers/notificationController";

const api = Router();
const any3 = authorize("admin", "hod", "technician");
const adminHod = authorize("admin", "hod");
const adminOnly = authorize("admin");

// Auth
api.post("/auth/login", h(auth.login));
api.post("/auth/register", h(auth.register));
api.get("/auth/me", authenticate, h(auth.me));
api.put("/auth/profile", authenticate, h(auth.updateProfile));
api.post("/auth/logout", authenticate, h(auth.logout));

// Invitations (validate/register are public by design: the token is the credential)
api.get("/invitations/validate/:token", h(inv.validate));
api.post("/invitations/register/:token", h(inv.completeRegistration));
api.post("/invitations", authenticate, adminHod, h(inv.create));
api.get("/invitations", authenticate, adminHod, h(inv.list));
api.put("/invitations/:id/resend", authenticate, adminHod, h(inv.resend));

// Departments
api.get("/departments", authenticate, adminOnly, h(dept.list));
api.post("/departments", authenticate, adminOnly, h(dept.create));
api.get("/departments/:id", authenticate, adminHod, h(dept.get));
api.put("/departments/:id", authenticate, adminOnly, h(dept.update));
api.delete("/departments/:id", authenticate, adminOnly, h(dept.remove));

// Lab rooms
api.get("/lab-rooms", authenticate, adminHod, h(lab.list));
api.post("/lab-rooms", authenticate, adminHod, upload.single("labImage"), h(lab.create));
api.get("/lab-rooms/:id", authenticate, adminHod, h(lab.get));
api.put("/lab-rooms/:id", authenticate, adminHod, upload.single("labImage"), h(lab.update));
api.delete("/lab-rooms/:id", authenticate, adminHod, h(lab.remove));

// Equipment
api.get("/equipment/stats", authenticate, h(eq.stats));
api.get("/equipment", authenticate, h(eq.list));
api.get("/equipment/asset/:assetNumber", authenticate, h(eq.getByAsset));
api.get("/equipment/:id", authenticate, h(eq.getById));
api.post("/equipment", authenticate, any3, upload.single("image"), h(eq.create));
api.put("/equipment/:id", authenticate, any3, upload.single("image"), h(eq.update));
api.delete("/equipment/:id", authenticate, adminHod, h(eq.remove));

// Equipment configurations + bulk engine
api.post("/equipment-configurations/bulk-generate", authenticate, any3, h(cfg.bulkGenerate));
api.get("/equipment-configurations/:id", authenticate, h(cfg.getByEquipmentId));
api.post("/equipment-configurations", authenticate, any3, h(cfg.create));
api.put("/equipment-configurations/:id", authenticate, any3, h(cfg.update));

// Maintenance
api.get("/maintenance/stats", authenticate, h(mnt.stats));
api.get("/maintenance", authenticate, h(mnt.list));
api.post("/maintenance", authenticate, h(mnt.create));
api.get("/maintenance/:id", authenticate, h(mnt.get));
api.put("/maintenance/:id", authenticate, h(mnt.update));
api.delete("/maintenance/:id", authenticate, adminOnly, h(mnt.remove));

// Users
api.get("/users", authenticate, adminHod, h(usr.list));
api.post("/users", authenticate, adminHod, h(usr.create));
api.get("/users/:id", authenticate, adminHod, h(usr.get));
api.put("/users/:id", authenticate, adminHod, h(usr.update));
api.delete("/users/:id", authenticate, adminHod, h(usr.deactivate));
api.put("/users/:id/assign-lab", authenticate, adminHod, h(usr.assignLab));
api.put("/users/:id/reset-password", authenticate, adminOnly, h(usr.resetPassword));

// Meta
api.get("/meta/departments", h(meta.departments));
api.get("/meta/lab-rooms", authenticate, h(meta.labRooms));
api.get("/meta/technicians", authenticate, h(meta.technicians));

// Notifications
api.get("/notifications", authenticate, h(ntf.list));
api.patch("/notifications/:id/read", authenticate, h(ntf.markRead));

export default api;
