import { GOVERNANCE_LABEL, GOVERNANCE_MEMBER_LABEL } from "./positions";

export interface Permission {
  key: string;
  name: string;
  category: string;
}

export interface Role {
  id: string;
  name: string;
  permissions: string[];
}

export interface SessionPayload {
  id: string;
  name: string;
  surname: string;
  email: string;
  role: string;
  roleName: string;
  permissions: string[];
}

export const DEFAULT_PERMISSIONS: Permission[] = [
  { key: "view_dashboard", name: "View Dashboard", category: "Dashboard" },
  { key: "manage_policies", name: "Manage Policies", category: "Policies" },
  { key: "upload_policies", name: "Upload Policies", category: "Policies" },
  { key: "download_policies", name: "Download Policies", category: "Policies" },
  { key: "check_compliance", name: "Run Compliance Check", category: "Compliance" },
  { key: "view_compliance_results", name: "View Compliance Results", category: "Compliance" },
  { key: "manage_guidelines", name: "Manage Guidelines", category: "Compliance" },
  { key: "check_documents", name: "Check Documents", category: "Documents" },
  { key: "submit_spend", name: "Submit Spend Applications", category: "Spend" },
  { key: "approve_spend", name: "Approve/Reject Spend", category: "Spend" },
  { key: "view_all_spend", name: "View All Spend Applications", category: "Spend" },
  // Deliberately its own key rather than riding on manage_spend_settings:
  // deleting a project is not the same authority as editing settings.
  { key: "delete_spend", name: "Delete Spend Applications", category: "Spend" },
  // Seeing who is on the portal is separate from being able to change them:
  // view_users opens the Users page read-only, manage_users allows editing.
  { key: "view_users", name: "View Users", category: "Admin" },
  { key: "manage_users", name: "Manage Users", category: "Admin" },
  { key: "manage_roles", name: "Manage Roles & Permissions", category: "Admin" },
  { key: "manage_people", name: "Manage People", category: "Admin" },
  { key: "manage_tags", name: "Manage Tags", category: "Admin" },
  { key: "manage_approval_settings", name: "Manage Approval Settings", category: "Admin" },
  { key: "manage_spend_settings", name: "Manage Spend Settings", category: "Admin" },
];

export const ALL_PERMISSION_KEYS = DEFAULT_PERMISSIONS.map((p) => p.key);

export const DEFAULT_ROLES: Role[] = [
  {
    id: "super-admin",
    name: "Super Admin",
    permissions: [...ALL_PERMISSION_KEYS],
  },
  {
    // id stays stable across school types; only the display name follows the
    // governance model (SGB for public, Board for private).
    id: "sgb-admin",
    name: `${GOVERNANCE_LABEL} Admin`,
    permissions: ALL_PERMISSION_KEYS.filter((k) => k !== "manage_roles"),
  },
  {
    id: "sgb-member",
    name: GOVERNANCE_MEMBER_LABEL,
    permissions: [
      "view_dashboard",
      "download_policies",
      "check_compliance",
      "view_compliance_results",
      "check_documents",
      "submit_spend",
    ],
  },
  {
    id: "viewer",
    name: "Viewer",
    permissions: ["view_dashboard", "download_policies"],
  },
];

export function hasPermission(
  userPermissions: string[],
  requiredPermission: string
): boolean {
  return userPermissions.includes(requiredPermission);
}
