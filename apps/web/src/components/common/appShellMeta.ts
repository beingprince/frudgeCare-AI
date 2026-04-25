import type { ElementType } from "react";
import {
  PeopleRounded, MedicalServicesRounded, BarChartRounded,
  AdminPanelSettingsRounded, FaceRounded, HealthAndSafetyRounded,
} from "@mui/icons-material";
import { C } from "@/lib/theme";
import type { UserRole } from "@/types";

/**
 * Shared role metadata for AppShell sidebar + role-aware header (demo, labels).
 */
export const ROLE_META: Record<UserRole, { label: string; home: string; color: string; icon: ElementType }> = {
  patient:    { label: "Patient",     home: "/patient/status",          color: "#0277BD", icon: FaceRounded               },
  front_desk: { label: "Front Desk",  home: "/front-desk/queue",          color: C.primary, icon: PeopleRounded          },
  nurse:      { label: "Nurse",       home: "/nurse",                     color: "#00897B", icon: HealthAndSafetyRounded   },
  provider:   { label: "Provider",    home: "/provider/daily",          color: "#2E7D32", icon: MedicalServicesRounded   },
  operations: { label: "Operations",  home: "/operations/dashboard",     color: "#6A1B9A", icon: BarChartRounded          },
  admin:      { label: "Admin",       home: "/operations/dashboard",     color: "#AD1457", icon: AdminPanelSettingsRounded },
};

export const ROLE_USERS: Record<UserRole, { name: string; subtitle: string }> = {
  patient:    { name: "John Miller",      subtitle: "Patient"         },
  front_desk: { name: "Maria Johnson",    subtitle: "Front Desk"      },
  nurse:      { name: "Sarah Chen, RN",   subtitle: "Clinical Nurse"  },
  provider:   { name: "Dr. Emily Carter", subtitle: "Provider"        },
  operations: { name: "Noah Brooks",      subtitle: "Operations"     },
  admin:      { name: "System Admin",     subtitle: "Administrator"  },
};
