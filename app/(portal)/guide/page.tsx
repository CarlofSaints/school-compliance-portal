"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback, useRef } from "react";
import Toast from "@/components/Toast";
import { useLocale, useT } from "@/components/I18nProvider";

interface HandbookMeta {
  uploadedAt: string;
  uploadedByName: string;
  bytes: number;
  title: string;
}

// Runs INSIDE the guide frame (sandboxed, opaque origin):
// - "#ch07" contents links: Chrome blocks the frame navigating its own blob: URL,
//   so it scrolls the frame itself (not scrollIntoView, which nudges the portal).
// - "Watch how" .mp4 links play in a box over the guide with a big Close button,
//   not a new tab: people who rarely use a browser don't find their way back.
// String.raw: written as plain JS, no double escaping.
const GUIDE_FRAME_SCRIPT = String.raw`(function () {
  var CLOSE = __CLOSE__;
  var opener = null;
  function shut() {
    var o = document.getElementById("clip-box");
    if (o) o.remove();
    if (opener) opener.focus();
    opener = null;
  }
  function play(src, from) {
    shut();
    opener = from;
    var o = document.createElement("div");
    o.id = "clip-box";
    o.setAttribute("role", "dialog");
    o.setAttribute("aria-modal", "true");
    o.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;gap:12px";
    var b = document.createElement("button");
    b.textContent = "\u2715 " + CLOSE;
    b.style.cssText = "font:600 16px system-ui,sans-serif;padding:10px 20px;border-radius:999px;border:0;background:#fff;color:#111;cursor:pointer";
    b.onclick = shut;
    var v = document.createElement("video");
    v.src = src;
    v.controls = true;
    v.playsInline = true;
    v.style.cssText = "max-width:100%;max-height:80vh;border-radius:8px;background:#000";
    // A clip that cannot load must not leave a black box: close it again.
    v.onerror = shut;
    o.onclick = function (e) { if (e.target === o) shut(); };
    o.appendChild(b);
    o.appendChild(v);
    document.body.appendChild(o);
    b.focus();
    // Started inside the click, so autoplay rules allow it; a refusal just leaves it paused.
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") shut(); });
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    var h = a.getAttribute("href");
    if (/\.mp4([?#]|$)/i.test(h)) { e.preventDefault(); play(a.href, a); return; }
    if (h.charAt(0) !== "#") return;
    var id = h.slice(1);
    try { id = decodeURIComponent(id); } catch (err) {}
    if (id === "" || id === "top") { e.preventDefault(); window.scrollTo(0, 0); return; }
    var el = document.getElementById(id) || document.getElementsByName(id)[0];
    if (el) { e.preventDefault(); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY); }
  });
})();`;

export default function GuidePage() {
  const t = useT();
  // The standard guide comes back in the reader's language, so a switch reloads it.
  const locale = useLocale();
  // Login only. The guide explains the portal to the people using it.
  const { session, loading } = useAuth();
  const [meta, setMeta] = useState<HandbookMeta | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">(
    "loading"
  );
  // True when the school has published nothing and is reading the standard
  // guide. It still RENDERS - every school needs a guide - but it says whose
  // document it is, so nobody mistakes ours for one their school wrote.
  const [standard, setStandard] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canPublish = session?.permissions.includes("manage_policies");

  // The guide is handed to the iframe as a blob URL rather than through srcDoc.
  //
  // A srcDoc document has no URL of its own, so its links resolve against the
  // page hosting it: clicking a chapter in the contents rail navigated the
  // frame to /guide and loaded the whole portal inside itself. A blob URL is a
  // real document address, so "#chapter-03" jumps to the chapter, which is the
  // only way the rail is any use.
  //
  // data-theme="light" is forced on the wrapper. The guide follows the reader's
  // system theme, which is right when it stands alone, but the portal around it
  // is light only, and a dark slab in a light page reads as broken rather than
  // as a preference. Printing forces the light palette regardless.
  const [docUrl, setDocUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!html) {
      setDocUrl(null);
      return;
    }
    // The sandbox (no allow-same-origin) gives the frame an opaque origin, and
    // Chrome will not let it navigate its own blob: URL, so "#ch07" did nothing.
    // Scroll the frame to the target instead (scrollIntoView would also nudge the
    // portal page around it); uploaded guides with "#..." links get it too.
    // "Watch how" clips play in a box over the guide (GUIDE_FRAME_SCRIPT).
    const close = JSON.stringify(t("Close")).replace(/</g, "\\u003c");
    const jump = `<script>${GUIDE_FRAME_SCRIPT.replace("__CLOSE__", close)}</script>`;
    const doc = `<!doctype html><html lang="${locale}" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0">${html}${jump}</body></html>`;
    const url = URL.createObjectURL(new Blob([doc], { type: "text/html" }));
    setDocUrl(url);
    // Revoked when the guide is replaced or the page is left, or every publish
    // would leak a couple of megabytes for the life of the tab.
    return () => URL.revokeObjectURL(url);
  }, [html, locale, t]);

  const load = useCallback(async () => {
    setState("loading");
    const res = await authFetch("/api/handbook", { cache: "no-store" });
    if (res.status === 404) {
      // No longer reached: the API serves the standard guide instead. Kept so a
      // future change that can 404 does not fall through to a blank screen.
      setHtml(null);
      setMeta(null);
      setState("empty");
      return;
    }
    if (!res.ok) {
      setState("error");
      return;
    }
    const data = await res.json();
    setHtml(data.html);
    setMeta(data.meta);
    setStandard(!!data.standard);
    setState("ready");
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load, locale]);

  const publish = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const body = new FormData();
    body.append("guide", file);
    const res = await authFetch("/api/handbook", { method: "POST", body });
    if (res.ok) {
      setToast({ message: t("The guide has been published."), type: "success" });
      await load();
    } else {
      const err = await res.json().catch(() => ({}));
      setToast({
        message: err.error || t("That guide could not be published."),
        type: "error",
      });
    }
    if (fileRef.current) fileRef.current.value = "";
    setUploading(false);
  };

  if (loading) return <div className="p-6">{t("Loading...")}</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      <div className="flex items-start justify-between gap-4 mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-dark">{meta?.title || t("Guide")}</h1>
          <p className="text-gray-500 text-sm">
            {meta
              ? t("Published {date} by {name}", { date: new Date(meta.uploadedAt).toLocaleDateString(), name: meta.uploadedByName })
              : standard
                ? t("The standard guide. Publish your own to replace it.")
                : t("How to use the portal")}
          </p>
        </div>
        {canPublish && (
          <div className="shrink-0">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {uploading ? t("Publishing...") : meta ? t("Replace the guide") : t("Publish a guide")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".html,.htm"
              className="hidden"
              onChange={(e) => publish(e.target.files?.[0])}
            />
          </div>
        )}
      </div>

      {state === "loading" && (
        <p className="text-sm text-gray-500">{t("Loading the guide...")}</p>
      )}

      {state === "error" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
          <p className="text-sm text-gray-500">{t("The guide could not be loaded.")}</p>
          <button onClick={load} className="mt-3 text-primary text-sm hover:underline">
            {t("Try again")}
          </button>
        </div>
      )}

      {state === "empty" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
          <p className="text-sm text-gray-500">
            {t("No guide has been published yet.")}
          </p>
          {canPublish && (
            <p className="text-xs text-gray-400 mt-2">
              {t("Use \u201cPublish a guide\u201d above to upload one.")}
            </p>
          )}
        </div>
      )}

      {state === "ready" && html && (
        // A sandboxed iframe rather than injecting the markup into this page.
        // The guide brings its own complete stylesheet, including element rules
        // for body, h1 and table; dropped into the portal it would restyle the
        // sidebar around it. srcDoc keeps it in its own document, and its own
        // "Save as PDF" button prints the frame.
        //
        // 🔴 NEVER add allow-same-origin here. With it AND allow-scripts, the
        // uploaded file runs as the portal itself: it can read the signed-in
        // session from localStorage and call every API as whoever opened the
        // page. Anyone with manage_policies can publish a guide, so that was
        // a way to act as a Super Admin. Without it the guide's own scripts
        // (contents, print button) still run, in an origin of their own.
        <iframe
          title={meta?.title || t("Guide")}
          src={docUrl ?? undefined}
          sandbox="allow-scripts allow-modals allow-popups"
          // Fullscreen and autoplay for the clip box; neither loosens the origin sandbox.
          allow="fullscreen; autoplay"
          className="flex-1 w-full rounded-xl border border-gray-200 bg-white min-h-0"
        />
      )}
    </div>
  );
}
