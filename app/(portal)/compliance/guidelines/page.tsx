"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import FileUpload from "@/components/FileUpload";
import Toast from "@/components/Toast";

interface GuidelineRecord {
  id: string;
  name: string;
  description: string;
  source: string;
  filename: string;
  uploadedAt: string;
  size: number;
}

export default function GuidelinesPage() {
  const { session, loading } = useAuth("manage_guidelines");
  const [guidelines, setGuidelines] = useState<GuidelineRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("GDE");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const fetchGuidelines = useCallback(async () => {
    const res = await authFetch("/api/guidelines");
    if (res.ok) setGuidelines(await res.json());
  }, []);

  useEffect(() => {
    if (session) fetchGuidelines();
  }, [session, fetchGuidelines]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setSubmitting(true);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("description", description);
    formData.append("source", source);
    formData.append("file", file);

    const res = await authFetch("/api/guidelines", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      setToast({ message: "Guideline uploaded", type: "success" });
      setShowForm(false);
      setName("");
      setDescription("");
      setFile(null);
      fetchGuidelines();
    } else {
      setToast({ message: "Upload failed", type: "error" });
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this guideline?")) return;
    const res = await authFetch(`/api/guidelines/${id}`, { method: "DELETE" });
    if (res.ok) {
      setToast({ message: "Guideline deleted", type: "success" });
      fetchGuidelines();
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">Guidelines</h1>
          <p className="text-gray-500 text-sm">
            GDE/DoE/BELA guideline documents used for compliance checks
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Upload Guideline
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6 max-w-2xl">
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Guideline Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. GDE Circular 12/2024 - Financial Management"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              >
                <option value="GDE">GDE (Gauteng Dept of Education)</option>
                <option value="DoE">DoE (National Dept of Education)</option>
                <option value="SASA">SASA (SA Schools Act)</option>
                <option value="BELA">BELA (Basic Education Laws Amendment Act)</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <FileUpload onChange={setFile} value={file} label="Upload guideline document" />
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting || !file}
                className="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {submitting ? "Uploading..." : "Upload"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-6 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Name</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Source</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">File</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Uploaded</th>
              <th className="text-right px-6 py-3 font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {guidelines.map((g) => (
              <tr key={g.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-6 py-4">
                  <p className="font-medium">{g.name}</p>
                  {g.description && (
                    <p className="text-xs text-gray-400 mt-1">{g.description}</p>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className="bg-primary/10 text-primary-dark px-2 py-1 rounded text-xs">
                    {g.source}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-500 text-xs">{g.filename}</td>
                <td className="px-6 py-4 text-gray-500 text-xs">
                  {new Date(g.uploadedAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => handleDelete(g.id)}
                    className="text-risk-high hover:text-red-700 text-xs font-medium"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {guidelines.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                  No guidelines uploaded. Upload GDE/DoE/BELA documents to enable compliance checking.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
