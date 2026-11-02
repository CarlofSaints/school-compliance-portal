"use client";

import { useEffect, useState } from "react";
import { authFetch } from "./useAuth";
import { BUILT_IN_MEETING_TYPES, meetingTypeLabel, type MeetingType } from "./meetingTypes";

/** The school's meeting types for a screen. Starts on the built-ins so a
 *  page never renders blank while it loads; a failed load keeps them. */
export function useMeetingTypes(): { types: MeetingType[]; label: (id: string) => string } {
  const [types, setTypes] = useState<MeetingType[]>(BUILT_IN_MEETING_TYPES);
  useEffect(() => {
    let live = true;
    authFetch("/api/meeting-types", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && Array.isArray(d?.types)) setTypes(d.types);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return { types, label: (id: string) => meetingTypeLabel(types, id) };
}
