"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback, Fragment } from "react";
import Toast from "@/components/Toast";
import { useT } from "@/components/I18nProvider";
import { TAG_COLORS, TAG_COLOR_CLASSES } from "@/lib/tags";

interface TagRecord {
  id: string;
  name: string;
  description: string;
  color: string;
  memberCount: number;
}

interface TagMember {
  key: string;
  userId?: string;
  personId?: string;
  name: string;
  email: string;
  source: "user" | "person";
}

export default function TagsPage() {
  const t = useT();
  const { session, loading } = useAuth("manage_tags");
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [members, setMembers] = useState<Record<string, TagMember[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<TagRecord | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    color: "slate",
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const fetchTags = useCallback(async () => {
    const res = await authFetch("/api/tags");
    if (res.ok) setTags(await res.json());
  }, []);

  useEffect(() => {
    if (session) fetchTags();
  }, [session, fetchTags]);

  const toggleMembers = async (tagId: string) => {
    if (expanded === tagId) {
      setExpanded(null);
      return;
    }
    setExpanded(tagId);
    if (!members[tagId]) {
      const res = await authFetch(`/api/tags/${tagId}`);
      if (res.ok) {
        const list = await res.json();
        setMembers((prev) => ({ ...prev, [tagId]: list }));
      }
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "", color: "slate" });
    setShowModal(true);
  };

  const openEdit = (tag: TagRecord) => {
    setEditing(tag);
    setForm({
      name: tag.name,
      description: tag.description,
      color: tag.color,
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setToast({ message: t("A tag needs a name"), type: "error" });
      return;
    }
    setSaving(true);
    const res = await authFetch(
      editing ? `/api/tags/${editing.id}` : "/api/tags",
      {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }
    );
    setSaving(false);
    if (res.ok) {
      setShowModal(false);
      setToast({ message: editing ? t("Tag updated") : t("Tag created"), type: "success" });
      setMembers({});
      fetchTags();
    } else {
      const err = await res.json().catch(() => ({}));
      setToast({ message: err.error || t("Could not save the tag"), type: "error" });
    }
  };

  const remove = async (tag: TagRecord) => {
    if (
      !confirm(
        tag.memberCount === 1
          ? t("Delete the \"{name}\" tag? It will be removed from {count} person.", { name: tag.name, count: tag.memberCount })
          : t("Delete the \"{name}\" tag? It will be removed from {count} people.", { name: tag.name, count: tag.memberCount })
      )
    ) {
      return;
    }
    const res = await authFetch(`/api/tags/${tag.id}`, { method: "DELETE" });
    if (res.ok) {
      setToast({ message: t("Deleted \"{name}\"", { name: tag.name }), type: "success" });
      fetchTags();
    } else {
      const err = await res.json().catch(() => ({}));
      setToast({
        message: err.error || t("Could not delete the tag"),
        type: "error",
      });
    }
  };

  if (loading) return <div className="p-6">{t("Loading...")}</div>;

  return (
    <div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("Tags")}</h1>
          <p className="text-gray-500 text-sm">
            {t("Name a group of individuals, then use it to decide who approves what")}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {t("+ Add Tag")}
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6 text-sm text-blue-900">
        {t("A tag can be put on a")} <strong>{t("user")}</strong>{" "}
        {t("(someone who signs in) from Admin > Users, or on a")}{" "}
        <strong>{t("person")}</strong>{" "}
        {t("on the school register from Admin > People. Tag the finance committee as FINCOM, then in Fund Application Approval Settings say that amounts over R10 000 need FINCOM approval. Only someone with a login can click Approve.")}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-500">
                {t("Tag")}
              </th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">
                {t("Description")}
              </th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">
                {t("People")}
              </th>
              <th className="text-right px-6 py-3 font-medium text-gray-500">
                {t("Actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {tags.map((tag) => (
              <Fragment key={tag.id}>
                <tr className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        TAG_COLOR_CLASSES[tag.color] || TAG_COLOR_CLASSES.slate
                      }`}
                    >
                      {tag.name}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600 text-xs">
                    {tag.description || "-"}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => toggleMembers(tag.id)}
                      className="text-primary hover:underline text-xs font-medium"
                    >
                      {tag.memberCount}{" "}
                      {tag.memberCount === 1 ? t("person") : t("people")}
                      {expanded === tag.id ? " ▲" : " ▼"}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => openEdit(tag)}
                      className="text-primary hover:text-primary-dark mr-3 text-xs font-medium"
                    >
                      {t("Edit")}
                    </button>
                    <button
                      onClick={() => remove(tag)}
                      className="text-risk-high hover:text-red-700 text-xs font-medium"
                    >
                      {t("Delete")}
                    </button>
                  </td>
                </tr>
                {expanded === tag.id && (
                  <tr className="bg-gray-50/60">
                    <td colSpan={4} className="px-6 py-3">
                      {members[tag.id]?.length ? (
                        <ul className="text-xs text-gray-600 space-y-1">
                          {members[tag.id].map((m) => (
                            <li key={m.key}>
                              {m.name}{" "}
                              <span className="text-gray-400">
                                {m.email || t("no email")} &middot;{" "}
                                {m.userId ? t("can approve") : t("no login, email only")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-gray-400 italic">
                          {t("Nobody carries this tag yet. Add it from Admin > Users or Admin > People.")}
                        </p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {tags.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                  {t("No tags yet.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-dark">
                {editing ? t("Edit tag") : t("New tag")}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("Name")}
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="FINCOM"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("Description")}
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="Finance Committee"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t("Colour")}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {TAG_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, color: c })}
                      className={`px-3 py-1 rounded text-xs font-medium ${
                        TAG_COLOR_CLASSES[c]
                      } ${form.color === c ? "ring-2 ring-primary" : ""}`}
                    >
                      {form.name || t("Tag")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium"
              >
                {t("Cancel")}
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="bg-primary hover:bg-primary-dark disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                {saving ? t("Saving...") : t("Save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
