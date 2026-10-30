"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useT } from "@/components/I18nProvider";
import LessonView from "@/components/campus/LessonView";
import { GuestShell, guestFetch, useGuestNext } from "@/components/campus/guest";

export default function GuestLessonPage() {
  const t = useT();
  const { token, id } = useParams<{ token: string; id: string }>();
  const [loaded, setLoaded] = useState(false);
  const nextHref = useGuestNext(token, "material", id, loaded);
  return (
    <GuestShell>
      <LessonView
        id={id}
        api={`/api/share/${token}`}
        fetcher={guestFetch}
        ready
        backHref={`/s/${token}`}
        backLabel={t("Back to the course")}
        nextHref={nextHref}
        onLoaded={() => setLoaded(true)}
        openFile={async (url) => {
          window.location.href = url;
          return null;
        }}
      />
    </GuestShell>
  );
}
