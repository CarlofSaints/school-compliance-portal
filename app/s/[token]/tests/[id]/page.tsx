"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useT } from "@/components/I18nProvider";
import TestView, { type TestResult } from "@/components/campus/TestView";
import { GuestShell, guestFetch, useGuestNext } from "@/components/campus/guest";

export default function GuestTestPage() {
  const t = useT();
  const { token, id } = useParams<{ token: string; id: string }>();
  const [result, setResult] = useState<TestResult | null>(null);
  const nextHref = useGuestNext(token, "test", id, result?.passed ? result : null);
  return (
    <GuestShell>
      <TestView
        id={id}
        api={`/api/share/${token}`}
        fetcher={guestFetch}
        ready
        backHref={`/s/${token}`}
        backLabel={t("Back to the course")}
        nextHref={nextHref}
        onResult={setResult}
      />
    </GuestShell>
  );
}
