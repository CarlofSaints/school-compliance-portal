"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import { downloadWithAuth } from "@/lib/download";
import { useT } from "@/components/I18nProvider";
import { useNextStep } from "@/components/trainingUi";
import LessonView from "@/components/campus/LessonView";

export default function MaterialPage() {
  const t = useT();
  const { session, loading } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [moduleId, setModuleId] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setModuleId(new URLSearchParams(window.location.search).get("module") || "");
  }, []);
  // Asked once the lesson has loaded: that load is what marks it read and unlocks the next step.
  const nextHref = useNextStep(loaded ? moduleId : "", "material", id);

  if (loading) return <div className="p-6">{t("Loading...")}</div>;
  return (
    <LessonView
      id={id}
      api="/api/training"
      fetcher={authFetch}
      ready={Boolean(session)}
      backHref="/campus"
      backLabel={t("Back to Campus")}
      nextHref={nextHref}
      onLoaded={() => setLoaded(true)}
      openFile={async (url, name) => {
        const r = await downloadWithAuth(url, name);
        return r.ok ? null : r.error || "";
      }}
      copyPath={`/campus/material/${id}`}
      editHref={session?.permissions.includes("manage_training") ? `/campus/manage/materials/${id}` : undefined}
    />
  );
}
