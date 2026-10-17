"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";

export default function SchoolHome() {
  const t = useT();
  const router = useRouter();

  useEffect(() => {
    const session = getSession();
    if (session) {
      router.replace("/dashboard");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-primary text-lg">{t("Loading...")}</div>
    </div>
  );
}
