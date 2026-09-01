"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback, useRef } from "react";
import Toast from "@/components/Toast";

interface HandbookMeta {
  uploadedAt: string;
  uploadedByName: string;
  bytes: number;
  title: string;
}

export default function GuidePage() {
  // Login only. The guide explains the portal to the people using it.
  const { session, loading } = useAuth();
  const [meta, setMeta] = useState<HandbookMeta | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">(
    "loading"
  );
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canPublish = session?.permissions.includes("manage_policies");

  const load = useCallback(async () => {
    setState("loading");
    const res = await authFetch("/api/handbook", { cache: "no-store" });
    if (res.status === 404) {
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
    setState("ready");
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  const publish = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const body = new FormData();
    body.append("guide", file);
    const res = await authFetch("/api/handbook", { method: "POST", body });
    if (res.ok) {
      setToast({ message: "The guide has been published.", type: "success" });
      await load();
    } else {
      const err = await res.json().catch(() => ({}));
      setToast({
        message: err.error || "That guide could not be published.",
        type: "error",
      });
    }
    if (fileRef.current) fileRef.current.value = "";
    setUploading(false);
  };

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      <div className="flex items-start justify-between gap-4 mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-dark">{meta?.title || "Guide"}</h1>
          <p className="text-gray-500 text-sm">
            {meta
              ? `Published ${new Date(meta.uploadedAt).toLocaleDateString()} by ${meta.uploadedByName}`
              : "How to use the portal"}
          </p>
        </div>
        {canPublish && (
          <div className="shrink-0">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {uploading ? "Publishing..." : meta ? "Replace the guide" : "Publish a guide"}
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
        <p className="text-sm text-gray-500">Loading the guide...</p>
      )}

      {state === "error" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
          <p className="text-sm text-gray-500">The guide could not be loaded.</p>
          <button onClick={load} className="mt-3 text-primary text-sm hover:underline">
            Try again
          </button>
        </div>
      )}

      {state === "empty" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
          <p className="text-sm text-gray-500">
            No guide has been published yet.
          </p>
          {canPublish && (
            <p className="text-xs text-gray-400 mt-2">
              Use &ldquo;Publish a guide&rdquo; above to upload one.
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
        <iframe
          title={meta?.title || "Guide"}
          srcDoc={html}
          sandbox="allow-same-origin allow-scripts allow-modals allow-popups"
          className="flex-1 w-full rounded-xl border border-gray-200 bg-white min-h-0"
        />
      )}
    </div>
  );
}
