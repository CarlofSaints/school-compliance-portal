"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import GuideVideo from "@/components/GuideVideo";

// Pages built around a wide grid use the whole screen instead of the reading
// width every other page is capped at, so the grid is not forced to scroll
// sideways on a screen that could show it all.
const FULL_WIDTH_PAGES = ["/action-items"];

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const fullWidth = FULL_WIDTH_PAGES.includes(pathname);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 bg-gray-50 overflow-auto">
        <div className={`px-6 ${pathname === "/guide" ? "pb-6" : "pb-20"} pt-14 mx-auto ${fullWidth ? "max-w-none" : "max-w-7xl"}`}>
          {children}
        </div>
      </main>
      <GuideVideo />
    </div>
  );
}
