declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export type Role = "admin" | "hod" | "technician";
export interface AuthUser {
  id: number;
  role: Role;
  departmentId: number | null;
  assignedLabId: number | null;
  email: string;
  name: string;
}
