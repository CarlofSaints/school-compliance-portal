"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import { useT } from "@/components/I18nProvider";
import { useNextStep } from "@/components/trainingUi";
import TestView, { type TestResult } from "@/components/campus/TestView";

export default function TestPage() {
  const t = useT();
  const { session, loading } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [moduleId, setModuleId] = useState("");
  const [result, setResult] = useState<TestResult | null>(null);
  useEffect(() => {
    setModuleId(new URLSearchParams(window.location.search).get("module") || "");
  }, []);
  const nextHref = useNextStep(result?.passed ? moduleId : "", "test", id, result);

  if (loading) return <div className="p-6">{t("Loading...")}</div>;
  return (
    <TestView
      id={id}
      api="/api/training"
      fetcher={authFetch}
      ready={Boolean(session)}
      backHref="/campus"
      backLabel={t("Back to Campus")}
      nextHref={nextHref}
      onResult={setResult}
      copyPath={`/campus/tests/${id}`}
      editHref={session?.permissions.includes("manage_training") ? `/campus/manage/tests/${id}` : undefined}
      leaderboardHref="/campus/leaderboard"
    />
  );
}
