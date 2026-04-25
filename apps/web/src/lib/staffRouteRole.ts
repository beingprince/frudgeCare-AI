import type { UserRole } from "@/types";

/**
 * When there is no auth session, infer staff workspace chrome (header quick links,
 * nav) from the URL so e.g. /nurse does not look like the front-desk workspace.
 */
export function inferStaffRoleFromPathname(pathname: string | null): UserRole | null {
  if (!pathname) return null;
  if (pathname === "/nurse" || pathname.startsWith("/nurse/")) return "nurse";
  if (pathname.startsWith("/front-desk")) return "front_desk";
  if (pathname.startsWith("/provider")) return "provider";
  if (pathname.startsWith("/operations")) return "operations";
  if (pathname.startsWith("/admin")) return "admin";
  return null;
}
