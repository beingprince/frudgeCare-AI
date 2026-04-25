import type { UserRole } from "@/types";

/**
 * Role → default home path. Safe to import from Client Components (no server APIs).
 */
export const ROLE_HOME: Record<UserRole, string> = {
  patient: "/patient/status",
  front_desk: "/front-desk/queue",
  nurse: "/nurse",
  provider: "/provider/daily",
  operations: "/operations/dashboard",
  admin: "/operations/dashboard",
};

export const ROLE_LOGIN_PATH: Record<string, UserRole> = {
  "front-desk": "front_desk",
  nurse: "nurse",
  provider: "provider",
  admin: "admin",
};
