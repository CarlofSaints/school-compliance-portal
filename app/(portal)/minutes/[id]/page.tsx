"use client";

import TranslateContentButton from "@/components/TranslateContentButton";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  useAuth,
  authFetch,
  isRedirectingToSignIn,
  isSigningOut,
  onBeforeSignOut,
  onSignedOutElsewhere,
  onSignInRedirect,
} from "@/lib/useAuth";
import Toast from "@/components/Toast";
import PeriodPicker from "@/components/PeriodPicker";
import MinutesSectionEditor from "@/components/MinutesSectionEditor";
import { quickActionTitle } from "@/lib/minutesCapture";
import { backupKeys, keysWith, TAB_ID } from "@/lib/minutesBackupKeys";
import {
  draftIsBehind,
  fromLiveTab,
  draftToOffer,
  hasUnsaved,
  isTextEditable,
  mergeOffered,
  mergeTypingOverSave,
  readDraft,
  readOffered,
  reconcile,
  removeDraft,
  retryDelayMs,
  plainText,
  sameText,
  saveFailureKind,
  savePayload,
  textBase,
  textOf,
  writeDraft,
  writeOffered,
  type EditVersions,
  type MinutesText,
  type SaveFirst,
} from "@/lib/minutesAutosave";
import DownloadLink from "@/components/DownloadLink";
import MinutesReviewPanel from "@/components/MinutesReviewPanel";
import MinutesSigningPanel from "@/components/MinutesSigningPanel";
import MinutesDistributePanel from "@/components/MinutesDistributePanel";
import MinutesActionsPanel from "@/components/MinutesActionsPanel";
import DangerConfirmModal from "@/components/DangerConfirmModal";
import { useT } from "@/components/I18nProvider";
import {
  formatPeriod,
  formatMeetingDate,
  isLocked,
  MEETING_BODY_LABELS,
  MINUTES_STATUS_LABELS,
  type MeetingBody,
  type MeetingPeriod,
  type MinutesDistributionNote,
  type MinutesReview,
  type MinutesReviewer,
  type MinutesSection,
  type MinutesStatus,
  type Signatory,
} from "@/lib/minutes";

interface MinutesDetail {
  id: string;
  title: string;
  body: MeetingBody;
  period: MeetingPeriod;
  meetingDate?: string;
  status: MinutesStatus;
  sections: MinutesSection[];
  original?: { filename: string; size: number; uploadedAt: string };
  signatories: Signatory[];
  /** The document as it stands now, computed server side so the page and the
   *  signature cannot disagree about what was signed. */
  signedCopy?: { filename: string; uploadedAt: string };
  documentHash?: string;
  documentRef?: string;
  reviewers?: MinutesReviewer[];
  reviews: MinutesReview[];
  draftNumber: number;
  distributions?: MinutesDistributionNote[];
  createdAt: string;
  createdBy: string;
  signedAt?: string;
  updatedAt?: string;
  textUpdatedAt?: string;
  lastEditedAt?: string;
  lastEditedBy?: { id: string; name: string };
}

// localStorage can throw on access (private mode, blocked site data).
function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
type BackupKeys = ReturnType<typeof backupKeys>;
/** The local backup of unsaved typing (lib/minutesAutosave.ts says why). */
function backUp(keys: BackupKeys | null, r: MinutesDetail) {
  // Signing out discards on purpose: never write a backup back behind it.
  if (!keys || isSigningOut()) return;
  writeDraft(localStore(), keys.main, {
    ...textOf(r),
    editedAt: new Date().toISOString(),
    baseUpdatedAt: textBase(r),
    tabId: TAB_ID,
  });
}

/** Unsaved text shown in a banner to restore or copy. */
interface OfferedItem {
  id: string;
  draft: MinutesText;
  editedAt?: string;
  /** device: a backup from an earlier visit. locked: typing this visit that
   *  the minutes were locked before it could be saved. */
  reason: "device" | "locked";
  /** The saved minutes changed after this backup's edits began. */
  behind?: boolean;
}

export default function MinutesDetailPage() {
  const t = useT();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { session, loading } = useAuth();
  const canManage =
    !!session &&
    (session.permissions.includes("manage_minutes") ||
      session.permissions.includes("manage_users"));
  // 🔴 A DIFFERENT permission from managing minutes, and gated ANY-of the same
  // way the register's own API is. Raising an action writes to the action
  // register, not to the minutes, so it has to be gated on what it actually
  // writes to - a secretary who may edit minutes is not automatically somebody
  // who may add to the register, and vice versa.
  const canRaiseActions =
    !!session &&
    (session.permissions.includes("manage_action_items") ||
      session.permissions.includes("manage_people"));

  const [record, setRecord] = useState<MinutesDetail | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [actionsRefresh, setActionsRefresh] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Consecutive failed saves worth retrying (network, timeout, rate limit,
  // server error): drives the backoff and the "Not saved" note, so a failing
  // autosave never turns into a stream of toasts.
  const [saveFailures, setSaveFailures] = useState(0);
  // The server refused the save outright (invalid, not allowed, locked). The
  // same text would be refused again, so autosave stops until the next edit.
  const [saveRefused, setSaveRefused] = useState<string | null>(null);
  // Unsaved text that is not in the editor: backups from earlier visits on
  // this device (newest first), or typing the server would no longer take
  // because the minutes were locked meanwhile. Each can be restored or copied.
  const [offered, setOffered] = useState<OfferedItem[]>([]);
  // Somebody else saved different words while this person was typing: their
  // record, shown beside the choice of whose text to keep. Autosave waits.
  const [conflict, setConflict] = useState<MinutesDetail | null>(null);

  // ONE rule for who may change what, used by the autosave and the page alike.
  const locked = !!record && isLocked(record.status);
  const editable = canManage && !!record && !locked;
  // Out for signing: the text people are signing must not move under them.
  // The Danger zone (delete) stays, as the way out if something is wrong.
  const signingOpen = record?.status === "awaiting_signatures";
  const textEditable = canManage && !!record && isTextEditable(record.status);

  // The record as it is right now, for callbacks that outlive a render (a
  // reload, the unmount save). Written wherever the record is set.
  const recordRef = useRef<MinutesDetail | null>(null);
  const put = useCallback((r: MinutesDetail) => {
    recordRef.current = r;
    setRecord(r);
  }, []);
  const versions = useRef<EditVersions>({ edit: 0, saved: 0 });
  const inFlight = useRef<Promise<boolean> | null>(null);
  const backupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set once the signed-in person and the minutes are known (first load).
  const keysRef = useRef<BackupKeys | null>(null);
  // Restored backups (their editedAt) are only let go of once their text is saved.
  const restoredOffers = useRef<Set<string>>(new Set());
  // The server's Retry-After on the last transient failure, if it sent one.
  const retryAfter = useRef<string | null>(null);
  /** Nothing left to save or back up: the user chose to lose the changes, or
   *  (with offered) the minutes are gone, so older backups of them go too. */
  const forgetUnsaved = (opts: { offered?: boolean } = {}) => {
    versions.current.saved = versions.current.edit;
    setDirty(false);
    if (backupTimer.current) clearTimeout(backupTimer.current);
    backupTimer.current = null;
    const keys = keysRef.current;
    const store = localStore();
    if (keys) {
      removeDraft(store, keys.main);
      if (opts.offered) {
        removeDraft(store, keys.offered);
        // Gone for every tab too: no backup of deleted minutes is left to offer.
        if (store) keysWith(store, [keys.tabsPrefix]).forEach((k) => removeDraft(store, k));
      }
    }
  };

  const userId = session?.id;
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await authFetch(`/api/minutes/${params.id}`);
      if (res.ok) {
        const server: MinutesDetail = await res.json();
        const local = recordRef.current;
        const first = local === null;
        if (first && userId) keysRef.current = backupKeys(window.location.host, userId, params.id);
        const keys = keysRef.current;
        // Every panel reloads through here after it acts. Typing since the
        // last save stays on screen and stays dirty, and autosave saves it.
        const { record: next, stranded, conflict: theirs } = reconcile(server, local, hasUnsaved(versions.current));
        put(next);
        // Somebody else changed the words meanwhile: keep the typing, back it
        // up, and let the person choose rather than overwrite either side.
        if (theirs) {
          if (local) backUp(keys, local);
          setConflict(theirs);
        }
        if (stranded) {
          // Locked meanwhile: the editor shows what was sent or signed, and
          // the typing moves to the banner (and stays in the backup) to copy.
          // Backed up first: the throttled write may not have run yet.
          if (local) backUp(keys, local);
          versions.current.saved = versions.current.edit;
          setOffered((prev) => [{ id: "locked", draft: stranded, reason: "locked" }, ...prev.filter((o) => o.id !== "locked")]);
        }
        setDirty(hasUnsaved(versions.current));
        if (first && keys) {
          // Typing left over from an earlier visit joins the offered list, apart
          // from this visit's own slot, so nothing typed now can overwrite or
          // remove it. Only Restore (once saved) or Discard lets one go.
          const store = localStore();
          // Every tab's backup of these minutes. One written moments ago
          // belongs to a tab that is probably still open: left where it is.
          const found = (store ? keysWith(store, [keys.tabsPrefix]) : []).flatMap((k) => {
            const d = readDraft(store, k);
            return d && !fromLiveTab(d, TAB_ID) ? [{ k, d }] : [];
          });
          let list = readOffered(store, keys.offered);
          for (const { d } of found) list = mergeOffered(list, draftToOffer(d, server), server);
          writeOffered(store, keys.offered, list);
          // A tab's key goes once what it held is safely in the offered list,
          // or the server already has those words.
          const stored = readOffered(store, keys.offered);
          for (const { k, d } of found) {
            if (!draftToOffer(d, server) || stored.some((o) => o.editedAt === d.editedAt)) removeDraft(store, k);
          }
          setOffered(
            list.map((d) => ({
              id: d.editedAt,
              draft: d,
              editedAt: d.editedAt,
              reason: "device" as const,
              behind: draftIsBehind(d, server),
            }))
          );
        }
      } else {
        setToast({ message: t("Those minutes could not be found."), type: "error" });
      }
    } finally {
      setBusy(false);
    }
  }, [params.id, userId, put]);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  // Any request on this page can hit a 401 (a reload, a panel, an action
  // item). Back up first; the banner brings the typing back after sign-in.
  useEffect(
    () =>
      onSignInRedirect(() => {
        const r = recordRef.current;
        if (r && hasUnsaved(versions.current)) backUp(keysRef.current, r);
      }),
    []
  );

  // "+ Add to action items" under a section: one click puts the point on the
  // register with just a name and the minuted wording. Who, when and how
  // urgent are added later on the Action Items page, so the minute-taker is
  // not pulled out of the meeting to fill in a form. Nobody is assigned, so
  // nobody is emailed.
  const captureAction = async (minutesId: string, sectionId: string, text: string) => {
    const res = await authFetch("/api/action-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: quickActionTitle(text),
        description: text,
        fromMinutesId: minutesId,
        fromSectionId: sectionId,
        notify: false,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setToast({ message: data.error || t("Could not add it to the action list."), type: "error" });
      return false;
    }
    setToast({
      message: t("Added {ref} to the action list. Add who and when later in Action Items.", { ref: data.ref }),
      type: "success",
    });
    setActionsRefresh((n) => n + 1);
    return true;
  };

  // The server's refusal from the last failed save, for the toast a manual
  // Save shows. Autosave failures stay quiet.
  const lastSaveError = useRef<string | null>(null);

  /** One PATCH of the text as it is now: the only way the page saves, for
   *  autosave, Save, save-before-acting and leaving alike. True when the
   *  server took it, which is not the same as clean: typing may have carried
   *  on meanwhile. keepalive is for a tab that is closing. */
  const sendSave = async (opts: { keepalive?: boolean } = {}): Promise<boolean> => {
    const r = recordRef.current;
    if (!r) return false;
    const version = versions.current.edit;
    const sentAt = new Date().toISOString();
    const sent = textOf(r);
    const body = JSON.stringify(savePayload(r));
    // keepalive requests share a 64KB budget; past that the backup has to do.
    if (opts.keepalive && new TextEncoder().encode(body).length >= 64_000) return false;
    setSaving(true);
    try {
      const res = await authFetch(`/api/minutes/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: opts.keepalive,
      });
      const data = await res.json().catch(() => ({}));
      // "Conflict" with exactly our words is not one: our own earlier save (a
      // retry whose first try landed) already put them there.
      const saved: MinutesDetail | null = res.ok
        ? data
        : data.conflict && data.current && sameText(data.current, sent)
          ? data.current
          : null;
      if (!saved) {
        lastSaveError.current = data.error || t("Could not save.");
        const kind = saveFailureKind(res.status);
        if (data.conflict && data.current) {
          // Somebody else saved different words first. Autosave stops; the
          // typing stays on screen and in the backup until the person chooses.
          backUp(keysRef.current, recordRef.current ?? r);
          setConflict(data.current);
          setSaveRefused(lastSaveError.current);
        } else if (kind === "transient") {
          retryAfter.current = res.headers.get("Retry-After");
          setSaveFailures((n) => n + 1);
        } else {
          // Signed out (already on the way to sign-in) or refused: retrying the
          // same text cannot help, so autosave stops.
          setSaveRefused(lastSaveError.current);
          // A refusal may mean the minutes were locked meanwhile: re-read, which
          // moves the typing to the banner. A failed re-read leaves the note up.
          if (kind === "refused") load().catch(() => {});
        }
        return false;
      }
      // What came BACK, not a re-read: a read straight after a write can serve
      // the previous copy and make a good save look like it failed. Text typed
      // while it was in flight stays and is saved next.
      versions.current.saved = version;
      const unsaved = hasUnsaved(versions.current);
      // Our own save: its textUpdatedAt is the new base. Typing since goes on
      // top, but only what changed since this save went out, so the server's
      // section ids and the Apologies section it added are kept.
      const now = recordRef.current;
      put(unsaved && now ? mergeTypingOverSave(saved, sent, textOf(now)) : saved);
      setDirty(unsaved);
      const keys = keysRef.current;
      if (!unsaved && keys) {
        // Only a backup made before this save went out holds nothing newer
        // than it. One written after (the minutes opened again since, say) stays.
        const store = localStore();
        const d = readDraft(store, keys.main);
        if (d && d.tabId === TAB_ID && d.editedAt <= sentAt) removeDraft(store, keys.main);
        const gone = restoredOffers.current;
        if (gone.size) {
          writeOffered(store, keys.offered, readOffered(store, keys.offered).filter((o) => !gone.has(o.editedAt)));
          gone.clear();
        }
      }
      lastSaveError.current = null;
      retryAfter.current = null;
      setSaveFailures(0);
      setSaveRefused(null);
      return true;
    } catch {
      // Network: worth retrying, on our own backoff (no Retry-After came).
      lastSaveError.current = t("Could not save.");
      retryAfter.current = null;
      setSaveFailures((n) => n + 1);
      return false;
    } finally {
      setSaving(false);
    }
  };

  /** Saves once, after any save already running (which sent an older copy),
   *  so two PATCHes never race. Nothing unsaved counts as success. */
  const saveOnce = async (opts: { keepalive?: boolean } = {}): Promise<boolean> => {
    while (inFlight.current) await inFlight.current;
    if (!hasUnsaved(versions.current)) return true;
    // Signing out: anything left is discarded on purpose, so nothing more goes out.
    if (isSigningOut()) return false;
    const p = sendSave(opts);
    inFlight.current = p;
    try {
      return await p;
    } finally {
      inFlight.current = null;
    }
  };

  /** A few rounds, because typing can carry on while a save is in flight.
   *  clean: everything on screen is saved. behind: every save worked but the
   *  person is still typing (autosave picks up the rest). failed: a save failed. */
  const saveUntilClean = async (): Promise<"clean" | "behind" | "failed"> => {
    for (let i = 0; i < 3; i++) {
      if (!hasUnsaved(versions.current)) return "clean";
      if (!(await saveOnce())) return "failed";
    }
    return hasUnsaved(versions.current) ? "behind" : "clean";
  };

  const saveNow = async () => {
    const result = await saveUntilClean();
    if (result === "clean") setToast({ message: t("Saved."), type: "success" });
    else if (result === "failed" && lastSaveError.current) setToast({ message: lastSaveError.current, type: "error" });
    // behind: saved, but typing is still going on; autosave follows.
  };

  // Before anything that sends, reviews or signs: those act on the SAVED copy
  // and then reload, so unsaved typing would be sent out missing.
  const ensureSaved: SaveFirst = async () => {
    // Text that can no longer change cannot be saved, so refusing would only
    // trap the user (no wet-ink upload, ever). Any typing it stranded is in
    // the banner and the backup.
    if (!textEditable) return true;
    // behind is fine: what was typed up to now is saved, and is what is sent.
    if ((await saveUntilClean()) !== "failed") return true;
    setToast({
      message: [t("Your changes could not be saved, so nothing was sent."), lastSaveError.current].filter(Boolean).join(" "),
      type: "error",
    });
    return false;
  };

  // Autosave a few seconds after the last keystroke. Carl typed a whole set of
  // minutes, sent it for checking without pressing Save, and lost all of it.
  // A failed save retries further apart each time: saveFailures changes on
  // every failure and record on every success, so the timer always re-arms.
  useEffect(() => {
    if (!dirty || !textEditable || saveRefused || conflict) return;
    const delay = saveFailures === 0 ? 3000 : retryDelayMs(saveFailures, retryAfter.current);
    const timer = setTimeout(() => {
      void saveOnce();
    }, delay);
    autosaveTimer.current = timer;
    return () => clearTimeout(timer);
    // saveOnce is recreated every render but reads only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, dirty, textEditable, saveFailures, saveRefused, conflict]);

  // Signing out with unsaved typing: one try at saving it, and only if that
  // fails, ask. Staying cancels the sign-out. 5 seconds, or up to 15 while a
  // save is still on its way; and the sign-out never goes ahead (which
  // clears the cookie) with a save still in flight.
  useEffect(
    () =>
      onBeforeSignOut(async () => {
        const r = recordRef.current;
        if (!r || !hasUnsaved(versions.current) || !isTextEditable(r.status)) return true;
        const attempt = saveUntilClean();
        const within = (ms: number) =>
          Promise.race([attempt, new Promise<"timeout">((done) => setTimeout(() => done("timeout"), ms))]);
        let result = await within(5000);
        if (result === "timeout" && inFlight.current) result = await within(10_000);
        if (result === "clean") return true;
        const leave = window.confirm(t("You have unsaved minutes. Sign out and lose them?"));
        if (leave) await inFlight.current?.catch(() => false);
        return leave;
      }),
    // Registered once; saveUntilClean reads only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Signed out in another tab: one last try at saving (5 seconds) before
  // this tab's backups are cleared. If the cookie is already gone the save's
  // 401 sends this tab to sign-in.
  useEffect(
    () =>
      onSignedOutElsewhere(async () => {
        const r = recordRef.current;
        if (!r || !hasUnsaved(versions.current) || !isTextEditable(r.status)) return;
        await Promise.race([saveUntilClean(), new Promise((done) => setTimeout(done, 5000))]);
      }),
    // Registered once; saveUntilClean reads only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Leaving by the sidebar or any in-app link fires no beforeunload. Back up
  // and save on the way out, through the same queue as autosave so it waits
  // for a save in flight instead of racing it. Best effort: the backup covers
  // a save that does not land.
  useEffect(
    () => () => {
      const r = recordRef.current;
      if (!r || !hasUnsaved(versions.current) || !isTextEditable(r.status)) return;
      // Signing out discards on purpose; a 401 has already backed up and has
      // no session to save with.
      if (isSigningOut() || isRedirectingToSignIn()) return;
      backUp(keysRef.current, r);
      void saveOnce();
    },
    // Runs once, on the way out; saveOnce reads only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // The in-page Back link saves first, and only leaves without saving if the
  // user says so.
  const back = async (e: React.MouseEvent) => {
    // A new tab or window (ctrl, cmd, shift, middle click) leaves this page as
    // it is, so the browser handles those.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!hasUnsaved(versions.current)) return;
    e.preventDefault();
    // behind: the rest goes with the save on the way out.
    if ((await saveUntilClean()) !== "failed") {
      router.push("/minutes");
    } else if (window.confirm(t("Your changes could not be saved. Leave this page anyway and lose them?"))) {
      forgetUnsaved();
      router.push("/minutes");
    }
  };

  // Closing the tab or reloading with unsaved typing: back up now rather than
  // at the next throttled write, try a keepalive save, and ask first. Not when
  // signing out (discarded on purpose) or on the way to sign-in (the prompt
  // would stop the redirect; the backup brings the text back).
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (isSigningOut()) return;
      const r = recordRef.current;
      if (r) {
        backUp(keysRef.current, r);
        // Sent at once, not queued: the tab may be gone before a save in
        // flight comes back. With the current base: if that earlier save lands
        // first, the server takes this one only if the words match, and
        // otherwise the backup has them. If the person chooses to stay, the
        // timer is cancelled and later saves queue behind this one as usual.
        if (isTextEditable(r.status) && !isRedirectingToSignIn() && hasUnsaved(versions.current)) {
          if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
          const p = sendSave({ keepalive: true });
          if (!inFlight.current) {
            inFlight.current = p;
            void p.finally(() => {
              if (inFlight.current === p) inFlight.current = null;
            });
          }
        }
      }
      if (isRedirectingToSignIn()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
    // saveOnce reads only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  // Returns an error message to keep the dialog open, per DangerConfirmModal.
  const remove = async (typed: string) => {
    if (!record) return;
    const res = await authFetch(`/api/minutes/${record.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: typed }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return data.error || t("Could not delete.");
    forgetUnsaved({ offered: true });
    router.push("/minutes");
  };

  if (loading || !session) return null;
  // Only the first load: a reload after an action must not unmount the editor
  // under someone who is typing.
  if (busy && !record) return <div className="p-6 text-gray-400">{t("Loading...")}</div>;
  if (!record) return <div className="p-6 text-gray-400">{t("Not found.")}</div>;

  const patch = (u: Partial<MinutesDetail>) => {
    versions.current.edit += 1;
    if (recordRef.current) put({ ...recordRef.current, ...u });
    setDirty(true);
    // A fresh edit is a fresh start: the normal 3 second autosave again.
    setSaveRefused(null);
    setSaveFailures(0);
    retryAfter.current = null;
    // Back up at most once a second while typing.
    if (!backupTimer.current) {
      backupTimer.current = setTimeout(() => {
        backupTimer.current = null;
        if (recordRef.current && hasUnsaved(versions.current)) backUp(keysRef.current, recordRef.current);
      }, 1000);
    }
  };

  const restoreOffered = (item: OfferedItem) => {
    if (item.behind && !window.confirm(t("This replaces the newer saved text with the backup. Restore it anyway?"))) {
      return;
    }
    if (item.reason === "device" && item.editedAt) restoredOffers.current.add(item.editedAt);
    patch(textOf(item.draft) as Partial<MinutesDetail>);
    setOffered((prev) => prev.filter((o) => o.id !== item.id));
  };
  const discardOffered = (item: OfferedItem) => {
    const keys = keysRef.current;
    const store = localStore();
    if (keys && item.reason === "device") {
      writeOffered(store, keys.offered, readOffered(store, keys.offered).filter((o) => o.editedAt !== item.editedAt));
    } else if (keys) {
      removeDraft(store, keys.main);
    }
    setOffered((prev) => prev.filter((o) => o.id !== item.id));
  };
  // The clipboard API is missing on plain http and in some browsers; the old
  // execCommand route still works there. Failing both, select the text so a
  // Ctrl+C is all that is left to do.
  const copyText = async (text: string, boxId: string): Promise<boolean> => {
    const copied = () => {
      setToast({ message: t("Copied."), type: "success" });
      return true;
    };
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return copied();
      }
    } catch {
      // Refused: try the old way.
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (ok) return copied();
    } catch {
      // Fall through to selecting the text.
    }
    setToast({ message: t("Could not copy. Select the text and copy it by hand."), type: "error" });
    const box = boxId ? document.getElementById(boxId) : null;
    const selection = window.getSelection();
    if (box && selection) {
      const range = document.createRange();
      range.selectNodeContents(box);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    return false;
  };
  // The unsaved text as plain words, to read and copy.
  const offeredText = (d: MinutesText) => plainText(d, t);

  // The three ways out of a conflict. None loses anybody's words.
  const keepTheirs = async () => {
    if (!conflict || !recordRef.current) return;
    const mine = recordRef.current;
    await copyText(offeredText(mine), "");
    // Kept as an offered backup as well, in case the copy did not take.
    const keys = keysRef.current;
    const store = localStore();
    const kept = { ...textOf(mine), editedAt: new Date().toISOString(), baseUpdatedAt: textBase(mine), tabId: TAB_ID };
    if (keys) writeOffered(store, keys.offered, mergeOffered(readOffered(store, keys.offered), kept, conflict));
    setOffered((prev) => [{ id: kept.editedAt, draft: kept, editedAt: kept.editedAt, reason: "device" }, ...prev]);
    forgetUnsaved();
    put(conflict);
    setConflict(null);
    setSaveRefused(null);
  };
  const overwriteWithMine = () => {
    if (!conflict || !recordRef.current) return;
    if (!window.confirm(t("This replaces their saved changes with yours. Overwrite them?"))) return;
    // Their record with my words, based on THEIR text now, so the save goes through.
    put({ ...conflict, ...textOf(recordRef.current) } as MinutesDetail);
    setConflict(null);
    setSaveRefused(null);
    void saveOnce();
  };

  return (
    <div className="p-6 max-w-4xl">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      <Link href="/minutes" onClick={back} className="text-sm text-gray-500 hover:text-primary">
        {t("Back to all minutes")}
      </Link>

      <div className="mt-2 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark">{record.title}</h1>
          <p className="text-gray-500 mt-1">
            {t(MEETING_BODY_LABELS[record.body])} ·{" "}
            {record.meetingDate ? `${formatMeetingDate(record.meetingDate)} · ` : ""}
            {formatPeriod(record.period)} ·{" "}
            {t(MINUTES_STATUS_LABELS[record.status])}
            {record.draftNumber > 0 && " · " + t("Draft {n}", { n: record.draftNumber })}
          </p>
          {record.lastEditedBy && record.lastEditedAt && (
            <p className="text-xs text-gray-400 mt-1">
              {t("Last edited by {name} at {time}", {
                name: record.lastEditedBy.name,
                time: new Date(record.lastEditedAt).toLocaleString("en-ZA", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {textEditable && dirty && !saving && (saveRefused || saveFailures > 0) && (
            <span className="text-sm text-risk-high">
              {saveRefused ? t("Not saved: {error}", { error: saveRefused }) : t("Not saved, retrying...")}
            </span>
          )}
          <TranslateContentButton kind="minutes" id={record.id} />
          <DownloadLink
            href={`/api/minutes/${record.id}/docx`}
            filename={`${record.title}.docx`}
            className="px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors"
            onError={(message) => setToast({ message, type: "error" })}
          >
            {t("Download as Word")}
          </DownloadLink>
          {textEditable && (
            <button
              onClick={() => void saveNow()}
              disabled={saving || !dirty}
              className="bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
            >
              {saving ? t("Saving...") : dirty ? t("Save changes") : t("Saved")}
            </button>
          )}
        </div>
      </div>

      {locked && (
        <div className="mb-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {record.signedAt
            ? t("These minutes have been signed on {date}.", {
                date: new Date(record.signedAt).toLocaleDateString("en-ZA", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                }),
              })
            : t("These minutes have been signed.")}{" "}
          {t("A signed record cannot be changed. If something needs correcting, record it in the next set of minutes.")}
        </div>
      )}

      {conflict && canManage && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-risk-high">
          <p className="font-medium">{t("Someone else saved changes to these minutes while you were editing.")}</p>
          <p className="mt-1 text-gray-700">{t("Your version is in the editor below. Theirs:")}</p>
          <pre
            id="conflict-theirs"
            className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-red-200 bg-white p-3 font-sans text-gray-700"
          >
            {offeredText(conflict)}
          </pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => void keepTheirs()}
              className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
            >
              {t("Use theirs (copy mine first)")}
            </button>
            <button
              onClick={() => record && void copyText(offeredText(record), "")}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm text-gray-700 transition-colors"
            >
              {t("Copy mine")}
            </button>
            <button
              onClick={overwriteWithMine}
              className="px-4 py-2 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-sm transition-colors"
            >
              {t("Overwrite with mine")}
            </button>
          </div>
        </div>
      )}

      {canManage &&
        offered.map((item, i) => (
          <div key={item.id} className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p>
              {item.reason === "locked"
                ? t("These minutes were locked before your latest changes were saved, so those changes could not be saved. They are still shown below: copy anything you need before you leave this page.")
                : t("You have unsaved changes from {time} on this device.", {
                    time: new Date(item.editedAt ?? "").toLocaleString("en-ZA"),
                  })}
            </p>
            {item.behind && (
              <p className="mt-1">{t("These minutes have been changed since this backup was made, by someone else or on another device. Restoring it would replace the newer saved text.")}</p>
            )}
            {item.reason === "device" && !textEditable && (
              <p className="mt-1">{t("These minutes can no longer be edited, so they cannot be put back. Copy anything you need.")}</p>
            )}
            <pre
              id={`offered-${i}`}
              className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-amber-200 bg-white p-3 font-sans text-gray-700"
            >
              {offeredText(item.draft)}
            </pre>
            <div className="mt-3 flex flex-wrap gap-2">
              {item.reason === "device" && textEditable && (
                <button
                  onClick={() => restoreOffered(item)}
                  className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                >
                  {t("Restore them")}
                </button>
              )}
              <button
                onClick={() => void copyText(offeredText(item.draft), `offered-${i}`)}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm transition-colors"
              >
                {t("Copy")}
              </button>
              <button
                onClick={() => discardOffered(item)}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm transition-colors"
              >
                {t("Discard")}
              </button>
            </div>
          </div>
        ))}

      {record.original && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
          <span className="text-gray-500">{t("Uploaded file:")} </span>
          <DownloadLink
            href={`/api/minutes/${record.id}/file`}
            filename={record.original.filename}
            className="text-primary hover:underline font-medium"
            onError={(message) => setToast({ message, type: "error" })}
          >
            {record.original.filename}
          </DownloadLink>
          <span className="text-gray-400">
            {" "}
            ({(record.original.size / 1024).toFixed(0)}KB)
          </span>
        </div>
      )}

      {signingOpen && canManage && (
        <div className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t("These minutes are out for signing, so the text is locked: everyone must sign the same words. If something needs changing, delete these minutes and start them again, or record the correction in the next set.")}
        </div>
      )}

      {textEditable && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("Name")}</label>
              <input
                value={record.title}
                onChange={(e) => patch({ title: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("Meeting")}</label>
              <select
                value={record.body}
                onChange={(e) => patch({ body: e.target.value as MeetingBody })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
              >
                {Object.entries(MEETING_BODY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {t(v)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="max-w-xs">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("Meeting date")}</label>
            <input
              type="date"
              value={record.meetingDate ?? ""}
              onChange={(e) => e.target.value && patch({ meetingDate: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
            />
          </div>
          <PeriodPicker value={record.period} onChange={(p) => patch({ period: p })} />
        </div>
      )}

      <MinutesSectionEditor
        sections={record.sections}
        editable={textEditable}
        onChange={(sections) => patch({ sections })}
        onCaptureAction={canRaiseActions ? (sectionId, text) => captureAction(record.id, sectionId, text) : undefined}
      />

      <MinutesSigningPanel
        id={record.id}
        status={record.status}
        signatories={record.signatories}
        signedCopy={record.signedCopy}
        currentHash={record.documentHash}
        currentRef={record.documentRef}
        canManage={canManage}
        myEmail={session.email}
        onChanged={load}
        onToast={(message, type) => setToast({ message, type })}
        ensureSaved={ensureSaved}
      />

      {/* 🔴 Above signing, and NOT gated on the minutes being editable.
          Actions come out of a meeting that has been held, and a signed set of
          minutes is the most authoritative statement of what was agreed - so
          raising one from signed minutes is the normal case, not an edge one. */}
      <MinutesActionsPanel
        id={record.id}
        sections={record.sections}
        canRaise={canRaiseActions}
        onToast={(message, type) => setToast({ message, type })}
        refreshKey={actionsRefresh}
      />

      <MinutesDistributePanel
        id={record.id}
        distributions={record.distributions}
        canManage={canManage}
        onChanged={load}
        onToast={(message, type) => setToast({ message, type })}
        ensureSaved={ensureSaved}
      />

      <MinutesReviewPanel
        id={record.id}
        status={record.status}
        draftNumber={record.draftNumber}
        reviewers={record.reviewers}
        reviews={record.reviews}
        canManage={canManage}
        myEmail={session.email}
        onChanged={load}
        onToast={(message, type) => setToast({ message, type })}
        ensureSaved={ensureSaved}
      />

      {record.reviews.length > 0 && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-dark mb-3">{t("Review history")}</h2>
          <ul className="space-y-3">
            {record.reviews.map((r, i) => (
              <li key={i} className="text-sm border-l-2 border-gray-200 pl-3">
                <span className="text-dark font-medium">{r.byName}</span>{" "}
                <span className="text-gray-500">
                  {r.decision === "approved"
                    ? t("approved draft {n} on {date}", { n: r.draftNumber, date: new Date(r.at).toLocaleDateString("en-ZA") })
                    : t("asked for changes to draft {n} on {date}", { n: r.draftNumber, date: new Date(r.at).toLocaleDateString("en-ZA") })}
                </span>
                {r.draftNumber < record.draftNumber && (
                  <span className="ml-2 text-xs text-gray-400">{t("(an earlier draft)")}</span>
                )}
                {r.comments && <p className="text-gray-600 mt-1">{r.comments}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Any stage short of signed, not only a draft: minutes stuck out for
          checking or half signed are exactly the ones somebody wants gone.
          Signed minutes are refused by the server as the school's record. */}
      {editable && (
        <div className="mt-8 rounded-xl border border-risk-high/30 p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-risk-high">{t("Danger zone")}</h2>
            <p className="text-sm text-gray-500 mt-1">
              {t("Deletes these minutes, the uploaded file and any signatures collected so far. Action items raised from them stay in the action register.")}
            </p>
          </div>
          <button
            onClick={() => setConfirmingDelete(true)}
            className="bg-risk-high hover:opacity-90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-opacity"
          >
            {t("Delete minutes")}
          </button>
        </div>
      )}

      {confirmingDelete && (
        <DangerConfirmModal
          title={t("Delete minutes")}
          itemName={record.title}
          actionLabel={t("Delete minutes")}
          onClose={() => setConfirmingDelete(false)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}
