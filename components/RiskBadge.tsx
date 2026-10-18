"use client";

import { useT } from "@/components/I18nProvider";

interface RiskBadgeProps {
  severity: "low" | "medium" | "high";
}

export default function RiskBadge({ severity }: RiskBadgeProps) {
  const t = useT();
  const styles = {
    low: "bg-risk-low/10 text-risk-low border-risk-low/20",
    medium: "bg-risk-medium/10 text-risk-medium border-risk-medium/20",
    high: "bg-risk-high/10 text-risk-high border-risk-high/20",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[severity]}`}
    >
      {severity === "low" ? t("Low") : severity === "medium" ? t("Medium") : t("High")}
    </span>
  );
}
