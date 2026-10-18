"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import Toast from "@/components/Toast";
import { Permission, Role } from "@/lib/roles";
import { useT } from "@/components/I18nProvider";

export default function RolesPage() {
  const t = useT();
  const { session, loading } = useAuth("manage_roles");
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [newRoleId, setNewRoleId] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const fetchData = useCallback(async () => {
    const [rolesRes, permsRes] = await Promise.all([
      authFetch("/api/roles"),
      authFetch("/api/permissions"),
    ]);
    if (rolesRes.ok) {
      const r = await rolesRes.json();
      setRoles(r);
      if (selectedRole) {
        const updated = r.find((role: Role) => role.id === selectedRole.id);
        if (updated) setSelectedRole(updated);
      }
    }
    if (permsRes.ok) setPermissions(await permsRes.json());
  }, [selectedRole]);

  useEffect(() => {
    if (session) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const togglePermission = async (role: Role, permKey: string) => {
    const hasIt = role.permissions.includes(permKey);
    const newPerms = hasIt
      ? role.permissions.filter((p) => p !== permKey)
      : [...role.permissions, permKey];

    const res = await authFetch(`/api/roles/${role.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: newPerms }),
    });
    if (res.ok) {
      fetchData();
    }
  };

  const createRole = async () => {
    if (!newRoleId || !newRoleName) return;
    const res = await authFetch("/api/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: newRoleId, name: newRoleName, permissions: [] }),
    });
    if (res.ok) {
      setToast({ message: t("Role created"), type: "success" });
      setShowCreateRole(false);
      setNewRoleId("");
      setNewRoleName("");
      fetchData();
    } else {
      const data = await res.json();
      setToast({ message: data.error || t("Failed"), type: "error" });
    }
  };

  const deleteRole = async (id: string) => {
    if (!confirm(t("Delete this role?"))) return;
    const res = await authFetch(`/api/roles/${id}`, { method: "DELETE" });
    if (res.ok) {
      setToast({ message: t("Role deleted"), type: "success" });
      if (selectedRole?.id === id) setSelectedRole(null);
      fetchData();
    } else {
      const data = await res.json();
      setToast({ message: data.error || t("Failed"), type: "error" });
    }
  };

  if (loading) return <div className="p-6">{t("Loading...")}</div>;

  const permsByCategory = permissions.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {} as Record<string, Permission[]>);

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("Roles & Permissions")}</h1>
          <p className="text-gray-500 text-sm">{t("Configure access control")}</p>
        </div>
        <button
          onClick={() => setShowCreateRole(true)}
          className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {t("+ Add Role")}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Role List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-medium text-sm text-gray-500">{t("ROLES")}</h3>
            </div>
            {roles.map((role) => (
              <button
                key={role.id}
                onClick={() => setSelectedRole(role)}
                className={`w-full text-left px-4 py-3 text-sm border-b border-gray-50 flex items-center justify-between transition-colors ${
                  selectedRole?.id === role.id
                    ? "bg-primary/10 text-primary-dark"
                    : "hover:bg-gray-50"
                }`}
              >
                <div>
                  <p className="font-medium">{role.name}</p>
                  <p className="text-xs text-gray-400">{t("{count} permissions", { count: role.permissions.length })}</p>
                </div>
                {role.id !== "super-admin" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteRole(role.id);
                    }}
                    className="text-gray-400 hover:text-risk-high text-xs"
                  >
                    x
                  </button>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Permissions Grid */}
        <div className="lg:col-span-3">
          {selectedRole ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold mb-4">
                {t("Permissions for")} &quot;{selectedRole.name}&quot;
              </h3>
              <div className="space-y-6">
                {Object.entries(permsByCategory).map(([category, perms]) => (
                  <div key={category}>
                    <h4 className="text-sm font-medium text-gray-500 mb-2 uppercase">
                      {category}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {perms.map((perm) => {
                        const checked = selectedRole.permissions.includes(perm.key);
                        return (
                          <label
                            key={perm.key}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePermission(selectedRole, perm.key)}
                              className="accent-primary w-4 h-4"
                            />
                            <div>
                              <p className="text-sm font-medium">{perm.name}</p>
                              <p className="text-xs text-gray-400">{perm.key}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
              {t("Select a role to manage its permissions")}
            </div>
          )}
        </div>
      </div>

      {/* Create Role Modal */}
      {showCreateRole && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">{t("Create Role")}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("Role ID")}</label>
                <input
                  type="text"
                  value={newRoleId}
                  onChange={(e) => setNewRoleId(e.target.value.toLowerCase().replace(/\s/g, "-"))}
                  placeholder={t("e.g. finance-officer")}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("Display Name")}</label>
                <input
                  type="text"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder={t("e.g. Finance Officer")}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={createRole}
                  className="flex-1 bg-primary hover:bg-primary-dark text-white py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {t("Create")}
                </button>
                <button
                  onClick={() => setShowCreateRole(false)}
                  className="px-6 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  {t("Cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
