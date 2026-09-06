"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth, authFetch } from "@/lib/useAuth";
import Toast from "@/components/Toast";
import TemplateEditor from "@/components/TemplateEditor";
import MinutesRecipientSettings from "@/components/MinutesRecipientSettings";
import {
  MEETING_BODY_LABELS,
  STARTER_TEMPLATE,
  type MinutesTemplate,
  type TemplateSection,
} from "@/lib/minutes";

interface PersonRow {
  id: string;
  name: string;
  surname?: string;
  position?: string;
}

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());
}

export default function MinutesAdminPage() {
  const { session, loading } = useAuth(["manage_minutes", "manage_users"]);

  const [templates, setTemplates] = useState<MinutesTemplate[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [editing, setEditing] = useState<MinutesTemplate | null>(null);
  const [tab, setTab] = useState<"templates" | "recipients">("templates");
  const [busy, setBusy] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [t, p] = await Promise.all([
        authFetch("/api/minutes-templates"),
        authFetch("/api/people"),
      ]);
      if (t.ok) setTemplates(await t.json());
      if (p.ok) {
        const rows = await p.json();
        setPeople(Array.isArray(rows) ? rows : rows.people || []);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  if (loading || !session) return null;

  const blank = (sections: Omit<TemplateSection, "id" | "order">[] = []): MinutesTemplate => ({
    id: "",
    name: "",
    body: "sgb",
    sections: sections.map((s, i) => ({ ...s, id: newId(), order: i + 1 })),
    createdAt: "",
    createdBy: session.email,
    updatedAt: "",
  });

  const save = async (t: MinutesTemplate) => {
    const isNew = !t.id;
    const res = await authFetch(
      isNew ? "/api/minutes-templates" : `/api/minutes-templates/${t.id}`,
      {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: t.name,
          body: t.body,
          description: t.description,
          sections: t.sections,
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setToast({ message: data.error || "Could not save the template.", type: "error" });
      return;
    }
    setToast({ message: `Saved "${data.name}".`, type: "success" });
    setEditing(null);
    load();
  };

  const remove = async (t: MinutesTemplate) => {
    const res = await authFetch(`/api/minutes-templates/${t.id}`, { method: "DELETE" });
    if (!res.ok) {
      setToast({ message: "Could not delete the template.", type: "error" });
      return;
    }
    setToast({ message: `Deleted "${t.name}".`, type: "success" });
    setEditing(null);
    load();
  };

  return (
    <div className="p-6 max-w-4xl">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark">Minutes admin</h1>
          <p className="text-gray-500 mt-1">
            Build the templates your secretary starts from. Sections, who owns
            them, and any wording that stays the same from meeting to meeting.
          </p>
        </div>
        {!editing && tab === "templates" && (
          <button
            onClick={() => setEditing(blank())}
            className="bg-primary hover:bg-primary-dark text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Create minutes template
          </button>
        )}
      </div>

      {!editing && (
        <div className="flex gap-2 mb-5">
          {([
            ["templates", "Templates"],
            ["recipients", "Who receives minutes"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                tab === k
                  ? "bg-primary text-white border-primary"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {!editing && tab === "recipients" && (
        <MinutesRecipientSettings
          onSaved={(message) => setToast({ message, type: "success" })}
          onError={(message) => setToast({ message, type: "error" })}
        />
      )}

      {editing ? (
        <TemplateEditor
          template={editing}
          people={people}
          onChange={setEditing}
          onSave={() => save(editing)}
          onCancel={() => setEditing(null)}
          onDelete={editing.id ? () => remove(editing) : undefined}
        />
      ) : tab === "templates" ? (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Template</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 w-32">Meeting</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 w-28">Sections</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 w-24">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {templates.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-dark">{t.name}</div>
                      {t.description && (
                        <div className="text-xs text-gray-400">{t.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {t.body ? MEETING_BODY_LABELS[t.body] : "Any"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{t.sections.length}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditing(t)}
                        className="text-primary hover:text-primary-dark text-xs font-medium"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {templates.length === 0 && !busy && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                      No templates yet.
                    </td>
                  </tr>
                )}
                {busy && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                      Loading...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {templates.length === 0 && !busy && (
            // Offered rather than silently applied, so a school sees a real
            // template it can edit instead of wondering where sections came from.
            <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5">
              <p className="text-sm font-medium text-dark">
                Start from a typical SGB agenda?
              </p>
              <p className="text-sm text-gray-500 mt-1 mb-4">
                Creates a template with {STARTER_TEMPLATE.length} sections,
                including attendance and previous minutes sign off already
                filled in. Change anything you like before saving.
              </p>
              <button
                onClick={() => setEditing({ ...blank(STARTER_TEMPLATE), name: "SGB meeting" })}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Use it as a starting point
              </button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
