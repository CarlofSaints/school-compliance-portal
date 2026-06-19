"use client";

import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { getSession, clearSession } from "@/lib/useAuth";
import { branding } from "@/lib/branding";
import { useState } from "react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  permission?: string;
  children?: { label: string; href: string; permission?: string }[];
}

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    permission: "view_dashboard",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
      </svg>
    ),
  },
  {
    label: "Policies",
    href: "/policies",
    permission: "download_policies",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    label: "Compliance",
    href: "/compliance",
    permission: "check_compliance",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    children: [
      { label: "Run Check", href: "/compliance", permission: "check_compliance" },
      { label: "Guidelines", href: "/compliance/guidelines", permission: "manage_guidelines" },
    ],
  },
  {
    label: "Documents",
    href: "/documents",
    permission: "check_documents",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    label: "Spend",
    href: "/spend",
    permission: "submit_spend",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
      </svg>
    ),
  },
  {
    label: "Admin",
    href: "/admin/users",
    permission: "manage_users",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    children: [
      { label: "Users", href: "/admin/users", permission: "manage_users" },
      { label: "Roles", href: "/admin/roles", permission: "manage_roles" },
      { label: "People", href: "/admin/people", permission: "manage_people" },
      { label: "Spend Settings", href: "/admin/spend-settings", permission: "manage_spend_settings" },
      { label: "Backup Data", href: "/admin/backup", permission: "manage_users" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const session = getSession();
  const [collapsed, setCollapsed] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  if (!session) return null;

  const userPerms = session.permissions || [];

  const filteredNav = navItems.filter(
    (item) => !item.permission || userPerms.includes(item.permission)
  );

  const toggleMenu = (label: string) => {
    setOpenMenus((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const handleLogout = () => {
    clearSession();
    router.push("/login");
  };

  return (
    <aside
      className={`bg-dark text-white flex flex-col transition-all duration-300 ${
        collapsed ? "w-16" : "w-64"
      } min-h-screen`}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          {!collapsed ? (
            <div className="flex items-center gap-3">
              <Image src={branding.logo} alt={branding.shortName} width={36} height={43} />
              <div>
                <h1 className="text-lg font-bold text-accent">{branding.shortName}</h1>
                <p className="text-xs text-gray-400">{branding.portalSubtitle}</p>
              </div>
            </div>
          ) : (
            <Image src={branding.logo} alt={branding.shortName} width={28} height={33} />
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-gray-400 hover:text-white p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={collapsed ? "M13 5l7 7-7 7M5 5l7 7-7 7" : "M11 19l-7-7 7-7m8 14l-7-7 7-7"} />
            </svg>
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {filteredNav.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const hasChildren = item.children && item.children.length > 0;
          const visibleChildren = item.children?.filter(
            (c) => !c.permission || userPerms.includes(c.permission)
          );

          return (
            <div key={item.label}>
              <button
                onClick={() => {
                  if (hasChildren && !collapsed) {
                    toggleMenu(item.label);
                  } else {
                    router.push(item.href);
                  }
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                  isActive
                    ? "bg-accent/20 text-accent border-r-2 border-accent"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                }`}
                title={collapsed ? item.label : undefined}
              >
                {item.icon}
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{item.label}</span>
                    {hasChildren && (
                      <svg
                        className={`w-4 h-4 transition-transform ${
                          openMenus[item.label] ? "rotate-90" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </>
                )}
              </button>
              {hasChildren && openMenus[item.label] && !collapsed && (
                <div className="ml-4">
                  {visibleChildren?.map((child) => (
                    <button
                      key={child.href}
                      onClick={() => router.push(child.href)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                        pathname === child.href
                          ? "text-primary"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      <span className="w-5 h-5 flex items-center justify-center text-xs">-</span>
                      {child.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-gray-700 p-4">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-sm font-bold">
              {session.name?.[0]}
              {session.surname?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {session.name} {session.surname}
              </p>
              <p className="text-xs text-gray-400 truncate">{session.roleName}</p>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => router.push("/account")}
                className="text-gray-400 hover:text-white p-1"
                title="Account"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </button>
              <button
                onClick={handleLogout}
                className="text-gray-400 hover:text-red-400 p-1"
                title="Logout"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-red-400 p-1 w-full flex justify-center"
            title="Logout"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        )}
      </div>
    </aside>
  );
}
