"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import FileUpload from "@/components/FileUpload";
import ComplianceScore from "@/components/ComplianceScore";
import Toast from "@/components/Toast";
import Link from "next/link";

interface DocRecord {
  id: string;
  name: string;
  description: string;
  filename: string;
  uploadedAt: string;
  lastCheckScore: number | null;
}

export default function DocumentsPage() {
  const { session, loading } = useAuth("check_documents");
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const fetchDocs = useCallback(async () => {
    const res = await authFetch("/api/documents");
    if (res.ok) setDocs(await res.json());
  }, []);

  useEffect(() => {
    if (session) fetchDocs();
  }, [session, fetchDocs]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setSubmitting(true);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("description", description);
    formData.append("file", file);

    const res = await authFetch("/api/documents", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      await res.json();
      setToast({ message: "Document uploaded", type: "success" });
      setShowUpload(false);
      setName("");
      setDescription("");
      setFile(null);
      fetchDocs();
    } else {
      setToast({ message: "Upload failed", type: "error" });
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    const res = await authFetch(`/api/documents/${id}`, { method: "DELETE" });
    if (res.ok) {
      setToast({ message: "Document deleted", type: "success" });
      fetchDocs();
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">Document Checker</h1>
          <p className="text-gray-500 text-sm">
            Upload and check non-policy documents for compliance
          </p>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Upload Document
        </button>
      </div>

      {showUpload && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6 max-w-2xl">
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Document Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
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
            <FileUpload onChange={setFile} value={file} label="Upload document" />
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting || !file}
                className="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {submitting ? "Uploading..." : "Upload & Save"}
              </button>
              <button
                type="button"
                onClick={() => setShowUpload(false)}
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
              <th className="text-left px-6 py-3 font-medium text-gray-500">Document</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Uploaded</th>
              <th className="text-center px-6 py-3 font-medium text-gray-500">Last Score</th>
              <th className="text-right px-6 py-3 font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((doc) => (
              <tr key={doc.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-6 py-4">
                  <Link
                    href={`/documents/results/${doc.id}`}
                    className="font-medium hover:text-primary"
                  >
                    {doc.name}
                  </Link>
                  {doc.description && (
                    <p className="text-xs text-gray-400 mt-1">{doc.description}</p>
                  )}
                </td>
                <td className="px-6 py-4 text-gray-500 text-xs">
                  {new Date(doc.uploadedAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 flex justify-center">
                  {doc.lastCheckScore !== null ? (
                    <ComplianceScore score={doc.lastCheckScore} size="sm" />
                  ) : (
                    <span className="text-xs text-gray-400">Not checked</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/documents/results/${doc.id}`}
                    className="text-primary hover:text-primary-dark text-xs font-medium mr-3"
                  >
                    View
                  </Link>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="text-risk-high hover:text-red-700 text-xs font-medium"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {docs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                  No documents uploaded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
