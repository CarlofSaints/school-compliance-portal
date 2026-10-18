// Who may read the audit trail, and so the sign-ins too. Shared by the API
// routes and the pages (no imports, so a client page can use it).
//
// ANY-of, not one narrow key: a stored role that predates a new permission
// never gains it, so "view_activity" alone would lock out every existing
// admin until somebody re-ticked it by hand.
export const ACTIVITY_VIEW_PERMISSIONS = ["view_activity", "manage_users", "manage_roles", "manage_spend_settings"];
